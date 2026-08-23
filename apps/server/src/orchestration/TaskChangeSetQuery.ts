import {
  CheckpointRef,
  OrchestrationGetTaskChangesError,
  type OrchestrationGetTaskChangesInput,
  type OrchestrationGetTaskChangesResult,
  type OrchestrationGetTaskFileDiffInput,
  type OrchestrationGetTaskFileDiffResult,
  type OrchestrationTask,
  type TaskChangedFile,
  type TaskChangeSet,
  TaskReviewSnapshotId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as CheckpointStore from "../checkpointing/CheckpointStore.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as ProjectionSnapshotQuery from "./Services/ProjectionSnapshotQuery.ts";
import { mergeUntrackedChanges, parseNameStatus } from "./taskChangeSet.ts";

const TASK_DIFF_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

interface CapturedTaskState {
  readonly changeSet: TaskChangeSet;
  readonly checkpointRef: CheckpointRef;
}

export interface TaskReviewDiffPackage {
  readonly patch: string;
  readonly coverage: "complete" | "manual-required";
  readonly reason: string | null;
}

export interface TaskChangeSetQueryShape {
  readonly getTaskChanges: (
    input: OrchestrationGetTaskChangesInput,
  ) => Effect.Effect<OrchestrationGetTaskChangesResult, OrchestrationGetTaskChangesError>;
  readonly getTaskFileDiff: (
    input: OrchestrationGetTaskFileDiffInput,
  ) => Effect.Effect<OrchestrationGetTaskFileDiffResult, OrchestrationGetTaskChangesError>;
  readonly collect: (
    task: OrchestrationTask,
  ) => Effect.Effect<TaskChangeSet, OrchestrationGetTaskChangesError>;
  readonly capture: (
    task: OrchestrationTask,
    snapshotId: TaskReviewSnapshotId,
  ) => Effect.Effect<CapturedTaskState, OrchestrationGetTaskChangesError>;
  readonly isCurrent: (
    task: OrchestrationTask,
  ) => Effect.Effect<boolean, OrchestrationGetTaskChangesError>;
  readonly getReviewDiff: (
    task: OrchestrationTask,
  ) => Effect.Effect<TaskReviewDiffPackage, OrchestrationGetTaskChangesError>;
}

const unavailable = () =>
  Effect.fail(
    new OrchestrationGetTaskChangesError({
      message: "Task change inspection is unavailable in this runtime.",
    }),
  );

export class TaskChangeSetQuery extends Context.Reference<TaskChangeSetQueryShape>(
  "t3/orchestration/TaskChangeSetQuery",
  {
    defaultValue: () => ({
      getTaskChanges: unavailable,
      getTaskFileDiff: unavailable,
      collect: unavailable,
      capture: unavailable,
      isCurrent: unavailable,
      getReviewDiff: unavailable,
    }),
  },
) {}

function requireWorkspace(task: OrchestrationTask) {
  const workspace = task.workspace;
  if (
    workspace?.status !== "ready" ||
    workspace.path === null ||
    workspace.baseCommit === null ||
    workspace.branch === null
  ) {
    throw new Error(`Task '${task.id}' does not have a ready managed workspace.`);
  }
  return {
    cwd: workspace.path,
    baseCommit: workspace.baseCommit,
    branch: workspace.branch,
  };
}

function parseNumstat(output: string) {
  const stats = new Map<string, { additions: number | null; deletions: number | null }>();
  const fields = output.split("\0");
  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index];
    if (!record) continue;
    const [added = "", deleted = "", path = ""] = record.split("\t");
    const additions = added === "-" ? null : Number.parseInt(added, 10);
    const deletions = deleted === "-" ? null : Number.parseInt(deleted, 10);
    if (path.length > 0) {
      stats.set(path, {
        additions: Number.isFinite(additions) ? additions : null,
        deletions: Number.isFinite(deletions) ? deletions : null,
      });
      continue;
    }
    const previousPath = fields[index + 1];
    const nextPath = fields[index + 2];
    if (previousPath && nextPath) {
      stats.set(nextPath, {
        additions: Number.isFinite(additions) ? additions : null,
        deletions: Number.isFinite(deletions) ? deletions : null,
      });
      index += 2;
    }
  }
  return stats;
}

export const taskReviewCheckpointRef = (
  taskId: string,
  snapshotId: TaskReviewSnapshotId,
): CheckpointRef => CheckpointRef.make(`refs/t3/checkpoints/tasks/${taskId}/review/${snapshotId}`);

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const git = yield* GitVcsDriver.GitVcsDriver;
  const checkpoints = yield* CheckpointStore.CheckpointStore;
  const snapshots = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;

  const mapError = (operation: string) => (cause: unknown) =>
    new OrchestrationGetTaskChangesError({
      message: `${operation} failed.`,
      cause,
    });

  const resolveTask = Effect.fn("TaskChangeSetQuery.resolveTask")(function* (taskId: string) {
    const readModel = yield* snapshots.getCommandReadModel();
    const task = (readModel.tasks ?? []).find((candidate) => candidate.id === taskId);
    if (!task) {
      return yield* new OrchestrationGetTaskChangesError({
        message: `Task '${taskId}' was not found.`,
      });
    }
    return task;
  });

  const collectAtRef = Effect.fn("TaskChangeSetQuery.collectAtRef")(function* (
    task: OrchestrationTask,
    checkpointRef: CheckpointRef,
  ) {
    const workspace = yield* Effect.try({
      try: () => requireWorkspace(task),
      catch: mapError("Task workspace validation"),
    });
    const [head, nameStatus, numstat, untracked, tree] = yield* Effect.all(
      [
        git.execute({
          operation: "TaskChangeSet.resolveHead",
          cwd: workspace.cwd,
          args: ["rev-parse", "HEAD"],
        }),
        git.execute({
          operation: "TaskChangeSet.nameStatus",
          cwd: workspace.cwd,
          args: [
            "diff",
            "--name-status",
            "-z",
            "--find-renames",
            "--find-copies",
            workspace.baseCommit,
            checkpointRef,
            "--",
          ],
        }),
        git.execute({
          operation: "TaskChangeSet.numstat",
          cwd: workspace.cwd,
          args: ["diff", "--numstat", "-z", workspace.baseCommit, checkpointRef, "--"],
        }),
        git.execute({
          operation: "TaskChangeSet.untracked",
          cwd: workspace.cwd,
          args: ["ls-files", "--others", "--exclude-standard", "-z", "--"],
        }),
        git.execute({
          operation: "TaskChangeSet.resolveTree",
          cwd: workspace.cwd,
          args: ["rev-parse", `${checkpointRef}^{tree}`],
        }),
      ],
      { concurrency: "unbounded" },
    );
    const stats = parseNumstat(numstat.stdout);
    const changes = mergeUntrackedChanges(parseNameStatus(nameStatus.stdout), untracked.stdout);
    const files: TaskChangedFile[] = changes.map((change) => {
      const fileStats = stats.get(change.path) ?? { additions: 0, deletions: 0 };
      return {
        path: change.path,
        previousPath: change.previousPath ?? null,
        changeType: change.changeType,
        additions: fileStats.additions,
        deletions: fileStats.deletions,
        binary: fileStats.additions === null || fileStats.deletions === null,
        untracked: change.changeType === "untracked",
      };
    });
    const generatedAt = DateTime.formatIso(yield* DateTime.now);
    return {
      taskId: task.id,
      baseCommit: workspace.baseCommit,
      currentHead: head.stdout.trim(),
      branch: workspace.branch,
      workspace: workspace.cwd,
      files,
      changedFiles: files.length,
      additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
      deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
      fingerprint: tree.stdout.trim(),
      generatedAt,
    } satisfies TaskChangeSet;
  });

  const captureRaw = Effect.fn("TaskChangeSetQuery.captureRaw")(function* (
    task: OrchestrationTask,
    snapshotId: TaskReviewSnapshotId,
  ) {
    const workspace = yield* Effect.try({
      try: () => requireWorkspace(task),
      catch: mapError("Task workspace validation"),
    });
    const checkpointRef = taskReviewCheckpointRef(task.id, snapshotId);
    yield* checkpoints.captureCheckpoint({ cwd: workspace.cwd, checkpointRef });
    const changeSet = yield* collectAtRef(task, checkpointRef);
    return { checkpointRef, changeSet };
  });

  const collectRaw = Effect.fn("TaskChangeSetQuery.collectRaw")(function* (
    task: OrchestrationTask,
  ) {
    const snapshotId = TaskReviewSnapshotId.make(`live-${yield* crypto.randomUUIDv4}`);
    const workspace = yield* Effect.try({
      try: () => requireWorkspace(task),
      catch: mapError("Task workspace validation"),
    });
    const checkpointRef = taskReviewCheckpointRef(task.id, snapshotId);
    yield* checkpoints.captureCheckpoint({ cwd: workspace.cwd, checkpointRef });
    return yield* collectAtRef(task, checkpointRef).pipe(
      Effect.ensuring(
        checkpoints
          .deleteCheckpointRefs({ cwd: workspace.cwd, checkpointRefs: [checkpointRef] })
          .pipe(Effect.ignore),
      ),
    );
  });

  const isCurrentRaw = Effect.fn("TaskChangeSetQuery.isCurrentRaw")(function* (
    task: OrchestrationTask,
  ) {
    if (!task.reviewSnapshot) return false;
    const current = yield* collectRaw(task);
    return (
      current.fingerprint === task.reviewSnapshot.fingerprint &&
      current.currentHead === task.reviewSnapshot.branchHead
    );
  });

  const capture: TaskChangeSetQueryShape["capture"] = (task, snapshotId) =>
    captureRaw(task, snapshotId).pipe(Effect.mapError(mapError("Task snapshot capture")));
  const collect: TaskChangeSetQueryShape["collect"] = (task) =>
    collectRaw(task).pipe(Effect.mapError(mapError("Task change collection")));
  const isCurrent: TaskChangeSetQueryShape["isCurrent"] = (task) =>
    isCurrentRaw(task).pipe(Effect.mapError(mapError("Task snapshot freshness check")));

  const getTaskChanges: TaskChangeSetQueryShape["getTaskChanges"] = Effect.fn(
    "TaskChangeSetQuery.getTaskChanges",
  )(
    function* (input) {
      const task = yield* resolveTask(input.taskId);
      const changeSet = yield* collectRaw(task);
      const snapshotStatus: OrchestrationGetTaskChangesResult["snapshotStatus"] =
        task.reviewSnapshot
          ? changeSet.fingerprint === task.reviewSnapshot.fingerprint &&
            changeSet.currentHead === task.reviewSnapshot.branchHead
            ? "current"
            : "stale"
          : null;
      return { changeSet, snapshotStatus };
    },
    Effect.mapError(mapError("Task changes query")),
  );

  const getTaskFileDiff: TaskChangeSetQueryShape["getTaskFileDiff"] = Effect.fn(
    "TaskChangeSetQuery.getTaskFileDiff",
  )(
    function* (input) {
      const task = yield* resolveTask(input.taskId);
      const workspace = yield* Effect.try({
        try: () => requireWorkspace(task),
        catch: mapError("Task workspace validation"),
      });
      const live = yield* captureRaw(
        task,
        TaskReviewSnapshotId.make(`file-${yield* crypto.randomUUIDv4}`),
      );
      const file = live.changeSet.files.find(
        (candidate) => candidate.path === input.path || candidate.previousPath === input.path,
      );
      if (!file) {
        yield* checkpoints
          .deleteCheckpointRefs({ cwd: workspace.cwd, checkpointRefs: [live.checkpointRef] })
          .pipe(Effect.ignore);
        return yield* new OrchestrationGetTaskChangesError({
          message: `Task change '${input.path}' was not found.`,
        });
      }
      if (file.binary) {
        yield* checkpoints
          .deleteCheckpointRefs({ cwd: workspace.cwd, checkpointRefs: [live.checkpointRef] })
          .pipe(Effect.ignore);
        return { path: file.path, patch: "", binary: true, truncated: false };
      }
      const [baseSize, snapshotSize] = yield* Effect.all([
        git.execute({
          operation: "TaskChangeSet.baseFileSize",
          cwd: workspace.cwd,
          args: ["cat-file", "-s", `${workspace.baseCommit}:${file.previousPath ?? file.path}`],
          allowNonZeroExit: true,
        }),
        git.execute({
          operation: "TaskChangeSet.snapshotFileSize",
          cwd: workspace.cwd,
          args: ["cat-file", "-s", `${live.checkpointRef}:${file.path}`],
          allowNonZeroExit: true,
        }),
      ]);
      const estimatedPatchBytes = [baseSize, snapshotSize].reduce(
        (total, result) => total + (Number.parseInt(result.stdout.trim(), 10) || 0),
        0,
      );
      if (estimatedPatchBytes > TASK_DIFF_MAX_OUTPUT_BYTES) {
        yield* checkpoints
          .deleteCheckpointRefs({ cwd: workspace.cwd, checkpointRefs: [live.checkpointRef] })
          .pipe(Effect.ignore);
        return { path: file.path, patch: "", binary: false, truncated: true };
      }
      const result = yield* git
        .execute({
          operation: "TaskChangeSet.fileDiff",
          cwd: workspace.cwd,
          args: [
            "diff",
            "--patch",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            workspace.baseCommit,
            live.checkpointRef,
            "--",
            ...(file.previousPath ? [file.previousPath] : []),
            file.path,
          ],
          maxOutputBytes: TASK_DIFF_MAX_OUTPUT_BYTES,
          appendTruncationMarker: true,
        })
        .pipe(
          Effect.ensuring(
            checkpoints
              .deleteCheckpointRefs({ cwd: workspace.cwd, checkpointRefs: [live.checkpointRef] })
              .pipe(Effect.ignore),
          ),
        );
      return {
        path: file.path,
        patch: result.stdout,
        binary: false,
        truncated: result.stdoutTruncated,
      };
    },
    Effect.mapError(mapError("Task file diff query")),
  );

  const getReviewDiff: TaskChangeSetQueryShape["getReviewDiff"] = Effect.fn(
    "TaskChangeSetQuery.getReviewDiff",
  )(
    function* (task) {
      const workspace = yield* Effect.try({
        try: () => requireWorkspace(task),
        catch: mapError("Task workspace validation"),
      });
      const snapshot = task.reviewSnapshot;
      if (!snapshot || snapshot.status !== "current") {
        return yield* new OrchestrationGetTaskChangesError({
          message: "A current immutable Task review snapshot is required.",
        });
      }
      const protectedPath = (path: string) =>
        /(^|\/)(\.env(?:\.|$)|\.ssh(?:\/|$)|\.aws(?:\/|$)|\.config\/gh(?:\/|$)|credentials?(?:\.|$)|.*\.pem$|.*\.key$)/i.test(
          path,
        );
      if ((snapshot.files ?? []).some((file) => protectedPath(file.path))) {
        return {
          patch: "",
          coverage: "manual-required" as const,
          reason: "The snapshot changes a protected path that is excluded from provider review.",
        };
      }
      const result = yield* git.execute({
        operation: "TaskChangeSet.reviewDiff",
        cwd: workspace.cwd,
        args: [
          "diff",
          "--patch",
          "--no-color",
          "--no-ext-diff",
          "--no-textconv",
          workspace.baseCommit,
          snapshot.checkpointRef,
          "--",
        ],
        maxOutputBytes: 120_000,
        appendTruncationMarker: true,
      });
      return result.stdoutTruncated
        ? {
            patch: "",
            coverage: "manual-required" as const,
            reason: "The immutable diff exceeds the bounded automatic-review package.",
          }
        : { patch: result.stdout, coverage: "complete" as const, reason: null };
    },
    Effect.mapError(mapError("Task review diff query")),
  );

  return TaskChangeSetQuery.of({
    getTaskChanges,
    getTaskFileDiff,
    collect,
    capture,
    isCurrent,
    getReviewDiff,
  });
});

export const layer = Layer.effect(TaskChangeSetQuery, make);
