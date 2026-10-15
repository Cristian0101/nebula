import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  ProviderInstanceId,
  ProviderDriverKind,
  type ServerProvider,
  type ProviderAuthenticationStatus,
} from "@t3tools/contracts";
import { deriveProviderReadiness } from "@t3tools/shared/providerReadiness";
import { deriveProviderConnectionStatus } from "./providerConnectionStatus";
import { authenticationMetadata } from "./useProviderAuthenticationAttempt";
import {
  BILLING_COPY,
  LIFECYCLE_COPY,
  RECOVERY_COPY,
  READINESS_FACTS,
  factCopy,
} from "./providerReadinessCopy";
import { parseProviderConnectionsSearch } from "./providerConnectionsSearch";
import { officialHandoffHost } from "./providerSignInCopy";
const environmentId = EnvironmentId.make("synthetic-host");
const instanceId = ProviderInstanceId.make("codex");
const now = Date.parse("2026-10-15T20:00:00Z");
const provider = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  displayName: "Codex",
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: {
    status: "authenticated",
    accountVerified: true,
    billingRoute: "subscription",
    subscriptionEntitlement: "unknown",
  },
  inspection: { status: "completed", verifiedAt: new Date(now).toISOString() },
  modelCatalogSource: "provider",
  models: [{ slug: "synthetic-model", isDefault: true }],
} as unknown as ServerProvider;
const lifecycle = {
  environmentId,
  environmentLabel: "Synthetic host",
  instanceId,
  driver: provider.driver,
  capability: "managed-app-server",
  ceremonies: ["browser", "device-code"],
  state: "login-required",
  attemptId: null,
  expiresAt: null,
  verifiedAt: null,
  reason: "login-required",
  handoff: null,
  guidance: null,
} as ProviderAuthenticationStatus;
function derive(
  p: ServerProvider = provider,
  extras: Partial<Parameters<typeof deriveProviderConnectionStatus>[0]> = {},
  connected = true,
) {
  return deriveProviderConnectionStatus({
    readiness: deriveProviderReadiness({
      environmentId,
      instanceId,
      snapshot: { environmentId, provider: p },
      connected,
      now,
    }),
    connected,
    enabled: p.enabled !== false,
    canManage: true,
    canOperate: true,
    capabilityAvailable: true,
    now,
    ...extras,
  });
}
const signedOut = { ...provider, auth: { status: "unauthenticated" as const } };
describe("D0.2 synthetic connection fixtures", () => {
  it.each([
    ["Codex ready", provider, {}, "ready", "Ready"],
    [
      "Codex stale",
      {
        ...provider,
        inspection: { status: "completed", verifiedAt: new Date(now - 720_000).toISOString() },
      },
      {},
      "unverified",
      "Verification expired",
    ],
    ["Codex remote browser", signedOut, { lifecycle }, "attention", "Sign-in required"],
    [
      "Codex custom launch",
      signedOut,
      { lifecycle: { ...lifecycle, capability: "unsupported", ceremonies: [] } },
      "attention",
      "Sign-in required",
    ],
    [
      "Cursor waiting",
      signedOut,
      { lifecycle: { ...lifecycle, state: "waiting-for-user" } },
      "signing-in",
      "Waiting for you",
    ],
    [
      "Claude override",
      provider,
      { lifecycle: { ...lifecycle, state: "verification-needed", reason: "api-override" } },
      "attention",
      "API credential overrides sign-in",
    ],
    [
      "Claude guided",
      signedOut,
      { lifecycle: { ...lifecycle, state: "waiting-for-user" } },
      "signing-in",
      "Waiting for you",
    ],
    [
      "Grok unknown",
      { ...provider, auth: { status: "unknown" } },
      {},
      "unverified",
      "Sign-in not verified",
    ],
    ["Antigravity disabled", { ...provider, enabled: false }, {}, "off", "Disabled"],
    ["Remote disconnected", provider, { connected: false }, "disconnected", "Disconnected"],
    ["Read-only client", signedOut, { canManage: false }, "attention", "Sign-in required"],
  ] as const)("%s", (_name, p, extras, group, label) => {
    const status = derive(p as ServerProvider, extras as Parameters<typeof derive>[1]);
    expect(status.group).toBe(group);
    expect(status.label).toBe(label);
    if ("canManage" in extras && extras.canManage === false) {
      expect(status.primaryAction).toBeNull();
      expect(status.subline).toBe("Needs Manage access");
    }
  });
  it("never promotes a successful login or plan label to readiness", () => {
    const result = derive(
      { ...signedOut, auth: { ...signedOut.auth, label: "Ultra subscription" } },
      { lifecycle: { ...lifecycle, state: "authenticated", reason: "none" } },
    );
    expect(result.group).toBe("attention");
  });
  it("keeps every lifecycle state and reason mapped without exposing raw errors", () => {
    for (const state of Object.keys(LIFECYCLE_COPY))
      for (const reason of Object.keys(RECOVERY_COPY)) {
        const result = derive(provider, {
          lifecycle: { ...lifecycle, state, reason } as ProviderAuthenticationStatus,
        });
        expect(result.label).toBeTruthy();
        expect(LIFECYCLE_COPY[state as keyof typeof LIFECYCLE_COPY]).toBeTruthy();
        expect(RECOVERY_COPY[reason as keyof typeof RECOVERY_COPY]).toBeTruthy();
      }
    for (const [fact] of READINESS_FACTS)
      for (const state of ["verified", "blocked", "unknown"] as const)
        expect(factCopy(fact, state)).toBeTruthy();
    expect(Object.keys(BILLING_COPY)).toHaveLength(4);
  });
  it("strips handoff and guidance from the volatile mirror", () => {
    const mirrored = authenticationMetadata({
      ...lifecycle,
      handoff: { url: "https://auth.openai.com/synthetic", userCode: "XXXX-XXXX" },
      guidance: "private guidance",
    });
    expect(mirrored).not.toHaveProperty("handoff");
    expect(mirrored).not.toHaveProperty("guidance");
    expect(JSON.stringify(mirrored)).not.toContain("XXXX");
  });
});
describe("navigation and handoff boundaries", () => {
  it.each([
    undefined,
    "https://auth.openai.com/private",
    "XXXX XXXX",
    "../codex",
    "a".repeat(200),
    ["codex"],
    { url: "secret" },
  ])("rejects non-navigation input %s", (value) =>
    expect(parseProviderConnectionsSearch({ connections: value })).toEqual({}),
  );
  it("keeps only navigation identifiers", () =>
    expect(
      parseProviderConnectionsSearch({
        connections: "codex",
        connectionsEnv: "remote-host",
        code: "XXXX-XXXX",
        url: "private",
      }),
    ).toEqual({ connections: "codex", connectionsEnv: "remote-host" }));
  it.each([
    "javascript:alert(1)",
    "https://openai.com.evil.example",
    "https://evil.example",
    "http://auth.openai.com",
    "https://user:pass@auth.openai.com",
  ])("rejects unmanaged handoff %s", (value) =>
    expect(officialHandoffHost(value, provider.driver)).toBeNull(),
  );
  it("accepts the official provider host only", () =>
    expect(officialHandoffHost("https://auth.openai.com/synthetic", provider.driver)).toBe(
      "auth.openai.com",
    ));
});
