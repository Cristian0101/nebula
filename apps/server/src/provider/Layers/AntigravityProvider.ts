import {
  type AntigravitySettings,
  type ModelCapabilities,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { causeErrorTag } from "@t3tools/shared/observability";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  type ProviderMaintenanceCapabilities,
} from "../providerMaintenance.ts";

const PRESENTATION = {
  displayName: "Antigravity",
  badgeLabel: "Early Access",
  showInteractionModeToggle: false,
  requiresNewThreadForModelChange: true,
} as const;
const AUTO_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [
    {
      id: "effort",
      label: "Reasoning",
      type: "select",
      options: [
        { id: "low", label: "Low" },
        { id: "medium", label: "Medium", isDefault: true },
        { id: "high", label: "High" },
      ],
      currentValue: "medium",
    },
  ],
});
const EXPLICIT_MODEL_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});
const DEFAULT_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "auto",
    name: "Auto",
    isDefault: true,
    isCustom: false,
    capabilities: AUTO_CAPABILITIES,
  },
];
const VERSION_PROBE_TIMEOUT_MS = 4_000;
const MODEL_PROBE_TIMEOUT_MS = 8_000;

export function parseAntigravityModelsOutput(output: string): ReadonlyArray<ServerProviderModel> {
  const discovered = new Map<string, ServerProviderModel>();
  for (const line of output.split(/\r?\n/gu)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "Fetching available models...") continue;
    const [slug, ...nameParts] = trimmed.split(/\t+/u);
    const normalizedSlug = slug?.trim();
    if (!normalizedSlug || normalizedSlug.includes(" ") || discovered.has(normalizedSlug)) continue;
    const name = nameParts.join(" ").trim() || normalizedSlug;
    discovered.set(normalizedSlug, {
      slug: normalizedSlug,
      name,
      isDefault: false,
      isCustom: false,
      capabilities: EXPLICIT_MODEL_CAPABILITIES,
    });
  }
  return [...discovered.values()];
}

export function antigravityModelsFromSettings(
  customModels: ReadonlyArray<string> | undefined,
  discoveredModels: ReadonlyArray<ServerProviderModel> = [],
): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(
    [...DEFAULT_MODELS, ...discoveredModels],
    customModels ?? [],
    EXPLICIT_MODEL_CAPABILITIES,
  );
}

export function buildInitialAntigravityProviderSnapshot(
  settings: AntigravitySettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = antigravityModelsFromSettings(settings.customModels);
    return buildServerProvider({
      presentation: PRESENTATION,
      enabled: settings.enabled,
      checkedAt,
      models,
      probe: settings.enabled
        ? {
            installed: true,
            version: null,
            status: "warning",
            auth: { status: "unknown" },
            message: "Checking Antigravity CLI availability...",
          }
        : {
            installed: false,
            version: null,
            status: "warning",
            auth: { status: "unknown" },
            message: "Antigravity is disabled in Nebula settings.",
          },
    });
  });
}

const runVersion = (settings: AntigravitySettings, environment: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const command = settings.binaryPath || "agy";
    const spawnCommand = yield* resolveSpawnCommand(command, ["--version"], { env: environment });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
        stdin: "ignore",
      }),
    );
  });

const runModels = (settings: AntigravitySettings, environment: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const command = settings.binaryPath || "agy";
    const spawnCommand = yield* resolveSpawnCommand(command, ["models"], { env: environment });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
        stdin: "ignore",
      }),
    );
  });

export const checkAntigravityProviderStatus = Effect.fn("checkAntigravityProviderStatus")(
  function* (
    settings: AntigravitySettings,
    environment: NodeJS.ProcessEnv = process.env,
  ): Effect.fn.Return<
    ServerProviderDraft,
    never,
    ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto
  > {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    const fallbackModels = antigravityModelsFromSettings(settings.customModels);
    if (!settings.enabled) return yield* buildInitialAntigravityProviderSnapshot(settings);

    const probe = yield* runVersion(settings, environment).pipe(
      Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
      Effect.result,
    );
    if (Result.isFailure(probe)) {
      const missing = isCommandMissingCause(probe.failure);
      return buildServerProvider({
        presentation: PRESENTATION,
        enabled: true,
        checkedAt,
        models: fallbackModels,
        probe: {
          installed: !missing,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: missing
            ? "Antigravity CLI (`agy`) is not installed or not on PATH."
            : "Failed to execute the Antigravity CLI health check.",
        },
      });
    }
    if (Option.isNone(probe.success)) {
      return buildServerProvider({
        presentation: PRESENTATION,
        enabled: true,
        checkedAt,
        models: fallbackModels,
        probe: {
          installed: true,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Antigravity is installed. Authentication is required or unverified.",
        },
      });
    }
    const output = probe.success.value;
    const version = parseGenericCliVersion(`${output.stdout}\n${output.stderr}`);
    const modelProbe =
      output.code === 0
        ? yield* runModels(settings, environment).pipe(
            Effect.timeoutOption(MODEL_PROBE_TIMEOUT_MS),
            Effect.result,
          )
        : null;
    const discoveredModels =
      modelProbe &&
      Result.isSuccess(modelProbe) &&
      Option.isSome(modelProbe.success) &&
      modelProbe.success.value.code === 0
        ? parseAntigravityModelsOutput(modelProbe.success.value.stdout)
        : [];
    const models = antigravityModelsFromSettings(settings.customModels, discoveredModels);
    return buildServerProvider({
      presentation: PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version,
        status: output.code === 0 ? "ready" : "error",
        auth: { status: "unknown" },
        message:
          output.code === 0
            ? discoveredModels.length > 0
              ? `Antigravity is installed. ${discoveredModels.length} models discovered from the CLI; authentication is required or unverified until a user starts a session.`
              : "Antigravity is installed. Model discovery was unavailable, so Auto and explicit custom model IDs remain available. Authentication is required or unverified until a user starts a session."
            : "Antigravity is installed but failed to run.",
      },
    });
  },
);

export const enrichAntigravitySnapshot = (input: {
  readonly snapshot: ServerProvider;
  readonly maintenanceCapabilities: ProviderMaintenanceCapabilities;
  readonly enableProviderUpdateChecks?: boolean;
  readonly publishSnapshot: (snapshot: ServerProvider) => Effect.Effect<void>;
  readonly httpClient: HttpClient.HttpClient;
}): Effect.Effect<void> =>
  enrichProviderSnapshotWithVersionAdvisory(input.snapshot, input.maintenanceCapabilities, {
    enableProviderUpdateChecks: input.enableProviderUpdateChecks,
  }).pipe(
    Effect.provideService(HttpClient.HttpClient, input.httpClient),
    Effect.flatMap(input.publishSnapshot),
    Effect.catchCause((cause) =>
      Effect.logWarning("Antigravity version advisory enrichment failed", {
        errorTag: causeErrorTag(cause),
      }),
    ),
    Effect.asVoid,
  );
