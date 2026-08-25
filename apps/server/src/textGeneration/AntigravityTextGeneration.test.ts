import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { AntigravitySettings, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAntigravityTextGeneration } from "./AntigravityTextGeneration.ts";

const decodeSettings = Schema.decodeSync(AntigravitySettings);

it.layer(NodeServices.layer)("AntigravityTextGeneration", (it) => {
  it.effect("uses official structured JSON flags and decodes the result envelope", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-agy-text-" });
        const binary = path.join(dir, "agy");
        const argsLog = path.join(dir, "args.log");
        yield* fs.writeFileString(
          binary,
          [
            "#!/bin/sh",
            `printf '%s\\n' "$*" > '${argsLog}'`,
            `printf '%s' '{"structured_output":{"title":"Antigravity provider ready"}}'`,
            "",
          ].join("\n"),
        );
        yield* fs.chmod(binary, 0o755);
        const service = yield* makeAntigravityTextGeneration(
          decodeSettings({ enabled: true, binaryPath: binary }),
        );
        const generated = yield* service.generateThreadTitle({
          cwd: dir,
          message: "Add Antigravity",
          modelSelection: createModelSelection(
            ProviderInstanceId.make("antigravity"),
            "manual-model",
            [{ id: "effort", value: "high" }],
          ),
        });
        expect(generated.title).toBe("Antigravity provider ready");
        const args = yield* fs.readFileString(argsLog);
        expect(args).toContain("--mode plan");
        expect(args).toContain("--output-format json");
        expect(args).toContain("--json-schema");
        expect(args).toContain("--model manual-model");
        expect(args).not.toContain("--effort");
        expect(args).not.toContain("--dangerously-skip-permissions");
      }),
    ),
  );

  it.effect("falls back to the fenced response when structured_output is incomplete", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-agy-fallback-" });
        const binary = path.join(dir, "agy");
        const response = JSON.stringify({
          structured_output: { toolAction: "Completing task" },
          response:
            '```json\n{"verdict":"approve","summary":"Reviewed"}\n```\n{"toolAction":"Completing task"}',
        });
        yield* fs.writeFileString(
          binary,
          ["#!/bin/sh", `printf '%s' '${response}'`, ""].join("\n"),
        );
        yield* fs.chmod(binary, 0o755);
        const service = yield* makeAntigravityTextGeneration(
          decodeSettings({ enabled: true, binaryPath: binary }),
        );
        const generated = yield* service.generateStructured({
          cwd: dir,
          prompt: "Review the change",
          outputSchema: Schema.Struct({
            verdict: Schema.Literal("approve"),
            summary: Schema.String,
          }),
          modelSelection: createModelSelection(ProviderInstanceId.make("antigravity"), "auto"),
        });
        expect(generated).toEqual({ verdict: "approve", summary: "Reviewed" });
      }),
    ),
  );
});
