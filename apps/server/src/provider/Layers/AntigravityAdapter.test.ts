import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  AntigravitySettings,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderRuntimeEvent,
  ThreadId,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { describeAntigravityFailure, makeAntigravityAdapter } from "./AntigravityAdapter.ts";

const decodeSettings = Schema.decodeSync(AntigravitySettings);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const instanceId = ProviderInstanceId.make("antigravity");

it("surfaces rejected custom model ids without leaking CLI detail", () => {
  expect(describeAntigravityFailure('invalid model selection (--model "invented-model")')).toBe(
    "Antigravity rejected this model ID.",
  );
  expect(describeAntigravityFailure("network unavailable")).toBe("network unavailable");
});

it.layer(NodeServices.layer)("AntigravityAdapter", (it) => {
  it.effect("streams normalized events, validates cwd, and resumes by conversation id", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-agy-adapter-" });
        const canonicalDir = yield* fs.realPath(dir);
        const binary = path.join(dir, "agy");
        const argsLog = path.join(dir, "args.log");
        const init = encodeJson({
          event: "init",
          conversation_id: "conv-test",
          init: { cwd: dir, tools: ["write_file"], permission_mode: "default" },
        });
        const text = encodeJson({
          event: "step_update",
          step_update: {
            step_index: 1,
            step_type: "agent_response",
            state: "DONE",
            text_delta: "hello",
          },
        });
        const toolActive = encodeJson({
          event: "step_update",
          step_update: {
            step_index: 2,
            step_type: "tool",
            state: "ACTIVE",
            tool_name: "write_file",
            tool_info: { parameters: { path: "fixture-owned/a.txt" } },
          },
        });
        const toolDone = encodeJson({
          event: "step_update",
          step_update: {
            step_index: 2,
            step_type: "tool",
            state: "DONE",
            tool_name: "write_file",
            tool_info: { output: "ok" },
          },
        });
        const result = encodeJson({
          event: "result",
          result: {
            conversation_id: "conv-test",
            status: "SUCCESS",
            response: "hello",
            usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
          },
        });
        yield* fs.writeFileString(
          binary,
          [
            "#!/bin/sh",
            `printf '%s\\n' "$*" >> '${argsLog}'`,
            `printf '%s\\n' '${init}' '${text}' '${toolActive}' '${toolDone}' '${result}'`,
            "",
          ].join("\n"),
        );
        yield* fs.chmod(binary, 0o755);
        const adapter = yield* makeAntigravityAdapter(
          decodeSettings({ enabled: true, binaryPath: binary }),
          { instanceId },
        );
        const events: ProviderRuntimeEvent[] = [];
        const firstCompletion = yield* Deferred.make<void>();
        const secondCompletion = yield* Deferred.make<void>();
        let completionCount = 0;
        const collector = yield* Stream.runForEach(adapter.streamEvents, (event) =>
          Effect.gen(function* () {
            events.push(event);
            if (event.type !== "turn.completed") return;
            completionCount += 1;
            yield* Deferred.succeed(
              completionCount === 1 ? firstCompletion : secondCompletion,
              undefined,
            ).pipe(Effect.ignore);
          }),
        ).pipe(Effect.forkChild);
        const threadId = ThreadId.make("antigravity-test");
        yield* adapter.startSession({
          threadId,
          provider: ProviderDriverKind.make("antigravity"),
          cwd: dir,
          runtimeMode: "full-access",
        });
        yield* adapter.sendTurn({ threadId, input: "first" });
        yield* Deferred.await(firstCompletion);
        yield* adapter.sendTurn({ threadId, input: "second" });
        yield* Deferred.await(secondCompletion);
        const args = yield* fs.readFileString(argsLog);
        expect(args).toContain("--new-project --mode accept-edits");
        expect(args).toContain("--conversation conv-test");
        expect(args).toContain("--dangerously-skip-permissions");
        expect(events.some((event) => event.type === "content.delta")).toBe(true);
        expect(
          events.filter((event) => event.type === "turn.completed").map((event) => event.payload),
        ).toEqual([
          expect.objectContaining({ state: "completed" }),
          expect.objectContaining({ state: "completed" }),
        ]);
        const sessions = yield* adapter.listSessions();
        expect(sessions[0]?.cwd).toBe(canonicalDir);
        expect(sessions[0]?.resumeCursor).toEqual({
          schemaVersion: 1,
          conversationId: "conv-test",
        });
        yield* Fiber.interrupt(collector);
      }),
    ),
  );

  it.effect("cancels the managed process without deleting the workspace", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-agy-cancel-" });
        const binary = path.join(dir, "agy");
        const preserved = path.join(dir, "preserved.txt");
        yield* fs.writeFileString(preserved, "keep");
        yield* fs.writeFileString(binary, "#!/bin/sh\nsleep 30\n");
        yield* fs.chmod(binary, 0o755);
        const adapter = yield* makeAntigravityAdapter(
          decodeSettings({ enabled: true, binaryPath: binary }),
          { instanceId },
        );
        const threadId = ThreadId.make("antigravity-cancel");
        yield* adapter.startSession({ threadId, cwd: dir, runtimeMode: "full-access" });
        const turn = yield* adapter.sendTurn({ threadId, input: "wait" });
        yield* adapter.interruptTurn(threadId, turn.turnId);
        expect(yield* fs.readFileString(preserved)).toBe("keep");
        expect((yield* adapter.listSessions())[0]?.status).not.toBe("closed");
      }),
    ),
  );

  it.effect("fails a turn when init cwd does not match the canonical Task worktree", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-agy-cwd-" });
        const binary = path.join(dir, "agy");
        const init = encodeJson({
          event: "init",
          conversation_id: "conv-wrong-cwd",
          init: { cwd: "/tmp", tools: [], permission_mode: "default" },
        });
        yield* fs.writeFileString(
          binary,
          ["#!/bin/sh", `printf '%s\\n' '${init}'`, "sleep 30", ""].join("\n"),
        );
        yield* fs.chmod(binary, 0o755);
        const adapter = yield* makeAntigravityAdapter(
          decodeSettings({ enabled: true, binaryPath: binary }),
          { instanceId },
        );
        const threadId = ThreadId.make("antigravity-wrong-cwd");
        const completion = yield* Deferred.make<ProviderRuntimeEvent>();
        const collector = yield* Stream.runForEach(adapter.streamEvents, (event) =>
          event.type === "turn.completed"
            ? Deferred.succeed(completion, event).pipe(Effect.ignore)
            : Effect.void,
        ).pipe(Effect.forkChild);
        yield* adapter.startSession({ threadId, cwd: dir, runtimeMode: "full-access" });
        yield* adapter.sendTurn({ threadId, input: "test cwd" });
        const completed = yield* Deferred.await(completion);
        expect(completed.type).toBe("turn.completed");
        if (completed.type === "turn.completed") {
          expect(completed.payload).toEqual(
            expect.objectContaining({
              state: "failed",
              errorMessage: expect.stringContaining("canonical Task worktree"),
            }),
          );
        }
        expect((yield* adapter.listSessions())[0]?.status).toBe("error");
        yield* Fiber.interrupt(collector);
      }),
    ),
  );
});
