// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import {
  GeminiSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";

import { ServerConfig } from "../../config.ts";
import { makeGeminiAdapter } from "./GeminiAdapter.ts";

const decodeGeminiSettings = Schema.decodeSync(GeminiSettings);
const currentDirectory = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const mockAgentPath = NodePath.join(currentDirectory, "../../../scripts/acp-mock-agent.ts");

async function makeMockGeminiWrapper(environment: Record<string, string>) {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "gemini-acp-mock-"));
  const wrapperPath = NodePath.join(directory, "gemini");
  const exports = Object.entries(environment)
    .map(([key, value]) => `export ${key}=${JSON.stringify(value)}`)
    .join("\n");
  await NodeFSP.writeFile(
    wrapperPath,
    `#!/bin/sh\n${exports}\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(mockAgentPath)} "$@"\n`,
    "utf8",
  );
  await NodeFSP.chmod(wrapperPath, 0o755);
  return wrapperPath;
}

const geminiAdapterTestLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "nebula-gemini-adapter-test-",
}).pipe(Layer.provideMerge(NodeServices.layer));

it.layer(geminiAdapterTestLayer)("GeminiAdapter", (it) => {
  it.effect("runs ACP in the canonical workspace and normalizes a prompt lifecycle", () =>
    Effect.gen(function* () {
      const requestLogPath = NodePath.join(
        yield* Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "gemini-acp-request-log-")),
        ),
        "requests.ndjson",
      );
      const binaryPath = yield* Effect.promise(() =>
        makeMockGeminiWrapper({ T3_ACP_REQUEST_LOG_PATH: requestLogPath }),
      );
      const adapter = yield* makeGeminiAdapter(decodeGeminiSettings({ binaryPath }), {
        instanceId: ProviderInstanceId.make("gemini"),
      });
      const events: ProviderRuntimeEvent[] = [];
      const eventFiber = yield* Stream.runForEach(adapter.streamEvents, (event) =>
        Effect.sync(() => events.push(event)),
      ).pipe(Effect.forkChild);
      const threadId = ThreadId.make("gemini-worktree-thread");
      const workspace = NodePath.resolve(process.cwd());

      const session = yield* adapter.startSession({
        threadId,
        provider: ProviderDriverKind.make("gemini"),
        cwd: workspace,
        runtimeMode: "full-access",
        modelSelection: { instanceId: ProviderInstanceId.make("gemini"), model: "auto" },
      });
      const turn = yield* adapter.sendTurn({ threadId, input: "hello gemini", attachments: [] });
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(eventFiber);

      assert.equal(session.provider, "gemini");
      assert.equal(session.cwd, workspace);
      assert.deepEqual(session.resumeCursor, { schemaVersion: 1, sessionId: "mock-session-1" });
      assert.equal(turn.threadId, threadId);
      assert.includeMembers(
        events.map((event) => event.type),
        ["session.started", "thread.started", "turn.started", "content.delta", "turn.completed"],
      );

      const requestLog = yield* Effect.promise(() => NodeFSP.readFile(requestLogPath, "utf8"));
      const requests = requestLog
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { method?: string; params?: { cwd?: string } });
      assert.equal(
        requests.find((request) => request.method === "session/new")?.params?.cwd,
        workspace,
      );

      yield* adapter.stopSession(threadId);
    }),
  );
});
