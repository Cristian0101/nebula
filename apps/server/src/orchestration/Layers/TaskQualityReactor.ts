import {
  CommandId,
  type OrchestrationEvent,
  type OrchestrationTask,
  type QualityGateRun,
} from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { redactSensitiveText } from "@t3tools/shared/redaction";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import * as ProcessRunner from "../../processRunner.ts";
import { forkParked, forkParkedStream } from "../../serverActivation.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  TaskQualityReactor,
  type TaskQualityReactorShape,
} from "../Services/TaskQualityReactor.ts";
import { TaskChangeSetQuery } from "../TaskChangeSetQuery.ts";

type QualityEvent = Extract<
  OrchestrationEvent,
  { type: "task.quality.run-requested" | "task.quality.run-cancel-requested" }
>;

export const redactQualityGateOutput = redactSensitiveText;

export const runQualityGateProcess = Effect.fn("TaskQualityReactor.runQualityGateProcess")(
  function* (input: {
    readonly command: string;
    readonly cwd: string;
    readonly timeoutSeconds: number;
    readonly platform:
      | "aix"
      | "android"
      | "darwin"
      | "freebsd"
      | "haiku"
      | "linux"
      | "openbsd"
      | "sunos"
      | "win32"
      | "cygwin"
      | "netbsd";
    readonly processRunner: ProcessRunner.ProcessRunner["Service"];
  }) {
    const shell = input.platform === "win32" ? "cmd.exe" : "/bin/sh";
    const args =
      input.platform === "win32" ? ["/d", "/s", "/c", input.command] : ["-lc", input.command];
    const result = yield* input.processRunner
      .run({
        command: shell,
        args,
        cwd: input.cwd,
        timeout: `${input.timeoutSeconds} seconds`,
        timeoutBehavior: "timedOutResult",
        maxOutputBytes: 32_000,
        outputMode: "truncate",
        truncatedMarker: "\n[output truncated]",
      })
      .pipe(Effect.result);
    if (result._tag === "Failure") {
      return {
        status: "error" as const,
        exitCode: null,
        outputSummary: redactQualityGateOutput(result.failure.message),
        outputTruncated: false,
      };
    }
    return {
      status: result.success.timedOut
        ? ("timed_out" as const)
        : result.success.code === 0
          ? ("passed" as const)
          : ("failed" as const),
      exitCode: result.success.code,
      outputSummary: redactQualityGateOutput(
        [result.success.stdout, result.success.stderr].filter(Boolean).join("\n"),
      ),
      outputTruncated: result.success.stdoutTruncated || result.success.stderrTruncated,
    };
  },
);

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const taskChanges = yield* TaskChangeSetQuery;
  const processRunner = yield* ProcessRunner.ProcessRunner;
  const platform = yield* HostProcessPlatform;
  const fibers = yield* Ref.make(new Map<string, Fiber.Fiber<void, never>>());
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const commandId = (tag: string) =>
    crypto.randomUUIDv4.pipe(Effect.map((id) => CommandId.make(`server:${tag}:${id}`)));

  const resolveTask = Effect.fn("TaskQualityReactor.resolveTask")(function* (taskId: string) {
    const model = yield* snapshots.getCommandReadModel();
    return (model.tasks ?? []).find((task) => task.id === taskId) ?? null;
  });

  const finish = Effect.fn("TaskQualityReactor.finish")(function* (
    taskId: OrchestrationTask["id"],
    run: QualityGateRun,
  ) {
    yield* engine.dispatch({
      type: "task.quality.run-finished",
      commandId: yield* commandId("task-quality-run-finished"),
      taskId,
      run,
      createdAt: run.completedAt ?? (yield* now),
    });
  });

  const cancelRemaining = Effect.fn("TaskQualityReactor.cancelRemaining")(function* (
    taskId: OrchestrationTask["id"],
  ) {
    const task = yield* resolveTask(taskId);
    if (!task) return;
    const completedAt = yield* now;
    for (const run of task.qualityGateRuns ?? []) {
      if (run.status !== "queued" && run.status !== "running") continue;
      yield* finish(task.id, {
        ...run,
        status: "cancelled",
        completedAt,
        outputSummary: run.outputSummary || "Cancelled by user.",
      }).pipe(Effect.ignore);
    }
  });

  const runBatch = Effect.fn("TaskQualityReactor.runBatch")(function* (
    taskId: OrchestrationTask["id"],
    requestedRuns: ReadonlyArray<QualityGateRun>,
  ) {
    for (const requested of requestedRuns) {
      const task = yield* resolveTask(taskId);
      if (!task || task.reviewSnapshot?.id !== requested.snapshotId) return;
      if (!(yield* taskChanges.isCurrent(task).pipe(Effect.orElseSucceed(() => false)))) {
        const completedAt = yield* now;
        yield* finish(task.id, {
          ...requested,
          status: "stale",
          completedAt,
          outputSummary: "Snapshot changed before this gate could run.",
        });
        yield* engine.dispatch({
          type: "task.review.stale",
          commandId: yield* commandId("task-quality-pre-run-stale"),
          taskId: task.id,
          createdAt: completedAt,
        });
        return;
      }
      const startedAt = yield* now;
      const running: QualityGateRun = { ...requested, status: "running", startedAt };
      yield* engine.dispatch({
        type: "task.quality.run-started",
        commandId: yield* commandId("task-quality-run-started"),
        taskId: task.id,
        run: running,
        createdAt: startedAt,
      });
      const result = yield* runQualityGateProcess({
        command: running.command,
        cwd: running.cwd,
        timeoutSeconds: running.timeoutSeconds,
        platform,
        processRunner,
      });
      const completedAt = yield* now;
      const currentTask = yield* resolveTask(task.id);
      const current =
        currentTask !== null &&
        (yield* taskChanges.isCurrent(currentTask).pipe(Effect.orElseSucceed(() => false)));
      if (!current) {
        yield* finish(task.id, {
          ...running,
          status: "stale",
          completedAt,
          outputSummary: "The gate changed, or raced with a change to, the Task workspace.",
        });
        if (currentTask?.reviewSnapshot?.status === "current") {
          yield* engine.dispatch({
            type: "task.review.stale",
            commandId: yield* commandId("task-quality-post-run-stale"),
            taskId: task.id,
            createdAt: completedAt,
          });
        }
        return;
      }
      yield* finish(task.id, {
        ...running,
        status: result.status,
        exitCode: result.exitCode,
        completedAt,
        outputSummary: result.outputSummary,
        outputTruncated: result.outputTruncated,
      });
    }
  });

  const launch = Effect.fn("TaskQualityReactor.launch")(function* (
    taskId: OrchestrationTask["id"],
    runs: ReadonlyArray<QualityGateRun>,
  ) {
    const active = yield* Ref.get(fibers);
    if (active.has(taskId)) return;
    const fiber = yield* runBatch(taskId, runs).pipe(
      Effect.onInterrupt(() => cancelRemaining(taskId)),
      Effect.catchCause((cause) =>
        Effect.logWarning("Task quality run failed", { cause: Cause.pretty(cause) }),
      ),
      Effect.ensuring(
        Ref.update(fibers, (current) => {
          const next = new Map(current);
          next.delete(taskId);
          return next;
        }),
      ),
      Effect.forkScoped,
    );
    yield* Ref.update(fibers, (current) => new Map(current).set(taskId, fiber));
  });

  const process = Effect.fn("TaskQualityReactor.process")(function* (event: QualityEvent) {
    if (event.type === "task.quality.run-requested") {
      yield* launch(event.payload.taskId, event.payload.runs);
      return;
    }
    const active = yield* Ref.get(fibers);
    const fiber = active.get(event.payload.taskId);
    if (fiber) yield* Fiber.interrupt(fiber);
    else yield* cancelRemaining(event.payload.taskId);
  });

  const reconcile = Effect.gen(function* () {
    const model = yield* snapshots.getCommandReadModel();
    for (const task of model.tasks ?? []) {
      const queued = (task.qualityGateRuns ?? []).filter((run) => run.status === "queued");
      const running = (task.qualityGateRuns ?? []).filter((run) => run.status === "running");
      const completedAt = yield* now;
      for (const run of running) {
        yield* finish(task.id, {
          ...run,
          status: "error",
          completedAt,
          outputSummary: "Quality gate was interrupted by server restart.",
        }).pipe(Effect.ignore);
      }
      if (queued.length > 0) yield* launch(task.id, queued);
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Quality reconciliation failed", { cause: Cause.pretty(cause) }),
    ),
  );

  const start: TaskQualityReactorShape["start"] = Effect.fn("TaskQualityReactor.start")(
    function* () {
      yield* forkParkedStream(engine.streamDomainEvents, (event) =>
        event.type === "task.quality.run-requested" ||
        event.type === "task.quality.run-cancel-requested"
          ? process(event as QualityEvent)
          : Effect.void,
      );
      yield* forkParked(reconcile);
    },
  );

  const drain = Ref.get(fibers).pipe(
    Effect.flatMap((active) => Effect.forEach(active.values(), Fiber.await, { discard: true })),
    Effect.asVoid,
  );
  return { start, drain } satisfies TaskQualityReactorShape;
});

export const TaskQualityReactorLive = Layer.effect(TaskQualityReactor, make).pipe(
  Layer.provide(ProcessRunner.layer),
);
