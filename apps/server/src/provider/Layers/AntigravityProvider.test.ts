import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { AntigravitySettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  antigravityModelsFromSettings,
  buildInitialAntigravityProviderSnapshot,
  checkAntigravityProviderStatus,
} from "./AntigravityProvider.ts";

const decodeSettings = Schema.decodeSync(AntigravitySettings);

describe("Antigravity provider status", () => {
  it.effect("is opt-in and truthful before a user-driven authentication test", () =>
    Effect.gen(function* () {
      const disabled = yield* buildInitialAntigravityProviderSnapshot(decodeSettings({}));
      expect(disabled.status).toBe("disabled");
      const enabled = yield* buildInitialAntigravityProviderSnapshot(
        decodeSettings({ enabled: true }),
      );
      expect(enabled.status).toBe("warning");
      expect(enabled.auth.status).toBe("unknown");
    }),
  );

  it("uses Auto plus explicit manual model ids", () => {
    expect(antigravityModelsFromSettings(["Gemini 3.7 Flash"]).map((model) => model.slug)).toEqual([
      "auto",
      "Gemini 3.7 Flash",
    ]);
  });
});

it.layer(NodeServices.layer)("checkAntigravityProviderStatus", (it) => {
  it.effect("reports a missing binary without starting authentication", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkAntigravityProviderStatus(
        decodeSettings({ enabled: true, binaryPath: "/definitely/not/installed/agy" }),
      );
      expect(snapshot.installed).toBe(false);
      expect(snapshot.auth.status).toBe("unknown");
    }),
  );

  it.effect("reports installed with authentication unverified from --version only", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-agy-version-" });
          const binary = path.join(dir, "agy");
          yield* fs.writeFileString(binary, '#!/bin/sh\nprintf "1.1.18\\n"\n');
          yield* fs.chmod(binary, 0o755);
          return yield* checkAntigravityProviderStatus(
            decodeSettings({ enabled: true, binaryPath: binary }),
          );
        }),
      );
      expect(snapshot.installed).toBe(true);
      expect(snapshot.version).toBe("1.1.18");
      expect(snapshot.status).toBe("ready");
      expect(snapshot.auth.status).toBe("unknown");
      expect(snapshot.message).toContain("required or unverified");
    }),
  );
});
