import {
  CheckpointRef,
  CommandId,
  EventId,
  MessageId,
  TaskHandoffId,
  TaskRestoreId,
  TaskReviewSnapshotId,
  type OrchestrationEvent,
  type OrchestrationTask,
  type TaskReview,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import * as CheckpointStore from "../../checkpointing/CheckpointStore.ts";
import { ProviderInstanceRegistry } from "../../provider/Services/ProviderInstanceRegistry.ts";
import { forkParked, forkParkedStream } from "../../serverActivation.ts";
import * as TextGeneration from "../../textGeneration/TextGeneration.ts";
import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { TaskReviewReactor, type TaskReviewReactorShape } from "../Services/TaskReviewReactor.ts";
import { TaskChangeSetQuery } from "../TaskChangeSetQuery.ts";
import {
  buildStructuredTaskHandoffPrompt,
  parseGeneratedTaskHandoff,
  parseStructuredTaskHandoffValue,
  StructuredTaskHandoffGenerationOutput,
} from "../taskHandoff.ts";
import {
  buildIndependentReviewPrompt,
  parseStructuredReviewOutput,
  parseStructuredReviewValue,
  resolveReviewDiversity,
  StructuredReviewGenerationOutput,
} from "../taskIndependentReview.ts";

type ReviewEvent = Extract<
  OrchestrationEvent,
  {
    type:
      | "task.review.prepare-requested"
      | "task.completion.freshness-requested"
      | "task.restore.requested"
      | "task.restore.undo-requested"
      | "task.independent-review.requested"
      | "task.review.findings-sent"
      | "task.ownership-validated"
      | "thread.turn-diff-completed";
  }
>;

class IndependentReviewParseError extends Data.TaggedError("IndependentReviewParseError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export const taskRestoreCheckpointRef = (taskId: string, restoreId: TaskRestoreId) =>
  CheckpointRef.make(`refs/t3/checkpoints/tasks/${taskId}/restore/${restoreId}`);

export function shouldRecoverReviewPreparation(
  task: {
    readonly status: string;
    readonly ownership?: { readonly status?: string } | null | undefined;
  },
  thread: { readonly latestTurn: { readonly state: string } | null } | undefined,
  snapshotIsCurrent: boolean,
): boolean {
  return (
    task.status === "active" && thread?.latestTurn?.state === "completed" && !snapshotIsCurrent
  );
}

export function taskBranchIsPublished(remoteRefs: string, branch: string): boolean {
  return remoteRefs.split("\n").some((ref) => ref.trim().endsWith(`/${branch}`));
}

export const taskWorkspacePathsMatch = Effect.fn("TaskReviewReactor.taskWorkspacePathsMatch")(
  function* (recordedPath: string, reportedPath: string) {
    const fileSystem = yield* FileSystem.FileSystem;
    const [recordedRealPath, reportedRealPath] = yield* Effect.all([
      fileSystem.realPath(recordedPath),
      fileSystem.realPath(reportedPath),
    ]);
    return recordedRealPath === reportedRealPath;
  },
);

export const restoreTaskWorkspaceToBaseline = Effect.fn(
  "TaskReviewReactor.restoreTaskWorkspaceToBaseline",
)(function* <E>(input: {
  readonly path: string;
  readonly baseCommit: string;
  readonly safetyCheckpointRef: CheckpointRef;
  readonly git: GitVcsDriver.GitVcsDriver["Service"];
  readonly checkpoints: CheckpointStore.CheckpointStore["Service"];
  readonly onSnapshotCaptured: (previousHead: string) => Effect.Effect<void, E>;
}) {
  const head = yield* input.git.execute({
    operation: "TaskRestore.head",
    cwd: input.path,
    args: ["rev-parse", "HEAD"],
  });
  const previousHead = head.stdout.trim();
  yield* input.checkpoints.captureCheckpoint({
    cwd: input.path,
    checkpointRef: input.safetyCheckpointRef,
  });
  yield* input.onSnapshotCaptured(previousHead);
  yield* input.git.execute({
    operation: "TaskRestore.reset",
    cwd: input.path,
    args: ["reset", "--hard", input.baseCommit],
  });
  const restored = yield* input.checkpoints.restoreCheckpoint({
    cwd: input.path,
    checkpointRef: CheckpointRef.make(input.baseCommit),
    fallbackToHead: true,
  });
  if (!restored) return yield* Effect.fail("The Task baseline could not be restored.");
  return previousHead;
});

export const undoTaskWorkspaceRestore = Effect.fn("TaskReviewReactor.undoTaskWorkspaceRestore")(
  function* (input: {
    readonly path: string;
    readonly previousHead: string;
    readonly safetyCheckpointRef: CheckpointRef;
    readonly git: GitVcsDriver.GitVcsDriver["Service"];
    readonly checkpoints: CheckpointStore.CheckpointStore["Service"];
  }) {
    yield* input.git.execute({
      operation: "TaskRestore.undoHead",
      cwd: input.path,
      args: ["reset", "--hard", input.previousHead],
    });
    const restored = yield* input.checkpoints.restoreCheckpoint({
      cwd: input.path,
      checkpointRef: input.safetyCheckpointRef,
    });
    if (!restored) return yield* Effect.fail("The Task recovery snapshot is unavailable.");
  },
);

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const taskChanges = yield* TaskChangeSetQuery;
  const checkpoints = yield* CheckpointStore.CheckpointStore;
  const git = yield* GitVcsDriver.GitVcsDriver;
  const textGeneration = yield* TextGeneration.TextGeneration;
  const providerInstances = yield* ProviderInstanceRegistry;
  const fileSystem = yield* FileSystem.FileSystem;
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const commandId = (tag: string) =>
    crypto.randomUUIDv4.pipe(Effect.map((id) => CommandId.make(`server:${tag}:${id}`)));

  const appendTaskActivity = Effect.fn("TaskReviewReactor.appendTaskActivity")(function* (
    task: OrchestrationTask,
    kind: string,
    summary: string,
    tone: "info" | "error" = "info",
  ) {
    if (task.threadId === null) return;
    const createdAt = yield* now;
    yield* engine.dispatch({
      type: "thread.activity.append",
      commandId: yield* commandId("task-review-activity"),
      threadId: task.threadId,
      activity: {
        id: EventId.make(yield* crypto.randomUUIDv4),
        tone,
        kind,
        summary,
        payload: { taskId: task.id },
        turnId: null,
        createdAt,
      },
      createdAt,
    });
  });

  const resolveTask = Effect.fn("TaskReviewReactor.resolveTask")(function* (taskId: string) {
    const model = yield* snapshots.getCommandReadModel();
    return (model.tasks ?? []).find((candidate) => candidate.id === taskId) ?? null;
  });

  const markStale = Effect.fn("TaskReviewReactor.markStale")(function* (task: OrchestrationTask) {
    if (!task.reviewSnapshot || task.reviewSnapshot.status === "stale") return;
    yield* engine.dispatch({
      type: "task.review.stale",
      commandId: yield* commandId("task-review-stale"),
      taskId: task.id,
      createdAt: yield* now,
    });
  });

  const prepare = Effect.fn("TaskReviewReactor.prepare")(function* (
    taskId: string,
    generation: "provider" | "manual",
  ) {
    const task = yield* resolveTask(taskId);
    if (!task) return;
    const snapshotId = TaskReviewSnapshotId.make(yield* crypto.randomUUIDv4);
    const handoffId = TaskHandoffId.make(yield* crypto.randomUUIDv4);
    const capturedAt = yield* now;
    const captured = yield* taskChanges.capture(task, snapshotId);
    let summary = "";
    let testsRun: ReturnType<typeof parseGeneratedTaskHandoff>["testsRun"] = [];
    let assumptions: ReadonlyArray<string> = [];
    let interfaceChanges: ReadonlyArray<string> = [];
    let migrations: ReadonlyArray<string> = [];
    let knownRisks: ReadonlyArray<string> = [];
    let followUps: ReadonlyArray<string> = [];
    let generationError: string | null = null;
    let resolvedGeneration = generation;
    if (generation === "provider") {
      const model = yield* snapshots.getCommandReadModel();
      const thread = model.threads.find((candidate) => candidate.id === task.threadId);
      if (!thread) {
        generationError = "The Task thread was unavailable for provider handoff generation.";
        resolvedGeneration = "manual";
      } else {
        const generated = textGeneration.generateStructured
          ? yield* textGeneration
              .generateStructured({
                cwd: captured.changeSet.workspace,
                prompt: buildStructuredTaskHandoffPrompt({
                  title: task.title,
                  objective: task.objective,
                  files: captured.changeSet.files,
                }),
                outputSchema: StructuredTaskHandoffGenerationOutput,
                modelSelection: thread.modelSelection,
              })
              .pipe(Effect.result)
          : null;
        if (generated?._tag === "Success") {
          const narrative = parseStructuredTaskHandoffValue(generated.success);
          summary = narrative.summary;
          testsRun = narrative.testsRun;
          assumptions = narrative.assumptions;
          interfaceChanges = narrative.interfaceChanges;
          migrations = narrative.migrations;
          knownRisks = narrative.knownRisks;
          followUps = narrative.followUps;
        } else {
          const legacy = yield* textGeneration
            .generatePrContent({
              cwd: captured.changeSet.workspace,
              baseBranch: captured.changeSet.baseCommit,
              headBranch: captured.changeSet.branch,
              commitSummary: `Task: ${task.title}\nObjective: ${task.objective}`,
              diffSummary: captured.changeSet.files
                .map((file) => `${file.changeType}: ${file.path}`)
                .join("\n"),
              diffPatch:
                "The immutable Task snapshot is the factual source. Do not invent tests or outcomes.",
              changeRequestTemplate:
                "Write a structured engineering handoff with sections: Summary, Tests run, Assumptions, Interface changes, Migrations, Known risks, Follow-ups. Clearly label unverified claims as reported. Do not invent commands or results.",
              modelSelection: thread.modelSelection,
            })
            .pipe(Effect.result);
          if (legacy._tag === "Success") {
            const narrative = parseGeneratedTaskHandoff(legacy.success.title, legacy.success.body);
            summary = narrative.summary;
            testsRun = narrative.testsRun;
            assumptions = narrative.assumptions;
            interfaceChanges = narrative.interfaceChanges;
            migrations = narrative.migrations;
            knownRisks = narrative.knownRisks;
            followUps = narrative.followUps;
          } else {
            generationError =
              generated?._tag === "Failure" ? generated.failure.detail : legacy.failure.detail;
            resolvedGeneration = "manual";
          }
        }
      }
    }
    yield* engine.dispatch({
      type: "task.review.prepared",
      commandId: yield* commandId("task-review-prepared"),
      taskId: task.id,
      snapshot: {
        id: snapshotId,
        taskId: task.id,
        baseCommit: captured.changeSet.baseCommit,
        checkpointRef: captured.checkpointRef,
        fingerprint: captured.changeSet.fingerprint,
        branchHead: captured.changeSet.currentHead,
        changedFiles: captured.changeSet.changedFiles,
        additions: captured.changeSet.additions,
        deletions: captured.changeSet.deletions,
        files: captured.changeSet.files,
        ownershipStatus: "valid",
        status: "current",
        capturedAt,
      },
      handoff: {
        id: handoffId,
        taskId: task.id,
        snapshotId,
        status: "draft",
        summary,
        testsRun,
        assumptions,
        interfaceChanges,
        migrations,
        knownRisks,
        followUps,
        generation: resolvedGeneration,
        generationError,
        createdAt: capturedAt,
        updatedAt: capturedAt,
      },
      createdAt: capturedAt,
    });
  });

  const validateFreshness = Effect.fn("TaskReviewReactor.validateFreshness")(function* (
    taskId: string,
  ) {
    const task = yield* resolveTask(taskId);
    if (!task) return;
    yield* engine.dispatch({
      type: "task.completion.freshness-validated",
      commandId: yield* commandId("task-completion-freshness"),
      taskId: task.id,
      current: yield* taskChanges.isCurrent(task),
      createdAt: yield* now,
    });
  });

  const failIndependentReview = Effect.fn("TaskReviewReactor.failIndependentReview")(function* (
    taskId: OrchestrationTask["id"],
    reviewId: TaskReview["id"],
    error: unknown,
  ) {
    yield* engine.dispatch({
      type: "task.independent-review.failed",
      commandId: yield* commandId("task-independent-review-failed"),
      taskId,
      reviewId,
      failureReason:
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Independent review failed.",
      createdAt: yield* now,
    });
  });

  const runIndependentReview = Effect.fn("TaskReviewReactor.runIndependentReview")(function* (
    taskId: OrchestrationTask["id"],
    reviewId: TaskReview["id"],
  ) {
    const task = yield* resolveTask(taskId);
    const review = task?.reviews?.find((candidate) => candidate.id === reviewId);
    if (!task || !review || !task.reviewSnapshot || !task.handoff) return;
    const reviewSnapshot = task.reviewSnapshot;
    if (!(yield* taskChanges.isCurrent(task))) {
      yield* markStale(task);
      return;
    }
    const diff = yield* taskChanges.getReviewDiff(task);
    if (diff.coverage === "manual-required") {
      return yield* Effect.fail(diff.reason ?? "This snapshot requires manual review.");
    }
    const model = yield* snapshots.getCommandReadModel();
    const builderThread = model.threads.find((candidate) => candidate.id === task.threadId);
    const [builderProvider, reviewerProvider] = yield* Effect.all([
      builderThread
        ? providerInstances.getInstance(builderThread.modelSelection.instanceId)
        : Effect.succeed(undefined),
      providerInstances.getInstance(review.reviewerModelSelection.instanceId),
    ]);
    const diversity = resolveReviewDiversity({
      builderDriverKind: builderProvider?.driverKind,
      reviewerDriverKind: reviewerProvider?.driverKind,
      fallback: review.diversity,
    });
    const startedAt = yield* now;
    yield* engine.dispatch({
      type: "task.independent-review.started",
      commandId: yield* commandId("task-independent-review-started"),
      taskId: task.id,
      reviewId,
      createdAt: startedAt,
    });
    const prompt = buildIndependentReviewPrompt({
      title: task.title,
      objective: task.objective,
      acceptanceCriteria: task.acceptanceCriteria ?? [],
      snapshot: task.reviewSnapshot,
      files: (task.reviewSnapshot.files ?? []).map((file) => file.path),
      patch: diff.patch,
      handoffSummary: task.handoff.summary,
      reportedTests: task.handoff.testsRun,
      quality: (task.qualityGateRuns ?? [])
        .filter((run) => run.snapshotId === task.reviewSnapshot!.id)
        .map((run) => ({
          label: run.label,
          command: run.command,
          status: run.status,
          exitCode: run.exitCode,
        })),
    });
    const result = yield* Effect.scoped(
      Effect.gen(function* () {
        // The reviewer receives only the bounded prompt. Its provider process
        // starts in an empty disposable directory, not the source checkout or
        // writable Builder worktree.
        const reviewCwd = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3-task-review-",
        });
        if (textGeneration.generateStructured) {
          const generated = yield* textGeneration.generateStructured({
            cwd: reviewCwd,
            prompt,
            outputSchema: StructuredReviewGenerationOutput,
            modelSelection: review.reviewerModelSelection,
          });
          return yield* Effect.try({
            try: () => parseStructuredReviewValue(generated),
            catch: (cause) =>
              new IndependentReviewParseError({
                message:
                  cause instanceof Error ? cause.message : "Independent review output was invalid.",
                cause,
              }),
          });
        }
        const generated = yield* textGeneration.generatePrContent({
          cwd: reviewCwd,
          baseBranch: reviewSnapshot.baseCommit,
          headBranch: reviewSnapshot.branchHead,
          commitSummary: `Independent review for Task ${task.id}`,
          diffSummary: "The immutable bounded review package is embedded below.",
          diffPatch: prompt,
          changeRequestTemplate:
            "Return the requested JSON object verbatim in the body. The title may be 'Task review'.",
          modelSelection: review.reviewerModelSelection,
        });
        return yield* Effect.try({
          try: () => parseStructuredReviewOutput(generated.body),
          catch: (cause) =>
            new IndependentReviewParseError({
              message:
                cause instanceof Error ? cause.message : "Independent review output was invalid.",
              cause,
            }),
        });
      }),
    );
    const completedAt = yield* now;
    yield* engine.dispatch({
      type: "task.independent-review.completed",
      commandId: yield* commandId("task-independent-review-completed"),
      taskId: task.id,
      review: {
        ...review,
        diversity,
        status: "completed",
        verdict: result.verdict,
        findings: result.findings,
        criteria: result.criteria,
        securityConcerns: result.securityConcerns,
        requiredChanges: result.requiredChanges,
        summary: result.summary,
        coverage: "complete",
        failureReason: null,
        completedAt,
      },
      createdAt: completedAt,
    });
  });

  const sendFindingsToBuilder = Effect.fn("TaskReviewReactor.sendFindingsToBuilder")(function* (
    taskId: OrchestrationTask["id"],
    reviewId: TaskReview["id"],
  ) {
    const model = yield* snapshots.getCommandReadModel();
    const task = (model.tasks ?? []).find((candidate) => candidate.id === taskId);
    const review = task?.reviews?.find((candidate) => candidate.id === reviewId);
    const thread = model.threads.find((candidate) => candidate.id === task?.threadId);
    if (!task || !review || !thread) return;
    const required = review.requiredChanges.map((change, index) => `${index + 1}. ${change}`);
    const blocking = review.findings
      .filter((finding) => finding.severity === "blocking" || finding.severity === "security")
      .map((finding) => `- [${finding.severity}] ${finding.title}: ${finding.detail}`);
    const createdAt = yield* now;
    yield* engine.dispatch({
      type: "thread.turn.start",
      commandId: yield* commandId("task-review-findings-builder-turn"),
      threadId: thread.id,
      message: {
        messageId: MessageId.make(yield* crypto.randomUUIDv4),
        role: "user",
        text: [
          `Human-requested review handoff for Task ${task.id}.`,
          `Reviewed snapshot: ${review.snapshotId}`,
          `Verdict: ${review.verdict ?? review.status}`,
          "Required changes:",
          ...(required.length > 0 ? required : ["None listed."]),
          "Blocking findings:",
          ...(blocking.length > 0 ? blocking : ["None listed."]),
          "Inspect the current Task workspace before editing. Do not change files outside Task ownership.",
        ].join("\n"),
        attachments: [],
      },
      modelSelection: thread.modelSelection,
      runtimeMode: thread.runtimeMode,
      interactionMode: thread.interactionMode,
      createdAt,
    });
  });

  const validateManagedRestore = Effect.fn("TaskReviewReactor.validateManagedRestore")(function* (
    task: OrchestrationTask,
  ) {
    const workspace = task.workspace;
    if (
      workspace?.status !== "ready" ||
      !workspace.path ||
      !workspace.baseCommit ||
      !workspace.branch
    ) {
      return yield* Effect.fail("The Task does not have a ready managed workspace.");
    }
    const [root, branch, remoteRefs] = yield* Effect.all([
      git.execute({
        operation: "TaskRestore.root",
        cwd: workspace.path,
        args: ["rev-parse", "--show-toplevel"],
      }),
      git.execute({
        operation: "TaskRestore.branch",
        cwd: workspace.path,
        args: ["branch", "--show-current"],
      }),
      git.execute({
        operation: "TaskRestore.remoteRefs",
        cwd: workspace.path,
        args: ["for-each-ref", "--format=%(refname)", "refs/remotes"],
      }),
    ]);
    const workspacePathMatches = yield* taskWorkspacePathsMatch(
      workspace.path,
      root.stdout.trim(),
    ).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
    if (!workspacePathMatches || branch.stdout.trim() !== workspace.branch) {
      return yield* Effect.fail(
        "The current checkout does not match the Task-managed workspace identity.",
      );
    }
    if (taskBranchIsPublished(remoteRefs.stdout, workspace.branch)) {
      return yield* Effect.fail(
        "Safe restore is refused because this Task branch has been published.",
      );
    }
    return {
      path: workspace.path,
      baseCommit: workspace.baseCommit,
      branch: workspace.branch,
    };
  });

  const failRestore = (taskId: OrchestrationTask["id"], restoreId: TaskRestoreId, error: unknown) =>
    Effect.all({ commandId: commandId("task-restore-failed"), createdAt: now }).pipe(
      Effect.flatMap((metadata) =>
        engine.dispatch({
          type: "task.restore.failed",
          taskId,
          restoreId,
          failureReason:
            typeof error === "string"
              ? error
              : error instanceof Error
                ? error.message
                : "Task restore failed; the safety ref was kept.",
          ...metadata,
        }),
      ),
      Effect.asVoid,
    );

  const restore = Effect.fn("TaskReviewReactor.restore")(function* (
    taskId: OrchestrationTask["id"],
    restoreId: TaskRestoreId,
  ) {
    const task = yield* resolveTask(taskId);
    if (!task) return;
    const workspace = yield* validateManagedRestore(task);
    const safetyCheckpointRef = taskRestoreCheckpointRef(task.id, restoreId);
    yield* restoreTaskWorkspaceToBaseline({
      path: workspace.path,
      baseCommit: workspace.baseCommit,
      safetyCheckpointRef,
      git,
      checkpoints,
      onSnapshotCaptured: (previousHead) =>
        Effect.gen(function* () {
          yield* engine.dispatch({
            type: "task.restore.snapshot-captured",
            commandId: yield* commandId("task-restore-snapshot"),
            taskId: task.id,
            restoreId,
            safetyCheckpointRef,
            previousHead,
            createdAt: yield* now,
          });
        }),
    });
    yield* engine.dispatch({
      type: "task.restored",
      commandId: yield* commandId("task-restored"),
      taskId: task.id,
      restoreId,
      createdAt: yield* now,
    });
    yield* engine.dispatch({
      type: "task.ownership.validate",
      commandId: yield* commandId("task-restore-revalidate-ownership"),
      taskId: task.id,
      createdAt: yield* now,
    });
    yield* appendTaskActivity(
      task,
      "task.workspace.restored",
      "Task workspace restored to baseline. Provider should inspect current workspace state before continuing.",
    );
  });

  const undo = Effect.fn("TaskReviewReactor.undo")(function* (
    taskId: OrchestrationTask["id"],
    restoreId: TaskRestoreId,
  ) {
    const task = yield* resolveTask(taskId);
    if (!task?.restore?.safetyCheckpointRef || !task.restore.previousHead) return;
    const workspace = yield* validateManagedRestore(task);
    yield* undoTaskWorkspaceRestore({
      path: workspace.path,
      previousHead: task.restore.previousHead,
      safetyCheckpointRef: task.restore.safetyCheckpointRef,
      git,
      checkpoints,
    });
    yield* engine.dispatch({
      type: "task.restore.undone",
      commandId: yield* commandId("task-restore-undone"),
      taskId: task.id,
      restoreId,
      createdAt: yield* now,
    });
    yield* engine.dispatch({
      type: "task.ownership.validate",
      commandId: yield* commandId("task-restore-undo-revalidate-ownership"),
      taskId: task.id,
      createdAt: yield* now,
    });
    yield* appendTaskActivity(
      task,
      "task.workspace.restore-undone",
      "Task workspace restore undone.",
    );
  });

  const interruptedReviewPreparations = new Set<string>();

  const process = Effect.fn("TaskReviewReactor.process")(function* (event: ReviewEvent) {
    if (event.type === "task.ownership-validated") {
      if (!interruptedReviewPreparations.delete(event.payload.taskId)) return;
      if (event.payload.status !== "valid") return;
      yield* prepare(event.payload.taskId, "provider").pipe(
        Effect.catch((error) =>
          engine.dispatch({
            type: "task.review.prepare-failed",
            commandId: CommandId.make(
              `server:task-review-recovery-prepare-failed:${event.eventId}`,
            ),
            taskId: event.payload.taskId,
            failureReason:
              typeof error === "object" && error !== null && "message" in error
                ? String(error.message)
                : "Task review snapshot recovery failed.",
            createdAt: event.occurredAt,
          }),
        ),
      );
      return;
    }
    if (event.type === "task.review.prepare-requested") {
      yield* prepare(event.payload.taskId, event.payload.generation).pipe(
        Effect.catch((error) =>
          engine.dispatch({
            type: "task.review.prepare-failed",
            commandId: CommandId.make(`server:task-review-prepare-failed:${event.eventId}`),
            taskId: event.payload.taskId,
            failureReason:
              typeof error === "object" && error !== null && "message" in error
                ? String(error.message)
                : "Task review snapshot capture failed.",
            createdAt: event.occurredAt,
          }),
        ),
      );
      return;
    }
    if (event.type === "task.completion.freshness-requested") {
      yield* validateFreshness(event.payload.taskId);
      return;
    }
    if (event.type === "task.restore.requested") {
      yield* restore(event.payload.taskId, event.payload.restoreId).pipe(
        Effect.catch((error) => failRestore(event.payload.taskId, event.payload.restoreId, error)),
      );
      return;
    }
    if (event.type === "task.restore.undo-requested") {
      yield* undo(event.payload.taskId, event.payload.restoreId).pipe(
        Effect.catch((error) => failRestore(event.payload.taskId, event.payload.restoreId, error)),
      );
      return;
    }
    if (event.type === "task.independent-review.requested") {
      yield* runIndependentReview(event.payload.taskId, event.payload.review.id).pipe(
        Effect.catch((error) =>
          failIndependentReview(event.payload.taskId, event.payload.review.id, error),
        ),
      );
      return;
    }
    if (event.type === "task.review.findings-sent") {
      yield* sendFindingsToBuilder(event.payload.taskId, event.payload.reviewId).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Sending Task review findings to Builder failed", {
            cause: Cause.pretty(cause),
          }),
        ),
      );
      return;
    }
    const model = yield* snapshots.getCommandReadModel();
    const task = (model.tasks ?? []).find(
      (candidate) => candidate.threadId === event.payload.threadId && candidate.status === "active",
    );
    if (task?.reviewSnapshot?.status === "current" && !(yield* taskChanges.isCurrent(task))) {
      yield* markStale(task);
    }
  });

  const worker = yield* makeDrainableWorker((event: ReviewEvent) =>
    process(event).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Task review reactor failed", { cause: Cause.pretty(cause) }),
      ),
    ),
  );

  const reconcile = Effect.gen(function* () {
    const model = yield* snapshots.getCommandReadModel();
    for (const task of model.tasks ?? []) {
      if (task.status !== "active") continue;
      const snapshotIsCurrent =
        task.reviewSnapshot?.status === "current" &&
        (yield* taskChanges.isCurrent(task).pipe(Effect.orElseSucceed(() => false)));
      if (task.reviewSnapshot?.status === "current" && !snapshotIsCurrent) {
        yield* markStale(task);
      }
      const thread = model.threads.find((candidate) => candidate.id === task.threadId);
      if (shouldRecoverReviewPreparation(task, thread, snapshotIsCurrent)) {
        if (task.ownership?.status === "pending") {
          interruptedReviewPreparations.add(task.id);
        } else if (task.ownership?.status === "valid") {
          const recoveredAt = thread?.latestTurn?.completedAt ?? (yield* now);
          yield* prepare(task.id, "provider").pipe(
            Effect.catch((error) =>
              engine.dispatch({
                type: "task.review.prepare-failed",
                commandId: CommandId.make(
                  `server:task-review-startup-prepare-failed:${task.id}:${thread?.latestTurn?.turnId ?? "no-turn"}`,
                ),
                taskId: task.id,
                failureReason:
                  typeof error === "object" && error !== null && "message" in error
                    ? String(error.message)
                    : "Task review snapshot recovery failed.",
                createdAt: recoveredAt,
              }),
            ),
          );
        }
      }
      if (task.restore?.status === "requested") {
        yield* restore(task.id, task.restore.id).pipe(
          Effect.catch((error) => failRestore(task.id, task.restore!.id, error)),
        );
      } else if (task.restore?.status === "snapshot-captured") {
        yield* failRestore(
          task.id,
          task.restore.id,
          "Restore was interrupted after the safety snapshot; retry from the retained ref.",
        );
      }
      for (const review of task.reviews ?? []) {
        if (review.status === "queued") {
          yield* runIndependentReview(task.id, review.id).pipe(
            Effect.catch((error) => failIndependentReview(task.id, review.id, error)),
          );
        } else if (review.status === "running") {
          yield* failIndependentReview(
            task.id,
            review.id,
            "Independent review was interrupted by server restart.",
          );
        }
      }
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Task review startup reconciliation failed", {
        cause: Cause.pretty(cause),
      }),
    ),
  );

  const start: TaskReviewReactorShape["start"] = Effect.fn("TaskReviewReactor.start")(function* () {
    yield* forkParkedStream(engine.streamDomainEvents, (event) => {
      if (
        event.type === "task.review.prepare-requested" ||
        event.type === "task.completion.freshness-requested" ||
        event.type === "task.restore.requested" ||
        event.type === "task.restore.undo-requested" ||
        event.type === "task.independent-review.requested" ||
        event.type === "task.review.findings-sent" ||
        event.type === "task.ownership-validated" ||
        event.type === "thread.turn-diff-completed"
      ) {
        return worker.enqueue(event as ReviewEvent);
      }
      return Effect.void;
    });
    yield* forkParked(reconcile);
  });

  return { start, drain: worker.drain } satisfies TaskReviewReactorShape;
});

export const TaskReviewReactorLive = Layer.effect(TaskReviewReactor, make);
