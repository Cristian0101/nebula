import {
  CommandId,
  type OrchestrationEvent,
  type OrchestrationTask,
  TaskId,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { forkParked } from "../../serverActivation.ts";
import { GitVcsDriver } from "../../vcs/GitVcsDriver.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  TaskOwnershipReactor,
  type TaskOwnershipReactorShape,
} from "../Services/TaskOwnershipReactor.ts";
import { evaluateTaskOwnership, type TaskOwnershipChange } from "../taskOwnership.ts";

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

export function parseNameStatus(output: string): TaskOwnershipChange[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes: TaskOwnershipChange[] = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++] ?? "";
    const code = status[0];
    if (code === "R" || code === "C") {
      const previousPath = fields[index++];
      const path = fields[index++];
      if (previousPath && path) {
        changes.push({
          path,
          previousPath,
          changeType: code === "R" ? "renamed" : "copied",
        });
      }
      continue;
    }
    const path = fields[index++];
    if (!path) continue;
    changes.push({
      path,
      changeType: code === "A" ? "added" : code === "D" ? "deleted" : "modified",
    });
  }
  return changes;
}

export function mergeUntrackedChanges(
  tracked: ReadonlyArray<TaskOwnershipChange>,
  output: string,
): TaskOwnershipChange[] {
  const paths = output.split("\0").filter(Boolean);
  const existing = new Set(tracked.flatMap((change) => [change.path, change.previousPath ?? ""]));
  return [
    ...tracked,
    ...paths
      .filter((path) => !existing.has(path))
      .map((path): TaskOwnershipChange => ({ path, changeType: "untracked" })),
  ];
}

export function taskNeedsOwnershipReconciliation(task: OrchestrationTask): boolean {
  return (
    task.status === "active" &&
    task.ownership?.required === true &&
    task.ownership.rules.length > 0 &&
    task.workspace?.status === "ready"
  );
}

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const git = yield* GitVcsDriver;
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const commandId = (tag: string) =>
    crypto.randomUUIDv4.pipe(Effect.map((id) => CommandId.make(`server:${tag}:${id}`)));

  const requestValidation = (taskId: TaskId) =>
    Effect.all({ commandId: commandId("task-ownership-validate"), createdAt: now }).pipe(
      Effect.flatMap((metadata) =>
        engine.dispatch({ type: "task.ownership.validate", taskId, ...metadata }),
      ),
    );

  const collectChanges = Effect.fn("TaskOwnershipReactor.collectChanges")(function* (
    cwd: string,
    baseCommit: string,
  ) {
    const [tracked, untracked] = yield* Effect.all(
      [
        git.execute({
          operation: "TaskOwnership.collectTrackedChanges",
          cwd,
          args: [
            "diff",
            "--name-status",
            "-z",
            "--find-renames",
            "--find-copies",
            baseCommit,
            "--",
          ],
        }),
        git.execute({
          operation: "TaskOwnership.collectUntrackedChanges",
          cwd,
          args: ["ls-files", "--others", "--exclude-standard", "-z", "--"],
        }),
      ],
      { concurrency: "unbounded" },
    );
    return mergeUntrackedChanges(parseNameStatus(tracked.stdout), untracked.stdout);
  });

  const validate = Effect.fn("TaskOwnershipReactor.validate")(function* (
    taskId: TaskId,
    requestCompletion: boolean,
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
    const changes = yield* collectChanges(task.workspace.path, task.workspace.baseCommit);
    const result = evaluateTaskOwnership(task.ownership.rules, changes);
    const createdAt = yield* now;
    yield* engine.dispatch({
      type: "task.ownership.validated",
      commandId: yield* commandId("task-ownership-validated"),
      taskId,
      changedPathCount: result.changedPathCount,
      violations: result.violations,
      requestCompletion,
      createdAt,
    });
  });

  const fail = (taskId: TaskId, requestCompletion: boolean) =>
    Effect.all({ commandId: commandId("task-ownership-validation-failed"), createdAt: now }).pipe(
      Effect.flatMap((metadata) =>
        engine.dispatch({
          type: "task.ownership.validation-failed",
          taskId,
          requestCompletion,
          failureReason: "Ownership validation could not inspect the current Task Git state.",
          ...metadata,
        }),
      ),
      Effect.asVoid,
    );

  const process = Effect.fn("TaskOwnershipReactor.process")(function* (event: OwnershipEvent) {
    if (event.type === "task.ownership-validation-requested") {
      yield* validate(event.payload.taskId, event.payload.requestCompletion);
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
          const recovery = taskId === null ? Effect.void : fail(taskId, requestCompletion);
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
    for (const task of readModel.tasks ?? []) {
      if (taskNeedsOwnershipReconciliation(task)) {
        const receipt = yield* requestValidation(task.id);
        yield* engine
          .readEvents(receipt.sequence - 1, 1)
          .pipe(
            Stream.runForEach((event) =>
              event.type === "task.ownership-validation-requested"
                ? worker.enqueue(event)
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
      yield* forkParked(
        Stream.runForEach(engine.streamDomainEvents, (event) => {
          if (
            event.type === "task.ownership-updated" ||
            event.type === "task.ownership-validation-requested" ||
            event.type === "task.workspace.ready" ||
            event.type === "thread.turn-diff-completed"
          ) {
            return worker.enqueue(event);
          }
          return Effect.void;
        }),
      );
      yield* reconcile;
    },
  );

  return { start, drain: worker.drain } satisfies TaskOwnershipReactorShape;
});

export const TaskOwnershipReactorLive = Layer.effect(TaskOwnershipReactor, make);
