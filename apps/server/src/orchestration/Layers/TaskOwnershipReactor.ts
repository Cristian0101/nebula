import {
  CommandId,
  type OrchestrationEvent,
  type OrchestrationTask,
  TaskId,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import { evaluateResourceCompliance } from "@t3tools/shared/resourceCoordination";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { forkParked, forkParkedStream } from "../../serverActivation.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  TaskOwnershipReactor,
  type TaskOwnershipReactorShape,
} from "../Services/TaskOwnershipReactor.ts";
import { evaluateTaskOwnership, type TaskOwnershipChange } from "../taskOwnership.ts";
import { TaskChangeSetQuery } from "../TaskChangeSetQuery.ts";

type OwnershipEvent = Extract<
  OrchestrationEvent,
  {
    type:
      | "task.ownership-updated"
      | "task.ownership-validation-requested"
      | "task.workspace.ready"
      | "thread.turn-diff-completed";
  }
>;

export function taskNeedsOwnershipReconciliation(
  task: OrchestrationTask,
  missionRuns: ReadonlyArray<{
    readonly status: string;
    readonly scheduledTaskIds: ReadonlyArray<string>;
  }> = [],
): boolean {
  const scheduledDraft =
    task.status === "draft" &&
    missionRuns.some(
      (run) =>
        run.status !== "completed" &&
        run.status !== "failed" &&
        run.status !== "stopped" &&
        run.scheduledTaskIds.includes(task.id),
    );
  return (
    (task.status === "active" || scheduledDraft) &&
    task.ownership?.required === true &&
    task.ownership.rules.length > 0 &&
    task.workspace?.status === "ready"
  );
}

export function taskNeedsCompletionRecovery(
  task: OrchestrationTask,
  missionRuns: ReadonlyArray<{
    readonly status: string;
    readonly scheduledTaskIds: ReadonlyArray<string>;
  }>,
): boolean {
  if (!taskNeedsOwnershipReconciliation(task)) return false;
  if (task.ownership?.status !== "valid") return false;
  const snapshotId = task.reviewSnapshot?.status === "current" ? task.reviewSnapshot.id : null;
  if (
    snapshotId === null ||
    task.handoff?.status !== "ready" ||
    task.handoff.snapshotId !== snapshotId
  ) {
    return false;
  }
  const review = (task.reviews ?? [])
    .filter((candidate) => candidate.snapshotId === snapshotId)
    .toSorted(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    )
    .at(-1);
  if (
    review?.status !== "completed" ||
    (review.verdict !== "approve" && review.verdict !== "approve_with_notes")
  ) {
    return false;
  }
  return missionRuns.some(
    (run) =>
      run.status !== "completed" &&
      run.status !== "failed" &&
      run.status !== "stopped" &&
      run.scheduledTaskIds.includes(task.id),
  );
}

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const taskChanges = yield* TaskChangeSetQuery;
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const commandId = (tag: string) =>
    crypto.randomUUIDv4.pipe(Effect.map((id) => CommandId.make(`server:${tag}:${id}`)));

  const requestValidation = (taskId: TaskId) =>
    Effect.all({ commandId: commandId("task-ownership-validate"), createdAt: now }).pipe(
      Effect.flatMap((metadata) =>
        engine.dispatch({ type: "task.ownership.validate", taskId, ...metadata }),
      ),
    );

  const validate = Effect.fn("TaskOwnershipReactor.validate")(function* (
    taskId: TaskId,
    requestCompletion: boolean,
    requestReview = false,
    generation: "provider" | "manual" = "provider",
  ) {
    const readModel = yield* snapshots.getCommandReadModel();
    const task = (readModel.tasks ?? []).find((candidate) => candidate.id === taskId);
    if (
      !task ||
      task.ownership?.required !== true ||
      task.workspace?.status !== "ready" ||
      !task.workspace.path ||
      !task.workspace.baseCommit
    ) {
      return;
    }
    const changeSet = yield* taskChanges.collect(task);
    const changes: TaskOwnershipChange[] = changeSet.files.map((file) => ({
      path: file.path,
      changeType: file.changeType,
      ...(file.previousPath === null ? {} : { previousPath: file.previousPath }),
    }));
    const result = evaluateTaskOwnership(task.ownership.rules, changes);
    const project = readModel.projects.find((candidate) => candidate.id === task.projectId);
    const resourceViolations = evaluateResourceCompliance({
      taskId: task.id,
      changedFiles: changeSet.files,
      resources: project?.sharedResources ?? [],
      leases: project?.resourceLeases ?? [],
    });
    const createdAt = yield* now;
    yield* engine.dispatch({
      type: "task.ownership.validated",
      commandId: yield* commandId("task-ownership-validated"),
      taskId,
      changedPathCount: result.changedPathCount,
      violations: result.violations,
      resourceViolations,
      requestCompletion,
      requestReview,
      generation,
      createdAt,
    });
  });

  const fail = (taskId: TaskId, requestCompletion: boolean, requestReview = false) =>
    Effect.all({ commandId: commandId("task-ownership-validation-failed"), createdAt: now }).pipe(
      Effect.flatMap((metadata) =>
        engine.dispatch({
          type: "task.ownership.validation-failed",
          taskId,
          requestCompletion,
          requestReview,
          failureReason: "Ownership validation could not inspect the current Task Git state.",
          ...metadata,
        }),
      ),
      Effect.asVoid,
    );

  const process = Effect.fn("TaskOwnershipReactor.process")(function* (event: OwnershipEvent) {
    if (event.type === "task.ownership-validation-requested") {
      yield* validate(
        event.payload.taskId,
        event.payload.requestCompletion,
        event.payload.requestReview ?? false,
        event.payload.generation ?? "provider",
      );
      return;
    }
    const readModel = yield* snapshots.getCommandReadModel();
    const task =
      event.type === "thread.turn-diff-completed"
        ? (readModel.tasks ?? []).find(
            (candidate) =>
              candidate.threadId === event.payload.threadId && candidate.status === "active",
          )
        : (readModel.tasks ?? []).find((candidate) => candidate.id === event.payload.taskId);
    if (
      task?.ownership?.required === true &&
      task.ownership.rules.length > 0 &&
      task.workspace?.status === "ready"
    ) {
      yield* requestValidation(task.id);
    }
  });

  const processedEventIds = new Set<string>();
  const processedEventOrder: string[] = [];
  const processSafely = (event: OwnershipEvent) =>
    Effect.suspend(() => {
      if (processedEventIds.has(event.eventId)) return Effect.void;
      processedEventIds.add(event.eventId);
      processedEventOrder.push(event.eventId);
      if (processedEventOrder.length > 1_024) {
        const expired = processedEventOrder.shift();
        if (expired !== undefined) processedEventIds.delete(expired);
      }
      return process(event).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt;
          const taskId = event.type === "thread.turn-diff-completed" ? null : event.payload.taskId;
          const requestCompletion =
            event.type === "task.ownership-validation-requested" && event.payload.requestCompletion;
          const requestReview =
            event.type === "task.ownership-validation-requested" &&
            (event.payload.requestReview ?? false);
          const recovery =
            taskId === null ? Effect.void : fail(taskId, requestCompletion, requestReview);
          return recovery.pipe(
            Effect.tap(() =>
              Effect.logWarning("Task ownership validation failed", { cause: Cause.pretty(cause) }),
            ),
            Effect.catchCause(() => Effect.void),
          );
        }),
      );
    });
  const worker = yield* makeDrainableWorker(processSafely);

  const reconcile = Effect.gen(function* () {
    const readModel = yield* snapshots.getCommandReadModel();
    const terminalTaskIds = new Set(
      (readModel.tasks ?? [])
        .filter((task) => task.status === "completed" || task.status === "cancelled")
        .map((task) => task.id),
    );
    for (const project of readModel.projects) {
      const hasStaleLease = (project.resourceLeases ?? []).some(
        (lease) => lease.status === "held" && terminalTaskIds.has(lease.taskId),
      );
      if (hasStaleLease) {
        const metadata = yield* Effect.all({
          commandId: commandId("resource-leases-reconcile"),
          createdAt: now,
        });
        yield* engine.dispatch({
          type: "project.resource-leases.reconcile",
          projectId: project.id,
          ...metadata,
        });
      }
    }
    for (const task of readModel.tasks ?? []) {
      if (taskNeedsOwnershipReconciliation(task, readModel.missionRuns ?? [])) {
        if (taskNeedsCompletionRecovery(task, readModel.missionRuns ?? [])) {
          yield* engine.dispatch({
            type: "task.complete",
            commandId: yield* commandId("task-completion-recovery"),
            taskId: task.id,
            createdAt: yield* now,
          });
          continue;
        }
        const receipt = yield* requestValidation(task.id);
        yield* engine
          .readEvents(receipt.sequence - 1, 1)
          .pipe(
            Stream.runForEach((event) =>
              event.type === "task.ownership-validation-requested"
                ? worker.enqueue(event as OwnershipEvent)
                : Effect.void,
            ),
          );
      }
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Task ownership startup reconciliation failed", {
        cause: Cause.pretty(cause),
      }),
    ),
  );

  const start: TaskOwnershipReactorShape["start"] = Effect.fn("TaskOwnershipReactor.start")(
    function* () {
      yield* forkParkedStream(engine.streamDomainEvents, (event) => {
        if (
          event.type === "project.shared-resource-created" ||
          event.type === "project.shared-resource-updated" ||
          event.type === "project.shared-resource-deleted"
        ) {
          return snapshots.getCommandReadModel().pipe(
            Effect.flatMap((readModel) =>
              Effect.forEach(
                (readModel.tasks ?? []).filter(
                  (task) =>
                    task.projectId === event.payload.projectId &&
                    task.status === "active" &&
                    task.ownership?.required === true &&
                    task.workspace?.status === "ready",
                ),
                (task) => requestValidation(task.id),
                { discard: true },
              ),
            ),
          );
        }
        if (
          event.type === "task.ownership-updated" ||
          event.type === "task.ownership-validation-requested" ||
          event.type === "task.workspace.ready" ||
          event.type === "thread.turn-diff-completed"
        ) {
          return worker.enqueue(event as OwnershipEvent);
        }
        return Effect.void;
      });
      yield* forkParked(reconcile);
    },
  );

  return { start, drain: worker.drain } satisfies TaskOwnershipReactorShape;
});

export const TaskOwnershipReactorLive = Layer.effect(TaskOwnershipReactor, make);
