import {
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeItemId,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import * as ChildProcessSpawnerType from "effect/unstable/process/ChildProcessSpawner";
import type { AntigravitySettings } from "@t3tools/contracts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
} from "../Errors.ts";
import type { AntigravityAdapterShape } from "../Services/AntigravityAdapter.ts";
import {
  antigravityTurnState,
  parseAntigravityStreamLine,
  safeAntigravitySummary,
  type AntigravityResultEvent,
  type AntigravityStepEvent,
} from "../antigravity/AntigravityStream.ts";
import { buildAntigravityTurnArgs } from "../antigravity/AntigravityCommand.ts";
import type { EventNdjsonLogger } from "./EventNdjsonLogger.ts";

const PROVIDER = ProviderDriverKind.make("antigravity");
const RESUME_VERSION = 1 as const;

interface ResumeCursor {
  readonly schemaVersion: typeof RESUME_VERSION;
  readonly conversationId: string;
}

interface ActiveTurn {
  readonly turnId: TurnId;
  readonly scope: Scope.Closeable;
  readonly handle: ChildProcessSpawnerType.ChildProcessHandle;
  fiber?: Fiber.Fiber<void, never>;
  cancelled: boolean;
  validationError?: string;
}

interface SessionContext {
  readonly threadId: ThreadId;
  readonly cwd: string;
  session: ProviderSession;
  conversationId?: string;
  active: ActiveTurn | undefined;
  turns: Array<{ id: TurnId; items: Array<unknown> }>;
  stopped: boolean;
}

export interface AntigravityAdapterOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly instanceId?: ProviderInstanceId;
  readonly nativeEventLogger?: EventNdjsonLogger;
}

export function describeAntigravityFailure(value: unknown): string | undefined {
  const summary = safeAntigravitySummary(value);
  if (!summary) return undefined;
  return /invalid model selection|model(?: id)? .*?(?:not found|unknown|unsupported)|unknown model/iu.test(
    summary,
  )
    ? "Antigravity rejected this model ID."
    : summary;
}

function parseResumeCursor(value: unknown): ResumeCursor | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === RESUME_VERSION &&
    typeof record.conversationId === "string" &&
    record.conversationId.trim()
    ? { schemaVersion: RESUME_VERSION, conversationId: record.conversationId.trim() }
    : undefined;
}

function canonicalToolItemType(
  name: string,
): "command_execution" | "file_change" | "web_search" | "dynamic_tool_call" {
  const normalized = name.toLowerCase();
  if (normalized.includes("command") || normalized.includes("shell")) return "command_execution";
  if (
    normalized.includes("write") ||
    normalized.includes("edit") ||
    normalized.includes("delete") ||
    normalized.includes("move")
  )
    return "file_change";
  if (normalized.includes("search_web") || normalized.includes("read_url")) return "web_search";
  return "dynamic_tool_call";
}

function assistantStep(step: AntigravityStepEvent): boolean {
  return ["agent_response", "assistant", "agent", "model_response"].includes(step.stepType);
}

function usageSnapshot(usage: Record<string, unknown> | undefined, durationSeconds?: number) {
  if (!usage && durationSeconds === undefined) return undefined;
  const integer = (key: string) => {
    const value = usage?.[key];
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
  };
  return {
    ...(integer("total_tokens") !== undefined ? { usedTokens: integer("total_tokens") } : {}),
    ...(integer("input_tokens") !== undefined ? { inputTokens: integer("input_tokens") } : {}),
    ...(integer("cache_read_tokens") !== undefined
      ? { cachedInputTokens: integer("cache_read_tokens") }
      : {}),
    ...(integer("output_tokens") !== undefined ? { outputTokens: integer("output_tokens") } : {}),
    ...(integer("thinking_tokens") !== undefined
      ? { reasoningOutputTokens: integer("thinking_tokens") }
      : {}),
    ...(durationSeconds !== undefined ? { durationMs: Math.round(durationSeconds * 1000) } : {}),
  };
}

export const makeAntigravityAdapter = Effect.fn("makeAntigravityAdapter")(function* (
  settings: AntigravitySettings,
  options: AntigravityAdapterOptions = {},
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const adapterScope = yield* Scope.Scope;
  const crypto = yield* Crypto.Crypto;
  const fileSystem = yield* FileSystem.FileSystem;
  const instanceId = options.instanceId ?? ProviderInstanceId.make("antigravity");
  const environment = options.environment ?? process.env;
  const sessions = new Map<ThreadId, SessionContext>();
  const events = yield* Queue.unbounded<ProviderRuntimeEvent>();

  const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
  const makeId = <T>(brand: (value: string) => T) =>
    crypto.randomUUIDv4.pipe(
      Effect.map(brand),
      Effect.mapError(
        (cause) =>
          new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "crypto/randomUUIDv4",
            detail: "Failed to generate an Antigravity runtime identifier.",
            cause,
          }),
      ),
    );
  const stamp = () => Effect.all({ eventId: makeId(EventId.make), createdAt: nowIso });
  const offer = (event: ProviderRuntimeEvent) =>
    Queue.offer(events, event).pipe(
      Effect.andThen(
        options.nativeEventLogger
          ? options.nativeEventLogger.write(event, event.threadId).pipe(Effect.ignore)
          : Effect.void,
      ),
      Effect.asVoid,
    );

  const requireSession = (
    threadId: ThreadId,
  ): Effect.Effect<SessionContext, ProviderAdapterSessionNotFoundError> => {
    const session = sessions.get(threadId);
    return session && !session.stopped
      ? Effect.succeed(session)
      : Effect.fail(new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId }));
  };

  const startSession: AntigravityAdapterShape["startSession"] = (input) =>
    Effect.gen(function* () {
      if (input.provider && input.provider !== PROVIDER) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "startSession",
          issue: `Expected provider '${PROVIDER}' but received '${input.provider}'.`,
        });
      }
      const cwd = yield* fileSystem.realPath(input.cwd ?? process.cwd()).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "startSession",
              issue: `Failed to resolve the Task workspace: ${cause.message}`,
            }),
        ),
      );
      const resume = parseResumeCursor(input.resumeCursor);
      const createdAt = yield* nowIso;
      const session: ProviderSession = {
        provider: PROVIDER,
        providerInstanceId: instanceId,
        threadId: input.threadId,
        runtimeMode: input.runtimeMode,
        status: "ready",
        cwd,
        ...(input.modelSelection?.instanceId === instanceId
          ? { model: input.modelSelection.model }
          : {}),
        ...(resume ? { resumeCursor: resume } : {}),
        createdAt,
        updatedAt: createdAt,
      };
      sessions.set(input.threadId, {
        threadId: input.threadId,
        cwd,
        session,
        ...(resume ? { conversationId: resume.conversationId } : {}),
        active: undefined,
        turns: [],
        stopped: false,
      });
      yield* offer({
        type: "session.started",
        ...(yield* stamp()),
        provider: PROVIDER,
        providerInstanceId: instanceId,
        threadId: input.threadId,
        payload: resume ? { resume } : {},
      });
      return session;
    });

  const completeTurn = Effect.fn("Antigravity.completeTurn")(function* (
    ctx: SessionContext,
    active: ActiveTurn,
    result: AntigravityResultEvent | undefined,
    stderr: string,
    exitCode: number,
  ) {
    const state = active.cancelled
      ? "cancelled"
      : active.validationError
        ? "failed"
        : result
          ? antigravityTurnState(result.status)
          : "failed";
    const errorMessage =
      state === "failed"
        ? describeAntigravityFailure(
            active.validationError ||
              result?.error ||
              result?.response ||
              stderr ||
              `Antigravity exited with code ${exitCode}.`,
          )
        : undefined;
    yield* offer({
      type: "turn.completed",
      ...(yield* stamp()),
      provider: PROVIDER,
      providerInstanceId: instanceId,
      threadId: ctx.threadId,
      turnId: active.turnId,
      payload: {
        state,
        stopReason:
          active.validationError ??
          result?.status ??
          (active.cancelled ? "CANCELED" : "PROCESS_EXIT"),
        ...(result?.usage ? { usage: result.usage } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      },
      ...(result ? { raw: { source: "antigravity.stream-json", payload: result.raw } } : {}),
    });
    if (result?.usage || result?.durationSeconds !== undefined) {
      const usage = usageSnapshot(result.usage, result.durationSeconds);
      if (usage && "usedTokens" in usage) {
        yield* offer({
          type: "thread.token-usage.updated",
          ...(yield* stamp()),
          provider: PROVIDER,
          providerInstanceId: instanceId,
          threadId: ctx.threadId,
          turnId: active.turnId,
          payload: {
            usage: usage as Extract<
              ProviderRuntimeEvent,
              { type: "thread.token-usage.updated" }
            >["payload"]["usage"],
          },
        });
      }
    }
    ctx.session = {
      ...ctx.session,
      status: state === "failed" ? "error" : "ready",
      activeTurnId: undefined,
      updatedAt: yield* nowIso,
      ...(errorMessage ? { lastError: errorMessage } : {}),
    };
    if (ctx.active === active) ctx.active = undefined;
    yield* Scope.close(active.scope, Exit.void).pipe(Effect.ignore);
  });

  const handleStep = Effect.fn("Antigravity.handleStep")(function* (
    ctx: SessionContext,
    active: ActiveTurn,
    step: AntigravityStepEvent,
    assistantStarted: Ref.Ref<boolean>,
  ) {
    if (assistantStep(step) && step.text) {
      const itemId = RuntimeItemId.make(`antigravity-assistant-${active.turnId}`);
      if (!(yield* Ref.get(assistantStarted))) {
        yield* Ref.set(assistantStarted, true);
        yield* offer({
          type: "item.started",
          ...(yield* stamp()),
          provider: PROVIDER,
          providerInstanceId: instanceId,
          threadId: ctx.threadId,
          turnId: active.turnId,
          itemId,
          payload: { itemType: "assistant_message", status: "inProgress" },
        });
      }
      yield* offer({
        type: "content.delta",
        ...(yield* stamp()),
        provider: PROVIDER,
        providerInstanceId: instanceId,
        threadId: ctx.threadId,
        turnId: active.turnId,
        itemId,
        payload: { streamKind: "assistant_text", delta: step.text },
        raw: { source: "antigravity.stream-json", payload: step.raw },
      });
    }
    if (step.tool) {
      const itemId = RuntimeItemId.make(`antigravity-tool-${active.turnId}-${step.stepIndex}`);
      const terminal = step.state === "DONE" || step.state === "ERROR";
      const status = step.state === "ERROR" ? "failed" : terminal ? "completed" : "inProgress";
      yield* offer({
        type: terminal
          ? "item.completed"
          : step.state === "ACTIVE"
            ? "item.started"
            : "item.updated",
        ...(yield* stamp()),
        provider: PROVIDER,
        providerInstanceId: instanceId,
        threadId: ctx.threadId,
        turnId: active.turnId,
        itemId,
        payload: {
          itemType: canonicalToolItemType(step.tool.name),
          status,
          title: step.tool.name,
          data: {
            ...(safeAntigravitySummary(step.tool.parameters)
              ? { parameters: safeAntigravitySummary(step.tool.parameters) }
              : {}),
            ...(safeAntigravitySummary(step.tool.output)
              ? { output: safeAntigravitySummary(step.tool.output) }
              : {}),
            ...(step.tool.error ? { error: step.tool.error } : {}),
          },
        },
        raw: { source: "antigravity.stream-json", payload: step.raw },
      });
    }
  });

  const sendTurn: AntigravityAdapterShape["sendTurn"] = (input) =>
    Effect.gen(function* () {
      const ctx = yield* requireSession(input.threadId);
      if (ctx.active) {
        return yield* new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: "turn/start",
          detail: "Antigravity already has a turn running for this Thread.",
        });
      }
      if (input.attachments?.length) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "sendTurn",
          issue: "Antigravity headless image attachments are not supported by this adapter.",
        });
      }
      const prompt = input.input?.trim();
      if (!prompt) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "sendTurn",
          issue: "Turn requires non-empty text.",
        });
      }
      const turnId = yield* makeId(TurnId.make);
      const modelSelection =
        input.modelSelection?.instanceId === instanceId ? input.modelSelection : undefined;
      const effort = modelSelection
        ? getModelSelectionStringOptionValue(modelSelection, "effort")
        : undefined;
      const args = buildAntigravityTurnArgs({
        prompt,
        ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
        ...(modelSelection ? { model: modelSelection.model } : {}),
        ...(effort ? { effort } : {}),
        ...(input.interactionMode === "plan" ? { plan: true } : {}),
        ...(ctx.session.runtimeMode === "full-access" ? { fullAccess: true } : {}),
      });
      const spawnCommand = yield* resolveSpawnCommand(settings.binaryPath || "agy", args, {
        env: environment,
      });
      const turnScope = yield* Scope.make("sequential");
      const handle = yield* spawner
        .spawn(
          ChildProcess.make(spawnCommand.command, spawnCommand.args, {
            cwd: ctx.cwd,
            env: environment,
            shell: spawnCommand.shell,
          }),
        )
        .pipe(
          Effect.provideService(Scope.Scope, turnScope),
          Effect.mapError(
            (cause) =>
              new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId: input.threadId,
                detail: `Failed to spawn Antigravity: ${cause.message}`,
                cause,
              }),
          ),
        );
      const active: ActiveTurn = { turnId, scope: turnScope, handle, cancelled: false };
      ctx.active = active;
      ctx.session = {
        ...ctx.session,
        status: "running",
        activeTurnId: turnId,
        ...(modelSelection ? { model: modelSelection.model } : {}),
        updatedAt: yield* nowIso,
      };
      ctx.turns.push({ id: turnId, items: [{ prompt }] });
      yield* offer({
        type: "turn.started",
        ...(yield* stamp()),
        provider: PROVIDER,
        providerInstanceId: instanceId,
        threadId: input.threadId,
        turnId,
        payload: {
          ...(modelSelection ? { model: modelSelection.model } : {}),
          ...(effort ? { effort } : {}),
        },
      });

      const run = Effect.gen(function* () {
        const assistantStarted = yield* Ref.make(false);
        const resultRef = yield* Ref.make<AntigravityResultEvent | undefined>(undefined);
        const malformedCount = yield* Ref.make(0);
        const stderrFiber = yield* handle.stderr.pipe(
          Stream.decodeText(),
          Stream.runFold(
            () => "",
            (all, chunk) => all + chunk,
          ),
          Effect.forkIn(adapterScope),
        );
        yield* handle.stdout.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.runForEach((line) =>
            Effect.gen(function* () {
              const event = parseAntigravityStreamLine(line);
              if (!event) return;
              if (event.event === "malformed") {
                yield* Ref.update(malformedCount, (count) => count + 1);
                return;
              }
              if (event.event === "init") {
                ctx.conversationId = event.conversationId;
                const resume: ResumeCursor = {
                  schemaVersion: RESUME_VERSION,
                  conversationId: event.conversationId,
                };
                ctx.session = { ...ctx.session, resumeCursor: resume, updatedAt: yield* nowIso };
                const reportedCwd = event.cwd
                  ? yield* fileSystem.realPath(event.cwd).pipe(Effect.option)
                  : undefined;
                if (!reportedCwd || reportedCwd._tag === "None" || reportedCwd.value !== ctx.cwd) {
                  active.validationError =
                    "Antigravity reported a cwd that does not match the canonical Task worktree.";
                  yield* offer({
                    type: "runtime.error",
                    ...(yield* stamp()),
                    provider: PROVIDER,
                    providerInstanceId: instanceId,
                    threadId: ctx.threadId,
                    turnId,
                    payload: {
                      class: "validation_error",
                      message: active.validationError,
                    },
                  });
                  yield* handle.kill().pipe(Effect.ignore);
                }
              } else if (event.event === "step_update") {
                yield* handleStep(ctx, active, event, assistantStarted);
              } else {
                if (event.conversationId) {
                  ctx.conversationId = event.conversationId;
                  ctx.session = {
                    ...ctx.session,
                    resumeCursor: {
                      schemaVersion: RESUME_VERSION,
                      conversationId: event.conversationId,
                    },
                    updatedAt: yield* nowIso,
                  };
                }
                yield* Ref.set(resultRef, event);
                if (!(yield* Ref.get(assistantStarted)) && event.response) {
                  const itemId = RuntimeItemId.make(`antigravity-assistant-${turnId}`);
                  yield* offer({
                    type: "item.started",
                    ...(yield* stamp()),
                    provider: PROVIDER,
                    providerInstanceId: instanceId,
                    threadId: ctx.threadId,
                    turnId,
                    itemId,
                    payload: { itemType: "assistant_message", status: "inProgress" },
                  });
                  yield* offer({
                    type: "content.delta",
                    ...(yield* stamp()),
                    provider: PROVIDER,
                    providerInstanceId: instanceId,
                    threadId: ctx.threadId,
                    turnId,
                    itemId,
                    payload: { streamKind: "assistant_text", delta: event.response },
                  });
                  yield* Ref.set(assistantStarted, true);
                }
              }
            }),
          ),
        );
        const exitCode = Number(
          yield* handle.exitCode.pipe(
            Effect.orElseSucceed(() => ChildProcessSpawnerType.ExitCode(1)),
          ),
        );
        const stderr = yield* Fiber.join(stderrFiber).pipe(Effect.orElseSucceed(() => ""));
        if (yield* Ref.get(assistantStarted)) {
          yield* offer({
            type: "item.completed",
            ...(yield* stamp()),
            provider: PROVIDER,
            providerInstanceId: instanceId,
            threadId: ctx.threadId,
            turnId,
            itemId: RuntimeItemId.make(`antigravity-assistant-${turnId}`),
            payload: { itemType: "assistant_message", status: "completed" },
          });
        }
        if ((yield* Ref.get(malformedCount)) > 0 && !(yield* Ref.get(resultRef))) {
          yield* offer({
            type: "runtime.error",
            ...(yield* stamp()),
            provider: PROVIDER,
            providerInstanceId: instanceId,
            threadId: ctx.threadId,
            turnId,
            payload: {
              class: "transport_error",
              message: "Antigravity returned a malformed or incomplete stream-json response.",
            },
          });
        }
        yield* completeTurn(ctx, active, yield* Ref.get(resultRef), stderr, exitCode);
      }).pipe(
        Effect.catchCause((cause) =>
          completeTurn(ctx, active, undefined, String(cause), 1).pipe(Effect.ignore),
        ),
      );
      active.fiber = yield* run.pipe(Effect.forkIn(adapterScope));
      return {
        threadId: input.threadId,
        turnId,
        ...(ctx.conversationId
          ? {
              resumeCursor: {
                schemaVersion: RESUME_VERSION,
                conversationId: ctx.conversationId,
              },
            }
          : {}),
      };
    });

  const interruptTurn: AntigravityAdapterShape["interruptTurn"] = (threadId, turnId) =>
    requireSession(threadId).pipe(
      Effect.flatMap((ctx) => {
        const active = ctx.active;
        if (!active || (turnId && active.turnId !== turnId)) return Effect.void;
        active.cancelled = true;
        return active.handle.kill().pipe(
          Effect.mapError(
            (cause) =>
              new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId,
                detail: `Failed to stop Antigravity: ${cause.message}`,
                cause,
              }),
          ),
        );
      }),
    );

  const stopSession: AntigravityAdapterShape["stopSession"] = (threadId) =>
    Effect.gen(function* () {
      const ctx = sessions.get(threadId);
      if (!ctx) return;
      ctx.stopped = true;
      sessions.delete(threadId);
      if (ctx.active) {
        ctx.active.cancelled = true;
        yield* ctx.active.handle.kill().pipe(Effect.ignore);
        if (ctx.active.fiber) yield* Fiber.interrupt(ctx.active.fiber).pipe(Effect.ignore);
        yield* Scope.close(ctx.active.scope, Exit.void).pipe(Effect.ignore);
      }
    });

  const stopAll = () =>
    Effect.forEach(Array.from(sessions.keys()), stopSession, { discard: true, concurrency: 1 });
  yield* Effect.acquireRelease(Effect.void, () =>
    stopAll().pipe(Effect.andThen(Queue.shutdown(events)), Effect.ignore),
  );

  return {
    provider: PROVIDER,
    capabilities: { sessionModelSwitch: "unsupported" },
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest: (threadId) =>
      Effect.fail(
        new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: "request/respond",
          detail: `Antigravity headless permissions are provider-owned for Thread '${threadId}'.`,
        }),
      ),
    respondToUserInput: (threadId) =>
      Effect.fail(
        new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: "user-input/respond",
          detail: `Antigravity headless questions cannot be answered through Nebula for Thread '${threadId}'.`,
        }),
      ),
    stopSession,
    listSessions: () =>
      Effect.succeed(
        Array.from(sessions.values())
          .filter((ctx) => !ctx.stopped)
          .map((ctx) => ctx.session),
      ),
    hasSession: (threadId) =>
      Effect.succeed(Boolean(sessions.get(threadId) && !sessions.get(threadId)?.stopped)),
    readThread: (threadId) =>
      requireSession(threadId).pipe(Effect.map((ctx) => ({ threadId, turns: ctx.turns }))),
    rollbackThread: (threadId) =>
      Effect.fail(
        new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: "thread/rollback",
          detail: `Antigravity conversation rollback is not supported for Thread '${threadId}'.`,
        }),
      ),
    stopAll,
    get streamEvents() {
      return Stream.fromQueue(events);
    },
  } satisfies AntigravityAdapterShape;
});
