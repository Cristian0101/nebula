import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { GeminiSettings } from "@t3tools/contracts";

import { buildInitialGeminiProviderSnapshot, checkGeminiProviderStatus } from "./GeminiProvider.ts";

const decodeGeminiSettings = Schema.decodeSync(GeminiSettings);

describe("buildInitialGeminiProviderSnapshot", () => {
  it.effect("is opt-in and exposes only honest Auto plus configured manual ids", () =>
    Effect.gen(function* () {
      const disabled = yield* buildInitialGeminiProviderSnapshot(decodeGeminiSettings({}));
      expect(disabled.status).toBe("disabled");

      const enabled = yield* buildInitialGeminiProviderSnapshot(
        decodeGeminiSettings({ enabled: true, customModels: ["gemini-manual"] }),
      );
      expect(enabled.models.map((model) => model.slug)).toEqual(["auto", "gemini-manual"]);
      expect(enabled.requiresNewThreadForModelChange).toBe(false);
    }),
  );
});

it.layer(NodeServices.layer)("checkGeminiProviderStatus", (it) => {
  it.effect("reports a missing binary without starting authentication", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkGeminiProviderStatus(
        decodeGeminiSettings({
          enabled: true,
          binaryPath: "/definitely/not/installed/gemini-binary",
        }),
      );
      expect(snapshot.installed).toBe(false);
      expect(snapshot.status).toBe("error");
    }),
  );

  it.effect("marks a successful version probe ready with authentication unknown", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-gemini-version-" });
        const binaryPath = path.join(dir, "gemini");
        yield* fs.writeFileString(binaryPath, '#!/bin/sh\nprintf "0.56.0\\n"\n');
        yield* fs.chmod(binaryPath, 0o755);

        const snapshot = yield* checkGeminiProviderStatus(
          decodeGeminiSettings({ enabled: true, binaryPath }),
        );
        expect(snapshot.status).toBe("ready");
        expect(snapshot.installed).toBe(true);
        expect(snapshot.version).toBe("0.56.0");
        expect(snapshot.auth.status).toBe("unknown");
        expect(snapshot.message).toContain("Authentication is checked when a session starts");
      }),
    ),
  );
});
