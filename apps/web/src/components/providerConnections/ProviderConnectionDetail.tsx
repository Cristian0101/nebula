import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import type { EnvironmentId, ProviderInstanceConfig, ServerProvider } from "@t3tools/contracts";
import type { ProviderReadiness } from "@t3tools/shared/providerReadiness";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Button } from "../ui/button";
import type { ConnectionStatus } from "./providerConnectionStatus";
import type { ProviderAuthenticationAttempt } from "./useProviderAuthenticationAttempt";
import { ProviderFactList, CONNECTION_TONES } from "./ProviderConnectionCard";
import { ProviderSignInPanel } from "./ProviderSignInPanel";
import { BILLING_COPY, verificationCopy, RECOVERY_COPY } from "./providerReadinessCopy";
import { INSTALL_GUIDES } from "./providerSignInCopy";
import { ensureLocalApi } from "../../localApi";
export function ProviderConnectionDetail({
  provider,
  instance,
  environmentId,
  host,
  remote,
  readiness,
  status,
  attempt,
  canOperate,
  capability,
  now,
  check,
  back,
  close,
}: {
  provider: ServerProvider;
  instance: ProviderInstanceConfig | undefined;
  environmentId: EnvironmentId;
  host: string;
  remote: boolean;
  readiness: ProviderReadiness;
  status: ConnectionStatus;
  attempt: ProviderAuthenticationAttempt;
  canOperate: boolean;
  capability: boolean;
  now: number;
  check: () => void;
  back: () => void;
  close: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [provider.instanceId]);
  const diagnostics = [
    `Host: ${host}`,
    `Driver: ${provider.driver}`,
    `Instance: ${provider.instanceId}`,
    `Inspection: ${provider.inspection?.status ?? "Not reported"}`,
    `Verified: ${readiness.verifiedAt ?? "Never"}`,
    `Model catalog: ${provider.modelCatalogSource ?? "Not reported"}`,
    `Authentication capability: ${attempt.status?.capability ?? "Not reported"}`,
    `Ceremonies: ${attempt.status?.ceremonies.join(", ") ?? "None reported"}`,
    `Lifecycle reason: ${attempt.status?.reason ?? "Not checked"}`,
  ].join("\n");
  return (
    <div className="space-y-6 p-5 md:p-6">
      <Button size="xs" variant="ghost" onClick={back}>
        ← All providers
      </Button>
      <div className="flex min-w-0 items-center gap-3">
        <ProviderInstanceIcon
          driverKind={provider.driver}
          displayName={provider.displayName ?? provider.driver}
          className="size-12 rounded-xl border bg-muted"
          iconClassName="size-6"
        />
        <div className="min-w-0 flex-1">
          <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">
            {provider.displayName ?? provider.driver}
          </h2>
          <p className="break-all text-xs text-muted-foreground">
            {host} · {provider.instanceId}
            {provider.version ? ` · v${provider.version}` : ""}
          </p>
        </div>
      </div>
      <section className="space-y-2 rounded-xl border p-4">
        <p className={`text-sm font-medium ${CONNECTION_TONES[status.tone]}`}>{status.label}</p>
        <p className="text-xs text-muted-foreground">
          {status.subline || verificationCopy(readiness, now)}
        </p>
        {readiness.installed === "blocked" ? (
          <>
            <p className="text-sm">
              Nebula can't find this provider's official executable on {host}. Install it or set the
              executable path in Provider Settings.
            </p>
            {INSTALL_GUIDES[provider.driver] ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void ensureLocalApi().shell.openExternal(INSTALL_GUIDES[provider.driver]!)
                }
              >
                Install guide ↗
              </Button>
            ) : null}
          </>
        ) : null}
        {readiness.modelAvailability === "blocked" ? (
          <p className="text-sm">
            The selected model isn't offered to this account. Choose another model in the existing
            model picker or Provider Settings.
          </p>
        ) : null}
        {canOperate ? (
          <Button size="sm" variant="outline" onClick={check}>
            Check again
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Checking needs Operate access on {host}.</p>
        )}
      </section>
      {capability ? (
        <ProviderSignInPanel
          provider={provider}
          host={host}
          remote={remote}
          instance={instance}
          attempt={attempt}
          done={close}
        />
      ) : (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          This host runs a Nebula version without sign-in support. Update Nebula on {host}, or use
          the provider's official CLI and check again.
        </p>
      )}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Account and sign-in</h3>
        <div className="text-xs">
          {readiness.account === "verified" && provider.auth.email ? (
            <RedactedSensitiveText
              key={`${environmentId}:${provider.instanceId}`}
              value={provider.auth.email}
              ariaLabel="Toggle account identity"
              revealTooltip="Reveal account"
              hideTooltip="Hide account"
            />
          ) : (
            "Account not reported"
          )}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Readiness</h3>
        <ProviderFactList readiness={readiness} />
        <p className="mt-2 text-xs text-muted-foreground">{verificationCopy(readiness, now)}</p>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Billing and entitlement</h3>
        <p className="text-sm">
          {BILLING_COPY[readiness.billingRoute]} · reported by{" "}
          {provider.displayName ?? provider.driver}
        </p>
        {provider.auth.label ? (
          <p className="text-xs text-muted-foreground">Reported plan: {provider.auth.label}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          A reported plan does not verify entitlement or remaining usage. Runtime preflight does not
          verify a completed turn.
        </p>
        <Link to="/usage" className="text-xs underline">
          View usage →
        </Link>
      </section>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">Diagnostics</summary>
        <pre className="mt-3 whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
          {diagnostics}
        </pre>
        {attempt.status ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {RECOVERY_COPY[attempt.status.reason]}
          </p>
        ) : null}
        <Button
          className="mt-3"
          size="xs"
          variant="outline"
          onClick={() => void navigator.clipboard.writeText(diagnostics)}
        >
          Copy diagnostics
        </Button>
      </details>
      <Link
        to="/settings/providers"
        search={{ instance: provider.instanceId, environment: environmentId }}
        onClick={close}
        className="text-xs underline"
      >
        Open in Provider Settings →
      </Link>
    </div>
  );
}
