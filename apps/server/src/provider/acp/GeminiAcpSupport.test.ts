import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  applyGeminiAcpModelSelection,
  buildGeminiAcpSpawnInput,
  resolveGeminiAcpBaseModelId,
} from "./GeminiAcpSupport.ts";

describe("GeminiAcpSupport", () => {
  it("launches the official CLI in ACP mode inside the supplied workspace", () => {
    expect(
      buildGeminiAcpSpawnInput({ binaryPath: "/usr/local/bin/gemini" }, "/tmp/task-worktree", {
        SAFE_VALUE: "preserved",
      }),
    ).toEqual({
      command: "/usr/local/bin/gemini",
      args: ["--acp"],
      cwd: "/tmp/task-worktree",
      env: { SAFE_VALUE: "preserved" },
    });
  });

  it("keeps Auto provider-owned and passes manual model ids through", () => {
    expect(resolveGeminiAcpBaseModelId(undefined)).toBeUndefined();
    expect(resolveGeminiAcpBaseModelId("auto")).toBeUndefined();
    expect(resolveGeminiAcpBaseModelId("  gemini-custom-model  ")).toBe("gemini-custom-model");
  });

  it.effect("uses ACP session model switching only for an explicit changed model", () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const runtime = {
        setSessionModel: (modelId: string) =>
          Effect.sync(() => {
            calls.push(modelId);
            return {};
          }),
      };

      const selected = yield* applyGeminiAcpModelSelection({
        runtime,
        currentModelId: "gemini-current",
        requestedModelId: "gemini-manual",
        mapError: (cause) => cause,
      });
      const unchanged = yield* applyGeminiAcpModelSelection({
        runtime,
        currentModelId: selected,
        requestedModelId: undefined,
        mapError: (cause) => cause,
      });

      expect(calls).toEqual(["gemini-manual"]);
      expect(unchanged).toBe("gemini-manual");
    }),
  );
});
