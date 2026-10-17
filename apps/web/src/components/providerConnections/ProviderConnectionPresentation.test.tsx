import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProviderInstanceId,
  ProviderDriverKind,
  type ServerProvider,
  type ProviderAuthenticationStatus,
} from "@t3tools/contracts";
import { deriveProviderReadiness } from "@t3tools/shared/providerReadiness";
import { ProviderConnectionDetail } from "./ProviderConnectionDetail";
import { ProviderSignInPanel } from "./ProviderSignInPanel";
import { ProviderHandoff } from "./ProviderHandoff";
import { deriveProviderConnectionStatus } from "./providerConnectionStatus";
import type { ProviderAuthenticationAttempt } from "./useProviderAuthenticationAttempt";
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, string>;
  }) => (
    <a {...props} href={`${to}?${new URLSearchParams(search)}`}>
      {children}
    </a>
  ),
}));
const environmentId = EnvironmentId.make("synthetic-host");
const now = Date.now();
const provider = {
  instanceId: ProviderInstanceId.make("codex"),
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
  models: [{ slug: "synthetic", name: "Synthetic model", isDefault: true }],
} as unknown as ServerProvider;
const lifecycle: ProviderAuthenticationStatus = {
  environmentId,
  environmentLabel: "Synthetic host",
  instanceId: provider.instanceId,
  driver: provider.driver,
  capability: "managed-app-server",
  ceremonies: ["browser", "device-code"],
  state: "authenticated",
  reason: "none",
  attemptId: null,
  expiresAt: null,
  verifiedAt: null,
  handoff: null,
  guidance: null,
};
function attempt(status = lifecycle): ProviderAuthenticationAttempt {
  return {
    status,
    canManage: true,
    busy: false,
    error: false,
    phase: "outcome",
    begin: vi.fn(),
    cancel: vi.fn(),
    refresh: vi.fn(),
    readStatus: vi.fn(),
  };
}
function detail(p = provider, a = attempt(), selectedModel?: string, capability = true) {
  const readiness = deriveProviderReadiness({
    environmentId,
    instanceId: p.instanceId,
    snapshot: { environmentId, provider: p },
    selectedModel,
    connected: true,
    now,
  });
  const status = deriveProviderConnectionStatus({
    readiness,
    lifecycle: a.status,
    connected: true,
    enabled: p.enabled !== false,
    canManage: true,
    canOperate: true,
    capabilityAvailable: true,
    now,
  });
  return renderToStaticMarkup(
    <ProviderConnectionDetail
      provider={p}
      environmentId={environmentId}
      instance={undefined}
      host="Synthetic host"
      remote={false}
      readiness={readiness}
      status={status}
      attempt={a}
      canOperate
      capability={capability}
      now={now}
      check={vi.fn()}
      back={vi.fn()}
      close={vi.fn()}
    />,
  );
}
describe("E3.5 provider connection presentation", () => {
  it("offers Enable in Provider Settings for disabled providers without a check button", () => {
    const html = detail(
      { ...provider, enabled: false },
      attempt({ ...lifecycle, state: "verification-needed", reason: "disabled" }),
    );
    expect(html).toContain("Enable in Provider Settings");
    expect(html).toContain("instance=codex&amp;environment=synthetic-host");
    expect(html).not.toContain(">Check again</");
  });
  it("offers an install guide and reachable settings for missing CLIs", () => {
    const html = detail(
      { ...provider, installed: false, status: "error" },
      attempt({
        ...lifecycle,
        state: "not-installed",
        reason: "missing-executable",
        ceremonies: [],
      }),
    );
    expect(html).toContain("Install guide");
    expect(html).toContain("Review in Provider Settings");
  });
  it("routes an unavailable selected model to Provider Settings", () => {
    const html = detail(provider, attempt(), "unavailable-model");
    expect(html).toContain("Choose another model");
    expect(html).toContain("instance=codex&amp;environment=synthetic-host");
  });
  it("offers settings for an unavailable registered driver", () => {
    expect(detail({ ...provider, availability: "unavailable" })).toContain(
      "Review in Provider Settings",
    );
  });
  it("keeps older hosts on readiness checks without sign-in controls", () => {
    const html = detail(provider, attempt(), undefined, false);
    expect(html).toContain("without sign-in support");
    expect(html).toContain(">Check again</");
    expect(html).not.toContain(">Sign in again</");
  });
  it("offers settings for an API override without a sign-in button", () => {
    const html = detail(
      provider,
      attempt({ ...lifecycle, state: "verification-needed", reason: "api-override" }),
    );
    expect(html).toContain("Review in Provider Settings");
    expect(html).not.toContain(">Sign in again</");
  });
  it("keeps unsupported recovery settings outside an active ceremony", () => {
    expect(
      detail(
        provider,
        attempt({ ...lifecycle, state: "unsupported", reason: "unsupported", ceremonies: [] }),
      ),
    ).toContain("Review in Provider Settings");
  });
  it("gives success exactly Done and View readiness in the sign-in panel", () => {
    const html = renderToStaticMarkup(
      <ProviderSignInPanel
        provider={provider}
        host="Synthetic host"
        remote={false}
        instance={undefined}
        attempt={attempt({ ...lifecycle, attemptId: "synthetic-attempt" })}
        done={vi.fn()}
      />,
    );
    expect(html).toContain(">Done</");
    expect(html).toContain("View readiness");
    expect(html).not.toContain("Sign in again");
    expect(html).not.toContain("Check status");
    expect(html).not.toContain("Use a device code instead");
  });
  it.each(["failed", "expired"] as const)("announces %s assertively", (state) => {
    expect(
      renderToStaticMarkup(
        <ProviderSignInPanel
          provider={provider}
          host="Synthetic host"
          remote={false}
          instance={undefined}
          attempt={attempt({
            ...lifecycle,
            state,
            reason: state === "expired" ? "timeout" : "process-failed",
          })}
          done={vi.fn()}
        />,
      ),
    ).toContain('role="alert"');
  });
  it("separates configured executable code from its Copy control", () => {
    const html = renderToStaticMarkup(
      <ProviderSignInPanel
        provider={{ ...provider, driver: ProviderDriverKind.make("cursor") }}
        host="Synthetic host"
        remote={false}
        instance={{ driver: provider.driver, config: { binaryPath: "/fixture/cursor" } }}
        attempt={attempt()}
        done={vi.fn()}
      />,
    );
    expect(html).toContain("/fixture/cursor</code>");
    expect(html).toContain('aria-label="Copy executable"');
    expect(html).toContain(">Copy</button>");
  });
  it("masks device codes without replacing the code's accessible text", () => {
    const html = renderToStaticMarkup(
      <ProviderHandoff
        status={{
          ...lifecycle,
          attemptId: "synthetic-attempt",
          expiresAt: new Date(now + 300000).toISOString(),
          handoff: { url: "https://auth.openai.com/synthetic", userCode: "XXXX-XXXX" },
        }}
      />,
    );
    expect(html).toContain('role="group" aria-label="Private device code"');
    expect(html).toContain("Device code hidden");
    expect(html).not.toContain("XXXX-XXXX");
    expect(html).not.toContain("https://auth.openai.com/synthetic");
    expect(html).not.toMatch(/<code[^>]*aria-label/);
  });
  it("keeps connection text scalable", () => {
    const sources = import.meta.glob<string>("./*.tsx", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    for (const [file, source] of Object.entries(sources)) {
      if (!file.endsWith(".test.tsx")) expect(source, file).not.toMatch(/text-\[(?:10|11)px\]/);
    }
  });
});
