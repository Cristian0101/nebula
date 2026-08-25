import {
  TextGenerationError,
  type AntigravitySettings,
  type ModelSelection,
} from "@t3tools/contracts";
import { sanitizeBranchFragment, sanitizeFeatureBranchName } from "@t3tools/shared/git";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { buildAntigravityStructuredArgs } from "../provider/antigravity/AntigravityCommand.ts";
import * as TextGeneration from "./TextGeneration.ts";
import {
  buildBranchNamePrompt,
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  buildThreadTitlePrompt,
} from "./TextGenerationPrompts.ts";
import {
  normalizeCliError,
  sanitizeCommitSubject,
  sanitizePrTitle,
  sanitizeThreadTitle,
  toJsonSchemaObject,
} from "./TextGenerationUtils.ts";

const TIMEOUT_MS = 180_000;
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const decodeJsonOption = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

function extractJsonObject(input: string): string | undefined {
  const trimmed = input.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/, "")
    : trimmed;
  const start = unfenced.indexOf("{");
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < unfenced.length; index += 1) {
    const character = unfenced[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return unfenced.slice(start, index + 1);
  }
  return undefined;
}

function extractStructuredCandidates(value: unknown): ReadonlyArray<unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [value];
  const record = value as Record<string, unknown>;
  const candidates: unknown[] = [];
  if ("structured_output" in record) candidates.push(record.structured_output);
  if ("structuredOutput" in record) candidates.push(record.structuredOutput);
  if ("response" in record) {
    const response = record.response;
    if (typeof response !== "string") candidates.push(response);
    else {
      const decoded = decodeJsonOption(response);
      if (Option.isSome(decoded)) candidates.push(decoded.value);
      const jsonObject = extractJsonObject(response);
      if (jsonObject) {
        const decodedObject = decodeJsonOption(jsonObject);
        if (Option.isSome(decodedObject)) candidates.push(decodedObject.value);
      }
      candidates.push(response);
    }
  }
  if (typeof record.result === "object" && record.result !== null) {
    candidates.push(...extractStructuredCandidates(record.result));
  }
  candidates.push(value);
  return candidates;
}

export const makeAntigravityTextGeneration = Effect.fn("makeAntigravityTextGeneration")(function* (
  settings: AntigravitySettings,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const runJson = <S extends Schema.Top>(input: {
    readonly operation:
      | "generateCommitMessage"
      | "generatePrContent"
      | "generateBranchName"
      | "generateThreadTitle"
      | "generateStructured";
    readonly cwd: string;
    readonly prompt: string;
    readonly schema: S;
    readonly modelSelection: ModelSelection;
  }): Effect.Effect<S["Type"], TextGenerationError, S["DecodingServices"]> =>
    Effect.gen(function* () {
      const schemaJson = yield* encodeJson(toJsonSchemaObject(input.schema)).pipe(
        Effect.mapError(
          (cause) =>
            new TextGenerationError({
              operation: input.operation,
              detail: "Failed to encode Antigravity structured output schema.",
              cause,
            }),
        ),
      );
      const effort = getModelSelectionStringOptionValue(input.modelSelection, "effort");
      const args = buildAntigravityStructuredArgs({
        prompt: input.prompt,
        jsonSchema: schemaJson,
        model: input.modelSelection.model,
        ...(effort ? { effort } : {}),
      });
      const spawnCommand = yield* resolveSpawnCommand(settings.binaryPath || "agy", args, {
        env: environment,
      });
      const child = yield* spawner
        .spawn(
          ChildProcess.make(spawnCommand.command, spawnCommand.args, {
            cwd: input.cwd,
            env: environment,
            shell: spawnCommand.shell,
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            normalizeCliError("agy", input.operation, cause, "Failed to spawn Antigravity CLI"),
          ),
        );
      const collect = <E>(stream: Stream.Stream<Uint8Array, E>) =>
        stream.pipe(
          Stream.decodeText(),
          Stream.runFold(
            () => "",
            (all, chunk) => all + chunk,
          ),
          Effect.mapError((cause) =>
            normalizeCliError("agy", input.operation, cause, "Failed to read Antigravity output"),
          ),
        );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          collect(child.stdout),
          collect(child.stderr),
          child.exitCode.pipe(
            Effect.mapError((cause) =>
              normalizeCliError(
                "agy",
                input.operation,
                cause,
                "Failed to read Antigravity exit code",
              ),
            ),
          ),
        ],
        { concurrency: "unbounded" },
      );
      if (exitCode !== 0) {
        return yield* new TextGenerationError({
          operation: input.operation,
          detail: stderr.trim() || stdout.trim() || `Antigravity exited with code ${exitCode}.`,
        });
      }
      const envelope = yield* decodeJson(stdout).pipe(
        Effect.mapError(
          (cause) =>
            new TextGenerationError({
              operation: input.operation,
              detail: "Antigravity returned malformed structured JSON.",
              cause,
            }),
        ),
      );
      const decodeOutput = Schema.decodeEffect(input.schema);
      let lastCause: unknown;
      for (const candidate of extractStructuredCandidates(envelope)) {
        const decoded = yield* Effect.exit(decodeOutput(candidate));
        if (Exit.isSuccess(decoded)) return decoded.value;
        lastCause = decoded.cause;
      }
      return yield* new TextGenerationError({
        operation: input.operation,
        detail: "Antigravity returned invalid structured output.",
        cause: lastCause,
      });
    }).pipe(
      Effect.scoped,
      Effect.timeoutOption(TIMEOUT_MS),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new TextGenerationError({
                operation: input.operation,
                detail: "Antigravity structured generation timed out.",
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

  return {
    generateCommitMessage: Effect.fn("AntigravityText.generateCommitMessage")(function* (input) {
      const built = buildCommitMessagePrompt({
        branch: input.branch,
        stagedSummary: input.stagedSummary,
        stagedPatch: input.stagedPatch,
        includeBranch: input.includeBranch === true,
        policy: input.policy,
      });
      const generated = yield* runJson({
        operation: "generateCommitMessage",
        cwd: input.cwd,
        prompt: built.prompt,
        schema: built.outputSchema,
        modelSelection: input.modelSelection,
      });
      return {
        subject: sanitizeCommitSubject(generated.subject),
        body: generated.body.trim(),
        ...("branch" in generated && typeof generated.branch === "string"
          ? { branch: sanitizeFeatureBranchName(generated.branch) }
          : {}),
      };
    }),
    generatePrContent: Effect.fn("AntigravityText.generatePrContent")(function* (input) {
      const built = buildPrContentPrompt({
        baseBranch: input.baseBranch,
        headBranch: input.headBranch,
        commitSummary: input.commitSummary,
        diffSummary: input.diffSummary,
        diffPatch: input.diffPatch,
        policy: input.policy,
        changeRequestTemplate: input.changeRequestTemplate,
      });
      const generated = yield* runJson({
        operation: "generatePrContent",
        cwd: input.cwd,
        prompt: built.prompt,
        schema: built.outputSchema,
        modelSelection: input.modelSelection,
      });
      return { title: sanitizePrTitle(generated.title), body: generated.body.trim() };
    }),
    generateBranchName: Effect.fn("AntigravityText.generateBranchName")(function* (input) {
      const built = buildBranchNamePrompt({
        message: input.message,
        attachments: input.attachments,
      });
      const generated = yield* runJson({
        operation: "generateBranchName",
        cwd: input.cwd,
        prompt: built.prompt,
        schema: built.outputSchema,
        modelSelection: input.modelSelection,
      });
      return { branch: sanitizeBranchFragment(generated.branch) };
    }),
    generateThreadTitle: Effect.fn("AntigravityText.generateThreadTitle")(function* (input) {
      const built = buildThreadTitlePrompt({
        message: input.message,
        previousTitle: input.previousTitle,
        attachments: input.attachments,
      });
      const generated = yield* runJson({
        operation: "generateThreadTitle",
        cwd: input.cwd,
        prompt: built.prompt,
        schema: built.outputSchema,
        modelSelection: input.modelSelection,
      });
      return { title: sanitizeThreadTitle(generated.title) };
    }),
    generateStructured: Effect.fn("AntigravityText.generateStructured")(function* (input) {
      return yield* runJson({
        operation: "generateStructured",
        cwd: input.cwd,
        prompt: input.prompt,
        schema: input.outputSchema,
        modelSelection: input.modelSelection,
      });
    }),
  } satisfies TextGeneration.TextGeneration["Service"];
});
