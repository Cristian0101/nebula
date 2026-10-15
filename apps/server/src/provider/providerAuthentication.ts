import type {
  ProviderAuthenticationCeremony,
  ProviderAuthenticationInput,
  ProviderAuthenticationStatus,
  ServerProvider,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Semaphore from "effect/Semaphore";

export type AuthenticationProgress = NonNullable<ProviderAuthenticationStatus["handoff"]>;
export type AuthenticationSnapshot = Omit<
  ProviderAuthenticationStatus,
  "environmentId" | "environmentLabel" | "instanceId" | "driver"
>;
export interface ProviderAuthentication {
  readonly execute: (input: ProviderAuthenticationInput) => Effect.Effect<AuthenticationSnapshot>;
}
export interface ProviderAuthenticationFlow {
  readonly capability: AuthenticationSnapshot["capability"];
  readonly ceremonies: ReadonlyArray<ProviderAuthenticationCeremony>;
  readonly guidance?: string;
  readonly apiOverride?: boolean;
  readonly run: (
    ceremony: ProviderAuthenticationCeremony,
    progress: (handoff: AuthenticationProgress) => Effect.Effect<void>,
  ) => Effect.Effect<void, string>;
}

export const unsupportedAuthentication = (
  reason: AuthenticationSnapshot["reason"] = "unsupported",
): AuthenticationSnapshot => ({
  capability: "unsupported",
  ceremonies: [],
  state: "unsupported",
  reason,
  attemptId: null,
  expiresAt: null,
  verifiedAt: null,
  handoff: null,
  guidance: null,
});

/** Instance-owned, volatile lifecycle. No event log, credential storage, or execution session. */
export const makeProviderAuthentication = Effect.fn("makeProviderAuthentication")(
  function* (input: {
    readonly enabled: boolean;
    readonly flow: ProviderAuthenticationFlow;
    readonly refresh: Effect.Effect<ServerProvider>;
    readonly timeoutMs?: number;
  }) {
    const scope = yield* Effect.scope;
    const crypto = yield* Crypto.Crypto;
    const mutex = yield* Semaphore.make(1);
    const timeoutMs = input.timeoutMs ?? 300_000;
    let state: AuthenticationSnapshot = {
      ...unsupportedAuthentication(),
      capability: input.flow.capability,
      ceremonies: input.flow.ceremonies,
      state: "verification-needed",
      reason: "provider-restarted",
      guidance: input.flow.guidance ?? null,
    };
    let active: { id: string; fiber?: Fiber.Fiber<void> } | undefined;
    let closed = false;
    let installationVerified = false;
    const now = Effect.map(DateTime.now, DateTime.toEpochMillis);
    const update = (patch: Partial<AuthenticationSnapshot>) =>
      Effect.sync(() => {
        state = { ...state, ...patch };
      });
    const finish = (patch: Partial<AuthenticationSnapshot>) =>
      update({
        handoff: null,
        expiresAt: null,
        ...patch,
      });
    const verify = (stillCurrent: () => boolean = () => true) =>
      Effect.gen(function* () {
        const commit = (patch: Partial<AuthenticationSnapshot>) =>
          Effect.suspend(() => (stillCurrent() && !closed ? finish(patch) : Effect.void));
        const before = yield* now;
        installationVerified = false;
        const snapshot = yield* input.refresh.pipe(Effect.timeoutOption("30 seconds"));
        if (Option.isNone(snapshot))
          return yield* commit({
            state: "verification-needed",
            reason: "verification-failed",
            verifiedAt: null,
          });
        const provider = snapshot.value;
        const verifiedAt = provider.inspection?.verifiedAt;
        if (
          provider.inspection?.status !== "completed" ||
          !verifiedAt ||
          Date.parse(verifiedAt) < before
        ) {
          return yield* commit({
            state: "verification-needed",
            reason: "verification-failed",
            verifiedAt: null,
          });
        }
        if (!provider.installed)
          return yield* commit({
            state: "not-installed",
            reason: "missing-executable",
            verifiedAt,
          });
        installationVerified = true;
        const authenticated = provider.auth.status === "authenticated";
        const expired =
          state.state === "authenticated" && provider.auth.status === "unauthenticated";
        yield* commit({
          state: authenticated
            ? "authenticated"
            : expired
              ? "expired"
              : provider.auth.status === "unauthenticated"
                ? "login-required"
                : "verification-needed",
          reason: authenticated
            ? "none"
            : provider.auth.status === "unauthenticated"
              ? "login-required"
              : "verification-failed",
          verifiedAt,
        });
      }).pipe(
        Effect.catchCause(() =>
          Effect.suspend(() =>
            stillCurrent() && !closed
              ? finish({
                  state: "verification-needed",
                  reason: "verification-failed",
                  verifiedAt: null,
                })
              : Effect.void,
          ),
        ),
      );

    const execute: ProviderAuthentication["execute"] = (request) =>
      mutex.withPermit(
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            if (closed)
              return {
                ...unsupportedAuthentication("provider-restarted"),
                state: "verification-needed" as const,
              };
            if (!input.enabled) return { ...unsupportedAuthentication("disabled") };
            if (active && state.expiresAt && (yield* now) >= Date.parse(state.expiresAt)) {
              const attempt = active;
              active = undefined;
              yield* finish({ state: "expired", reason: "timeout", verifiedAt: null });
              if (attempt.fiber) yield* Fiber.interrupt(attempt.fiber);
              return state;
            }
            if (request.operation === "cancel") {
              if (!active || request.attemptId !== active.id)
                return { ...state, handoff: null, reason: "stale-attempt" as const };
              const attempt = active;
              active = undefined;
              yield* finish({ state: "cancelled", reason: "cancelled", verifiedAt: null });
              if (attempt.fiber) yield* Fiber.interrupt(attempt.fiber);
              return state;
            }
            if (active) {
              if (request.operation === "refresh" && input.flow.capability === "guided-terminal") {
                yield* restore(verify());
                if (state.state === "authenticated") {
                  const attempt = active;
                  active = undefined;
                  if (attempt.fiber) yield* Fiber.interrupt(attempt.fiber);
                } else {
                  yield* update({ state: "waiting-for-user" });
                }
              }
              return state;
            }
            if (request.operation === "status") return state;
            yield* restore(verify());
            if (request.operation === "refresh" || !installationVerified) return state;
            const ceremony = request.ceremony ?? input.flow.ceremonies[0];
            if (!ceremony || !input.flow.ceremonies.includes(ceremony))
              return { ...state, state: "unsupported" as const, reason: "unsupported" as const };
            // Login never removes an API override or silently changes its billing route.
            if (input.flow.apiOverride)
              return {
                ...state,
                state: "verification-needed" as const,
                reason: "api-override" as const,
              };
            const id = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
            const attempt = { id } as { id: string; fiber?: Fiber.Fiber<void> };
            active = attempt;
            yield* update({
              state:
                input.flow.capability === "guided-terminal" ? "waiting-for-user" : "in-progress",
              reason: "none",
              attemptId: id,
              expiresAt: DateTime.formatIso(DateTime.makeUnsafe((yield* now) + timeoutMs)),
              verifiedAt: null,
              handoff: null,
            });
            const work = Effect.gen(function* () {
              const result = yield* input.flow
                .run(ceremony, (handoff) =>
                  Effect.sync(() => {
                    if (active === attempt)
                      state = { ...state, state: "waiting-for-user", handoff };
                  }),
                )
                .pipe(Effect.timeoutOption(timeoutMs), Effect.result);
              if (active !== attempt) return;
              if (result._tag === "Failure") {
                yield* finish({
                  state: result.failure === "unsupported" ? "unsupported" : "failed",
                  reason: result.failure === "unsupported" ? "unsupported" : "process-failed",
                  verifiedAt: null,
                });
              } else if (Option.isNone(result.success)) {
                yield* finish({ state: "expired", reason: "timeout", verifiedAt: null });
              } else {
                yield* verify(() => active === attempt);
              }
              if (active === attempt) active = undefined;
            }).pipe(
              Effect.catchCause(() =>
                Effect.gen(function* () {
                  if (active !== attempt) return;
                  yield* finish({ state: "failed", reason: "process-failed", verifiedAt: null });
                  active = undefined;
                }),
              ),
            );
            attempt.fiber = yield* work.pipe(Effect.interruptible, Effect.forkIn(scope));
            return state;
          }),
        ),
      );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true;
        active = undefined;
        state = {
          ...state,
          handoff: null,
          state: "verification-needed",
          reason: "provider-restarted",
        };
      }),
    );
    return { execute } satisfies ProviderAuthentication;
  },
);
