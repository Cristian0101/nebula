import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EnvironmentId,
  ProviderInstanceId,
  ProviderDriverKind,
  type ServerProvider,
  type ProviderAuthenticationInput,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import {
  makeProviderAuthentication,
  type ProviderAuthentication,
  type ProviderAuthenticationFlow,
} from "./providerAuthentication.ts";
import {
  makeClaudeGuidedAuthenticationFlow,
  officialAuthenticationUrl,
  parseClaudeAuthenticationStatus,
} from "./providerAuthenticationFlows.ts";

const encodeUnknown = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const request = (
  operation: ProviderAuthenticationInput["operation"],
  extra: Partial<ProviderAuthenticationInput> = {},
): ProviderAuthenticationInput => ({
  environmentId: EnvironmentId.make("host-a"),
  instanceId: ProviderInstanceId.make("personal"),
  operation,
  ...extra,
});
const snapshot = (patch: Partial<ServerProvider> = {}) =>
  Effect.gen(function* () {
    const at = DateTime.formatIso(yield* DateTime.now);
    return {
      instanceId: ProviderInstanceId.make("personal"),
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      installed: true,
      version: "1.0.0",
      status: "ready",
      checkedAt: at,
      inspection: { status: "completed", verifiedAt: at },
      auth: { status: "unauthenticated" },
      models: [],
      slashCommands: [],
      skills: [],
      ...patch,
    } satisfies ServerProvider;
  });
const flow: ProviderAuthenticationFlow = {
  capability: "official-cli",
  ceremonies: ["browser"],
  run: () => Effect.never,
};
const stateEventually = (auth: ProviderAuthentication, expected: string) =>
  Effect.gen(function* () {
    for (let index = 0; index < 1000; index++) {
      const value = yield* auth.execute(request("status"));
      if (value.state === expected) return value;
      yield* Effect.yieldNow;
    }
    assert.fail(`Did not reach ${expected}`);
  });

it.layer(NodeServices.layer)("provider-owned authentication lifecycle", (it) => {
  it.effect("coalesces concurrent begins and cancels only the matching attempt", () =>
    Effect.gen(function* () {
      let starts = 0;
      let stopped = 0;
      const entered = yield* Deferred.make<void>();
      const auth = yield* makeProviderAuthentication({
        enabled: true,
        refresh: snapshot(),
        flow: {
          ...flow,
          run: () =>
            Effect.gen(function* () {
              starts++;
              yield* Deferred.succeed(entered, undefined);
              return yield* Effect.never;
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  stopped++;
                }),
              ),
            ),
        },
      });
      const [first, second] = yield* Effect.all(
        [auth.execute(request("begin")), auth.execute(request("begin"))],
        { concurrency: "unbounded" },
      );
      yield* Deferred.await(entered);
      assert.equal(first.attemptId, second.attemptId);
      assert.equal(starts, 1);
      assert.equal(
        (yield* auth.execute(request("cancel", { attemptId: "stale" }))).reason,
        "stale-attempt",
      );
      assert.equal(stopped, 0);
      const cancelled = yield* auth.execute(request("cancel", { attemptId: first.attemptId! }));
      assert.equal(cancelled.state, "cancelled");
      assert.isNull(cancelled.handoff);
      assert.equal(stopped, 1);
      const successor = yield* auth.execute(request("begin"));
      assert.notEqual(successor.attemptId, first.attemptId);
      assert.equal(
        (yield* auth.execute(request("cancel", { attemptId: first.attemptId! }))).reason,
        "stale-attempt",
      );
      assert.equal((yield* auth.execute(request("status"))).attemptId, successor.attemptId);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "requires fresh verification after successful browser handoff and preserves unknown entitlement",
    () =>
      Effect.gen(function* () {
        let authenticated = false;
        let refreshes = 0;
        const release = yield* Deferred.make<void>();
        const handedOff = yield* Deferred.make<void>();
        const auth = yield* makeProviderAuthentication({
          enabled: true,
          refresh: Effect.suspend(() => {
            refreshes++;
            return snapshot({
              auth: {
                status: authenticated ? "authenticated" : "unauthenticated",
                billingRoute: "subscription",
                subscriptionEntitlement: "unknown",
              },
            });
          }),
          flow: {
            ...flow,
            run: (_ceremony, progress) =>
              Effect.gen(function* () {
                yield* progress({ url: "https://cursor.com/login?synthetic=private" });
                yield* Deferred.succeed(handedOff, undefined);
                yield* Deferred.await(release);
                authenticated = true;
              }),
          },
        });
        yield* auth.execute(request("begin"));
        yield* Deferred.await(handedOff);
        assert.equal((yield* auth.execute(request("status"))).state, "waiting-for-user");
        yield* Deferred.succeed(release, undefined);
        const result = yield* stateEventually(auth, "authenticated");
        assert.isNull(result.handoff);
        assert.isNotNull(result.verifiedAt);
        assert.equal(refreshes, 2);
        assert.notProperty(result, "subscriptionEntitlement");
      }).pipe(Effect.scoped),
  );

  for (const [title, patch, expected] of [
    ["missing executable", { installed: false }, "not-installed"],
    ["unauthenticated account", {}, "login-required"],
    ["unknown account", { auth: { status: "unknown" } }, "verification-needed"],
    ["API account", { auth: { status: "authenticated", billingRoute: "api" } }, "authenticated"],
    [
      "cached readiness",
      { inspection: { status: "cached", verifiedAt: null } },
      "verification-needed",
    ],
  ] as const) {
    it.effect(`reports ${title} without inference`, () =>
      Effect.gen(function* () {
        let starts = 0;
        const auth = yield* makeProviderAuthentication({
          enabled: true,
          flow: {
            ...flow,
            run: () =>
              Effect.sync(() => {
                starts++;
              }),
          },
          refresh: snapshot(patch),
        });
        assert.equal((yield* auth.execute(request("refresh"))).state, expected);
        assert.equal(starts, 0);
      }).pipe(Effect.scoped),
    );
  }

  it.effect("keeps disabled and unsupported ceremonies explicit", () =>
    Effect.gen(function* () {
      const auth = yield* makeProviderAuthentication({
        enabled: false,
        flow,
        refresh: Effect.die("must not inspect"),
      });
      assert.equal((yield* auth.execute(request("begin"))).reason, "disabled");
      const other = yield* makeProviderAuthentication({ enabled: true, flow, refresh: snapshot() });
      assert.equal(
        (yield* other.execute(request("begin", { ceremony: "device-code" }))).state,
        "unsupported",
      );
    }).pipe(Effect.scoped),
  );

  it.effect("expires a hanging login and drains its worker", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      let stopped = false;
      const auth = yield* makeProviderAuthentication({
        enabled: true,
        timeoutMs: 1000,
        refresh: snapshot(),
        flow: {
          ...flow,
          run: () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(
                Effect.sync(() => {
                  stopped = true;
                }),
              ),
            ),
        },
      });
      yield* auth.execute(request("begin"));
      yield* Deferred.await(entered);
      yield* TestClock.adjust("2 seconds");
      assert.equal((yield* stateEventually(auth, "expired")).reason, "timeout");
      assert.isTrue(stopped);
    }).pipe(Effect.scoped),
  );

  it.effect("redacts failed process output and failed readiness refresh", () =>
    Effect.gen(function* () {
      const auth = yield* makeProviderAuthentication({
        enabled: true,
        refresh: snapshot(),
        flow: { ...flow, run: () => Effect.fail("synthetic-secret-provider-error") },
      });
      yield* auth.execute(request("begin"));
      const result = yield* stateEventually(auth, "failed");
      assert.notInclude(yield* encodeUnknown(result), "synthetic-secret");
      const broken = yield* makeProviderAuthentication({
        enabled: true,
        flow,
        refresh: Effect.die("synthetic-secret-refresh-error"),
      });
      const refreshed = yield* broken.execute(request("refresh"));
      assert.equal(refreshed.reason, "verification-failed");
      assert.notInclude(yield* encodeUnknown(refreshed), "synthetic-secret");
    }).pipe(Effect.scoped),
  );

  it.effect("does not convert process completion into account verification", () =>
    Effect.gen(function* () {
      const auth = yield* makeProviderAuthentication({
        enabled: true,
        refresh: snapshot(),
        flow: { ...flow, run: () => Effect.void },
      });
      yield* auth.execute(request("begin"));
      assert.equal((yield* stateEventually(auth, "login-required")).state, "login-required");
    }).pipe(Effect.scoped),
  );

  it.effect("keeps post-login refresh failure unverified", () =>
    Effect.gen(function* () {
      let refreshes = 0;
      const auth = yield* makeProviderAuthentication({
        enabled: true,
        flow: { ...flow, run: () => Effect.void },
        refresh: Effect.suspend(() =>
          ++refreshes === 1 ? snapshot() : Effect.die("synthetic-secret"),
        ),
      });
      yield* auth.execute(request("begin"));
      const result = yield* stateEventually(auth, "verification-needed");
      assert.equal(result.reason, "verification-failed");
      assert.isNull(result.handoff);
      assert.isNull(result.verifiedAt);
    }).pipe(Effect.scoped),
  );

  it.effect("supports guided Claude login and never removes API overrides", () =>
    Effect.gen(function* () {
      let authenticated = false;
      const auth = yield* makeProviderAuthentication({
        enabled: true,
        flow: makeClaudeGuidedAuthenticationFlow(false),
        refresh: Effect.suspend(() =>
          snapshot({ auth: { status: authenticated ? "authenticated" : "unauthenticated" } }),
        ),
      });
      const waiting = yield* auth.execute(request("begin", { ceremony: "terminal" }));
      assert.equal(waiting.state, "waiting-for-user");
      assert.isNull(waiting.handoff);
      authenticated = true;
      assert.equal((yield* auth.execute(request("refresh"))).state, "authenticated");
      const api = yield* makeProviderAuthentication({
        enabled: true,
        flow: makeClaudeGuidedAuthenticationFlow(true),
        refresh: snapshot({ auth: { status: "authenticated", billingRoute: "api" } }),
      });
      assert.equal((yield* api.execute(request("begin"))).reason, "api-override");
      assert.isNull((yield* api.execute(request("status"))).attemptId);
    }).pipe(Effect.scoped),
  );

  it.effect("detects expiry on fresh verification and isolates provider instances", () =>
    Effect.gen(function* () {
      let authenticated = true;
      const first = yield* makeProviderAuthentication({
        enabled: true,
        flow,
        refresh: Effect.suspend(() =>
          snapshot({ auth: { status: authenticated ? "authenticated" : "unauthenticated" } }),
        ),
      });
      const second = yield* makeProviderAuthentication({
        enabled: true,
        flow,
        refresh: snapshot(),
      });
      assert.equal((yield* first.execute(request("refresh"))).state, "authenticated");
      authenticated = false;
      assert.equal((yield* first.execute(request("refresh"))).state, "expired");
      assert.equal((yield* second.execute(request("status"))).reason, "provider-restarted");
    }).pipe(Effect.scoped),
  );
});

it("only accepts official HTTPS login destinations", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://auth.openai.com.evil.invalid/",
    "https://evil.invalid/",
    "https://user:password@auth.openai.com/",
    "http://auth.openai.com/",
    "https://auth.openai.com:444/",
  ])
    assert.isUndefined(officialAuthenticationUrl(value, "codex"));
  assert.equal(
    officialAuthenticationUrl("https://auth.openai.com/codex/device", "codex"),
    "https://auth.openai.com/codex/device",
  );
  assert.equal(
    officialAuthenticationUrl("https://cursor.com/login?challenge=synthetic", "cursor"),
    "https://cursor.com/login?challenge=synthetic",
  );
});
it("allowlists official Claude status and keeps billing distinct from entitlement", () => {
  assert.deepEqual(
    parseClaudeAuthenticationStatus(
      '{"loggedIn":true,"authMethod":"api_key","accessToken":"synthetic-secret"}',
    ),
    { status: "authenticated", billingRoute: "api", subscriptionEntitlement: "unknown" },
  );
  assert.equal(parseClaudeAuthenticationStatus('{"loggedIn":false}').status, "unauthenticated");
  assert.equal(parseClaudeAuthenticationStatus('{"error":"synthetic-secret"}').status, "unknown");
  assert.equal(parseClaudeAuthenticationStatus("bad json").status, "unknown");
});
