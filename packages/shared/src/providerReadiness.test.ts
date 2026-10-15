import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { deriveProviderReadiness, PROVIDER_READINESS_MAX_AGE_MS } from "./providerReadiness.ts";

const environmentId = EnvironmentId.make("local");
const instanceId = ProviderInstanceId.make("personal");
const verifiedAt = "2026-10-15T12:00:00.000Z";
const now = Date.parse(verifiedAt);
const base: ServerProvider = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated", accountVerified: true, billingRoute: "subscription" },
  checkedAt: verifiedAt,
  inspection: { status: "completed", verifiedAt },
  modelCatalogSource: "provider",
  models: [
    {
      slug: "reported-model",
      name: "Reported model",
      isCustom: false,
      isDefault: true,
      capabilities: null,
    },
  ],
  slashCommands: [],
  skills: [],
};
const derive = (
  patch: Partial<ServerProvider> = {},
  extra: Partial<Parameters<typeof deriveProviderReadiness>[0]> = {},
) =>
  deriveProviderReadiness({
    environmentId,
    instanceId,
    connected: true,
    now,
    snapshot: { environmentId, provider: { ...base, ...patch } },
    ...extra,
  });

describe("provider readiness evidence", () => {
  it("blocks missing executables and unauthenticated providers independently", () => {
    expect(derive({ installed: false, version: null }).installed).toBe("blocked");
    expect(derive({ auth: { status: "unauthenticated" } })).toMatchObject({
      authentication: "blocked",
      billingRoute: "unknown",
      modelAvailability: "unknown",
      runtime: "blocked",
    });
  });
  it("keeps entitlement unknown for a verified account with a subscription route", () => {
    expect(derive()).toMatchObject({
      account: "verified",
      billingRoute: "subscription",
      subscriptionEntitlement: "unknown",
    });
  });
  it.each(["api", "subscription", "provider-managed", "unknown"] as const)(
    "preserves typed %s billing without reading labels",
    (billingRoute) => {
      expect(
        derive({
          auth: {
            status: "authenticated",
            billingRoute,
            label: "An arbitrary subscription-looking label",
          },
        }).billingRoute,
      ).toBe(billingRoute);
    },
  );
  it("never infers identity or billing from a plan label or legacy auth type", () => {
    expect(
      derive({
        auth: { status: "authenticated", type: "chatgpt", label: "ChatGPT Pro Subscription" },
      }),
    ).toMatchObject({ account: "unknown", billingRoute: "unknown" });
  });
  it("distinguishes a provider catalog from configured and custom models", () => {
    expect(derive().modelAvailability).toBe("verified");
    expect(derive({}, { selectedModel: "unsupported" })).toMatchObject({
      modelAvailability: "blocked",
      runtime: "blocked",
    });
    expect(derive({ modelCatalogSource: "configuration" }).modelAvailability).toBe("unknown");
    expect(derive({ models: [{ ...base.models[0]!, isCustom: true }] }).modelAvailability).toBe(
      "unknown",
    );
  });
  it("expires snapshots and rejects future verification times", () => {
    for (const time of [now + PROVIDER_READINESS_MAX_AGE_MS + 1, now - 1]) {
      expect(derive({}, { now: time })).toMatchObject({
        fresh: false,
        installed: "unknown",
        account: "unknown",
        billingRoute: "unknown",
        modelAvailability: "unknown",
        runtime: "unknown",
      });
    }
  });
  it.each(["pending", "cached"] as const)(
    "does not promote %s snapshots to fresh evidence",
    (status) => {
      expect(derive({ inspection: { status, verifiedAt } }).fresh).toBe(false);
    },
  );
  it("keeps legacy snapshots unknown and disabled drivers blocked", () => {
    expect(derive({ inspection: undefined }).runtime).toBe("unknown");
    expect(derive({ availability: "unavailable", enabled: false })).toMatchObject({
      registered: "blocked",
      runtime: "blocked",
    });
  });
  it("never crosses environment or instance boundaries", () => {
    expect(derive({}, { instanceId: ProviderInstanceId.make("work") }).registered).toBe("unknown");
    expect(derive({}, { environmentId: EnvironmentId.make("remote") }).registered).toBe("unknown");
    expect(derive({}, { connected: false })).toMatchObject({ fresh: false, runtime: "blocked" });
  });
  it("contains no account labels, emails, command output, or configuration secrets", () => {
    const result = derive({
      message: "secret-marker",
      auth: { status: "authenticated", email: "private@example.invalid", label: "secret-marker" },
    });
    expect(JSON.stringify(result)).not.toContain("secret-marker");
    expect(JSON.stringify(result)).not.toContain("private@example.invalid");
  });
});
