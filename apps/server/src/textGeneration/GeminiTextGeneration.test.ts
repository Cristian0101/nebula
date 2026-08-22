// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { GeminiSettings, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { expect } from "vite-plus/test";

import * as ServerConfig from "../config.ts";
import { makeGeminiTextGeneration } from "./GeminiTextGeneration.ts";
import * as TextGeneration from "./TextGeneration.ts";

const decodeGeminiSettings = Schema.decodeSync(GeminiSettings);
const currentDirectory = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const mockAgentPath = NodePath.join(currentDirectory, "../../scripts/acp-mock-agent.ts");

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function makeWrapper(directory: string, environment: Record<string, string>): string {
  const binaryPath = NodePath.join(directory, "gemini");
  NodeFS.writeFileSync(
    binaryPath,
    [
      "#!/bin/sh",
      ...Object.entries(environment).map(
        ([key, value]) => `export ${key}=${shellSingleQuote(value)}`,
      ),
      'if [ "$1" != "--acp" ]; then exit 11; fi',
      `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(mockAgentPath)}`,
      "",
    ].join("\n"),
    "utf8",
  );
  NodeFS.chmodSync(binaryPath, 0o755);
  return binaryPath;
}

function withFakeGemini<A, E, R>(
  environment: Record<string, string>,
  use: (service: TextGeneration.TextGeneration["Service"]) => Effect.Effect<A, E, R>,
) {
  return Effect.gen(function* () {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "gemini-text-"));
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => NodeFS.rmSync(directory, { recursive: true, force: true })),
    );
    const service = yield* makeGeminiTextGeneration(
      decodeGeminiSettings({ binaryPath: makeWrapper(directory, environment) }),
    );
    return yield* use(service);
  }).pipe(Effect.scoped);
}

const testLayer = ServerConfig.ServerConfig.layerTest(process.cwd(), {
  prefix: "nebula-gemini-text-generation-test-",
}).pipe(Layer.provideMerge(NodeServices.layer));

it.layer(testLayer)("GeminiTextGeneration", (it) => {
  it.effect("uses shared ACP structured generation while Auto remains CLI-owned", () => {
    const requestLogPath = NodePath.join(
      NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "gemini-text-log-")),
      "requests.ndjson",
    );
    return withFakeGemini(
      {
        T3_ACP_REQUEST_LOG_PATH: requestLogPath,
        T3_ACP_PROMPT_RESPONSE_TEXT: JSON.stringify({
          subject: "Add Gemini provider",
          body: "Reuse the ACP runtime.",
        }),
      },
      (service) =>
        Effect.gen(function* () {
          const result = yield* service.generateCommitMessage({
            cwd: process.cwd(),
            branch: "feat/gemini",
            stagedSummary: "M GeminiDriver.ts",
            stagedPatch: "diff --git a/GeminiDriver.ts b/GeminiDriver.ts",
            modelSelection: createModelSelection(ProviderInstanceId.make("gemini"), "auto"),
          });
          expect(result).toEqual({
            subject: "Add Gemini provider",
            body: "Reuse the ACP runtime.",
          });

          const requests = NodeFS.readFileSync(requestLogPath, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as { method?: string });
          expect(requests.some((request) => request.method === "session/prompt")).toBe(true);
          expect(requests.some((request) => request.method === "session/set_model")).toBe(false);
        }),
    );
  });

  it.effect("passes an explicit manual model through ACP", () =>
    withFakeGemini(
      {
        T3_ACP_PROMPT_RESPONSE_TEXT: JSON.stringify({ title: "Gemini model selection" }),
      },
      (service) =>
        Effect.gen(function* () {
          const result = yield* service.generateThreadTitle({
            cwd: process.cwd(),
            message: "select a model",
            modelSelection: createModelSelection(
              ProviderInstanceId.make("gemini"),
              "grok-mock-alt",
            ),
          });
          expect(result.title).toBe("Gemini model selection");
        }),
    ),
  );
});
