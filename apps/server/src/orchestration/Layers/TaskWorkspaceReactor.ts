import {
  CommandId,
  type OrchestrationEvent,
  type OrchestrationTask,
  TaskId,
  type VcsStatusLocalResult,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as FileSystem from "effect/FileSystem";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { GitWorkflowService } from "../../git/GitWorkflowService.ts";
import { forkParked } from "../../serverActivation.ts";
import { VcsStatusBroadcaster } from "../../vcs/VcsStatusBroadcaster.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  TaskWorkspaceReactor,
  type TaskWorkspaceReactorShape,
} from "../Services/TaskWorkspaceReactor.ts";

type WorkspaceEvent = Extract<
  OrchestrationEvent,
  {
    type:
      | "task.workspace.prepare-requested"
      | "task.workspace.preparation-started"
      | "task.workspace.remove-requested";
  }
>;

export function taskWorkspaceBranch(task: Pick<OrchestrationTask, "id" | "title">): string {
  const slug =
    task.title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "task";
  const stableId = task.id
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12)
    .toLowerCase();
  return `nebula/manual/${stableId}-${slug}`;
}

export function taskWorkspaceBaselineFailure(
  status: Pick<VcsStatusLocalResult, "isRepo" | "hasWorkingTreeChanges">,
): { readonly code: string; readonly reason: string } | null {
  if (!status.isRepo) {
    return { code: "git-required", reason: "Writable Builder Tasks require a Git repository." };
  }
  if (status.hasWorkingTreeChanges) {
    return {
      code: "dirty-source",
      reason: "Commit or stash source checkout changes before starting this Task.",
    };
  }
  return null;
}

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const fs = yield* FileSystem.FileSystem;
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const git = yield* GitWorkflowService;
  const vcsStatus = yield* VcsStatusBroadcaster;

  const commandId = (tag: string) =>
    crypto.randomUUIDv4.pipe(Effect.map((id) => CommandId.make(`server:${tag}:${id}`)));
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const dispatch = <T extends Parameters<typeof engine.dispatch>[0]>(command: T) =>
    engine.dispatch(command);

  const failWorkspace = (taskId: TaskId, failureCode: string, failureReason: string) =>
    Effect.all({ commandId: commandId("task-workspace-failed"), createdAt: now }).pipe(
      Effect.flatMap((metadata) =>
        dispatch({
          type: "task.workspace.failed",
          ...metadata,
          taskId,
          failureCode,
          failureReason,
        }),
      ),
      Effect.asVoid,
    );

  const failCleanup = (taskId: TaskId, failureCode: string, failureReason: string) =>
    Effect.all({ commandId: commandId("task-workspace-cleanup-failed"), createdAt: now }).pipe(
      Effect.flatMap((metadata) =>
        dispatch({
          type: "task.workspace.cleanup-failed",
          ...metadata,
          taskId,
          failureCode,
          failureReason,
        }),
      ),
      Effect.asVoid,
    );

  const readContext = (taskId: TaskId) =>
    snapshots.getCommandReadModel().pipe(
      Effect.map((readModel) => ({
        task: (readModel.tasks ?? []).find((candidate) => candidate.id === taskId),
        projects: readModel.projects,
        missions: readModel.missions ?? [],
      })),
    );

  const prepareRequested = Effect.fn("TaskWorkspaceReactor.prepareRequested")(function* (
    taskId: TaskId,
  ) {
    const { task, projects, missions } = yield* readContext(taskId);
    if (!task || task.workspace?.status !== "preparing") return;
    const project = projects.find((candidate) => candidate.id === task.projectId);
    if (!project || project.deletedAt !== null) {
      return yield* failWorkspace(
        taskId,
        "project-unavailable",
        "The Task project is no longer available.",
      );
    }
    const status = yield* git.localStatus({ cwd: project.workspaceRoot });
    const baselineFailure = taskWorkspaceBaselineFailure(status);
    if (baselineFailure !== null) {
      return yield* failWorkspace(taskId, baselineFailure.code, baselineFailure.reason);
    }
    const missionBase = missions.find((mission) => mission.taskIds.includes(taskId))?.baseCommit;
    const { commitSha } = yield* git.resolveCommit({
      cwd: project.workspaceRoot,
      revision: missionBase ?? "HEAD",
    });
    const createdAt = yield* now;
    yield* dispatch({
      type: "task.workspace.preparation-started",
      commandId: yield* commandId("task-workspace-preparation-started"),
      taskId,
      sourceRepository: project.workspaceRoot,
      baseCommit: commitSha,
      branch: taskWorkspaceBranch(task),
      createdAt,
    });
  });

  const preparationStarted = Effect.fn("TaskWorkspaceReactor.preparationStarted")(
    function* (input: {
      readonly taskId: TaskId;
      readonly sourceRepository: string;
      readonly baseCommit: string;
      readonly branch: string;
    }) {
      const refs = yield* git.listRefs({ cwd: input.sourceRepository });
      const existing = refs.refs.find((ref) => !ref.isRemote && ref.name === input.branch);
      let worktreePath: string;
      if (existing?.worktreePath) {
        const current = yield* git.resolveCommit({ cwd: existing.worktreePath, revision: "HEAD" });
        if (current.commitSha !== input.baseCommit) {
          return yield* failWorkspace(
            input.taskId,
            "workspace-collision",
            `Existing Task branch '${input.branch}' does not match the recorded base commit.`,
          );
        }
        worktreePath = existing.worktreePath;
      } else if (existing) {
        return yield* failWorkspace(
          input.taskId,
          "workspace-collision",
          `Task branch '${input.branch}' already exists without its expected worktree.`,
        );
      } else {
        const created = yield* git.createWorktree({
          cwd: input.sourceRepository,
          refName: input.baseCommit,
          newRefName: input.branch,
          path: null,
        });
        worktreePath = created.worktree.path;
      }
      yield* vcsStatus.refreshLocalStatus(worktreePath).pipe(Effect.ignoreCause({ log: true }));
      const current = yield* git.resolveCommit({ cwd: worktreePath, revision: "HEAD" });
      if (current.commitSha !== input.baseCommit) {
        return yield* failWorkspace(
          input.taskId,
          "baseline-mismatch",
          "Created workspace HEAD does not match the recorded base commit.",
        );
      }
      const createdAt = yield* now;
      yield* dispatch({
        type: "task.workspace.ready",
        commandId: yield* commandId("task-workspace-ready"),
        taskId: input.taskId,
        sourceRepository: input.sourceRepository,
        baseCommit: input.baseCommit,
        branch: input.branch,
        path: worktreePath,
        createdAt,
      });
    },
  );

  const removeRequested = Effect.fn("TaskWorkspaceReactor.removeRequested")(function* (
    taskId: TaskId,
  ) {
    const { task } = yield* readContext(taskId);
    const workspace = task?.workspace;
    if (
      !workspace ||
      workspace.status !== "removing" ||
      !workspace.sourceRepository ||
      !workspace.path
    )
      return;
    const exists = yield* fs.exists(workspace.path);
    if (exists) {
      const status = yield* git.localStatus({ cwd: workspace.path });
      if (status.hasWorkingTreeChanges) {
        const createdAt = yield* now;
        yield* dispatch({
          type: "task.workspace.cleanup-failed",
          commandId: yield* commandId("task-workspace-cleanup-failed"),
          taskId,
          failureCode: "dirty-workspace",
          failureReason: "Workspace has uncommitted changes. Commit or stash them before removal.",
          createdAt,
        });
        return;
      }
      yield* git.removeWorktree({ cwd: workspace.sourceRepository, path: workspace.path });
      yield* vcsStatus
        .refreshLocalStatus(workspace.sourceRepository)
        .pipe(Effect.ignoreCause({ log: true }));
    }
    const createdAt = yield* now;
    yield* dispatch({
      type: "task.workspace.removed",
      commandId: yield* commandId("task-workspace-removed"),
      taskId,
      createdAt,
    });
  });

  const process = Effect.fn("TaskWorkspaceReactor.process")(function* (event: WorkspaceEvent) {
    if (event.type === "task.workspace.prepare-requested") {
      yield* prepareRequested(event.payload.taskId);
    } else if (event.type === "task.workspace.preparation-started") {
      yield* preparationStarted(event.payload);
    } else {
      yield* removeRequested(event.payload.taskId);
    }
  });

  const processSafely = (event: WorkspaceEvent) =>
    process(event).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt;
        const failure =
          event.type === "task.workspace.remove-requested"
            ? failCleanup(
                event.payload.taskId,
                "workspace-cleanup-failed",
                "The workspace could not be removed safely. Inspect it and retry.",
              )
            : failWorkspace(
                event.payload.taskId,
                "workspace-operation-failed",
                "The workspace could not be prepared. Inspect the repository and retry.",
              );
        return failure.pipe(
          Effect.tap(() =>
            Effect.logWarning("Task workspace operation failed", { cause: Cause.pretty(cause) }),
          ),
          Effect.catchCause(() => Effect.void),
        );
      }),
    );
  const worker = yield* makeDrainableWorker(processSafely);

  const reconcile = Effect.gen(function* () {
    const readModel = yield* snapshots.getCommandReadModel();
    for (const task of readModel.tasks ?? []) {
      const workspace = task.workspace;
      if (!workspace) continue;
      if (workspace.status === "preparing") {
        if (workspace.sourceRepository && workspace.baseCommit && workspace.branch) {
          yield* preparationStarted({
            taskId: task.id,
            sourceRepository: workspace.sourceRepository,
            baseCommit: workspace.baseCommit,
            branch: workspace.branch,
          });
        } else {
          yield* failWorkspace(
            task.id,
            "preparation-interrupted",
            "Workspace preparation was interrupted before its baseline was recorded. Retry Start.",
          );
        }
      } else if (
        workspace.status === "ready" &&
        workspace.path &&
        !(yield* fs.exists(workspace.path))
      ) {
        const createdAt = yield* now;
        yield* dispatch({
          type: "task.workspace.missing",
          commandId: yield* commandId("task-workspace-missing"),
          taskId: task.id,
          failureReason: "The recorded Task worktree no longer exists on disk.",
          createdAt,
        });
      } else if (workspace.status === "removing") {
        yield* removeRequested(task.id);
      }
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Task workspace startup reconciliation failed", {
        cause: Cause.pretty(cause),
      }),
    ),
  );

  const start: TaskWorkspaceReactorShape["start"] = Effect.fn("TaskWorkspaceReactor.start")(
    function* () {
      const processEvent = (event: OrchestrationEvent) => {
        if (
          event.type === "task.workspace.prepare-requested" ||
          event.type === "task.workspace.preparation-started" ||
          event.type === "task.workspace.remove-requested"
        ) {
          return worker.enqueue(event);
        }
        return Effect.void;
      };
      yield* forkParked(Stream.runForEach(engine.streamDomainEvents, processEvent));
      yield* reconcile;
    },
  );

  return { start, drain: worker.drain } satisfies TaskWorkspaceReactorShape;
});

export const TaskWorkspaceReactorLive = Layer.effect(TaskWorkspaceReactor, make);
