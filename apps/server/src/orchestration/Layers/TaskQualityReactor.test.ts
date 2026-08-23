import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { ChildProcessSpawner } from "effect/unstable/process";
import { describe, expect } from "vite-plus/test";

import * as ProcessRunner from "../../processRunner.ts";
import { redactQualityGateOutput, runQualityGateProcess } from "./TaskQualityReactor.ts";

const output = (overrides: Partial<ProcessRunner.ProcessRunOutput> = {}) => ({
  stdout: "",
  stderr: "",
  code: ChildProcessSpawner.ExitCode(0),
  timedOut: false,
  stdoutTruncated: false,
  stderrTruncated: false,
  stdoutInvalidUtf8: false,
  stderrInvalidUtf8: false,
  ...overrides,
});

const runWith = (
  effect: Effect.Effect<ProcessRunner.ProcessRunOutput, ProcessRunner.ProcessRunError>,
) =>
  runQualityGateProcess({
    command: "vp test run focused.test.ts",
    cwd: "/tmp/task-worktree",
    timeoutSeconds: 30,
    platform: "darwin",
    processRunner: ProcessRunner.ProcessRunner.of({ run: () => effect }),
  });

describe("Task quality gate process", () => {
  it.effect("maps pass, failure, timeout, and truncated output", () =>
    Effect.gen(function* () {
      const passed = yield* runWith(Effect.succeed(output({ stdout: "ok" })));
      const failed = yield* runWith(
        Effect.succeed(
          output({ stderr: "assertion failed", code: ChildProcessSpawner.ExitCode(2) }),
        ),
      );
      const timedOut = yield* runWith(Effect.succeed(output({ code: null, timedOut: true })));
      const truncated = yield* runWith(
        Effect.succeed(output({ stdout: "x".repeat(9_000), stdoutTruncated: true })),
      );

      expect(passed).toMatchObject({ status: "passed", exitCode: 0, outputSummary: "ok" });
      expect(failed).toMatchObject({ status: "failed", exitCode: 2 });
      expect(timedOut).toMatchObject({ status: "timed_out", exitCode: null });
      expect(truncated.status).toBe("passed");
      expect(truncated.outputTruncated).toBe(true);
      expect(truncated.outputSummary).toHaveLength(8_000);
    }),
  );

  it.effect("maps spawn errors without exposing common secret assignments", () =>
    Effect.gen(function* () {
      const missing = yield* runWith(
        Effect.fail(
          new ProcessRunner.ProcessSpawnError({
            command: "/bin/sh",
            argumentCount: 2,
            cwd: "/tmp/task-worktree",
            cause: new Error("missing executable token=do-not-print"),
          }),
        ),
      );

      expect(missing.status).toBe("error");
      expect(redactQualityGateOutput("api_key=abc password:secret")).toBe(
        "api_key=[REDACTED] password=[REDACTED]",
      );
      expect(missing.outputSummary).not.toContain("do-not-print");
    }),
  );

  it.effect("is interruptible for user cancellation", () =>
    Effect.gen(function* () {
      const fiber = yield* runWith(Effect.never).pipe(Effect.forkChild);
      yield* Fiber.interrupt(fiber);
      const exit = yield* Fiber.await(fiber);
      expect(exit._tag).toBe("Failure");
    }),
  );
});
