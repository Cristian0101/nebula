import { signInCopy } from "./providerSignInCopy";
import {
  CircleAlertIcon,
  HourglassIcon,
  WifiOffIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { EnvironmentId, ServerProvider } from "@t3tools/contracts";
import type { ProviderReadiness, ReadinessFact } from "@t3tools/shared/providerReadiness";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { Button } from "../ui/button";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import type { ConnectionStatus } from "./providerConnectionStatus";
import {
  BILLING_COPY,
  factCopy,
  verificationCopy,
  type FactKey,
  READINESS_FACTS,
} from "./providerReadinessCopy";
export const CONNECTION_TONES = {
  success: "text-success-foreground",
  destructive: "text-destructive",
  warning: "text-warning",
  muted: "text-muted-foreground",
  info: "text-primary",
} as const;
export function FactValue({ fact, children }: { fact: ReadinessFact; children: React.ReactNode }) {
  const Icon =
    fact === "verified" ? CircleCheckIcon : fact === "blocked" ? CircleXIcon : CircleDashedIcon;
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 ${fact === "verified" ? "text-success-foreground" : fact === "blocked" ? "text-destructive" : "text-muted-foreground"}`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="break-words">{children}</span>
    </span>
  );
}
export function ProviderFactList({
  readiness,
  modelName,
  version,
}: {
  readiness: ProviderReadiness;
  modelName?: string | undefined;
  version?: string | undefined;
}) {
  return (
    <dl className="divide-y divide-border">
      {READINESS_FACTS.map(([key, label]) => (
        <div
          key={key}
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5 text-xs"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd>
            <FactValue fact={readiness[key]}>
              {key === "modelAvailability" && modelName
                ? `${modelName} · ${factCopy(key, readiness[key])}`
                : key === "installed" && readiness.installed === "verified" && version
                  ? `Installed · v${version}`
                  : factCopy(key, readiness[key])}
            </FactValue>
          </dd>
        </div>
      ))}
    </dl>
  );
}
function FactCell({
  label,
  fact,
  children,
}: {
  label: string;
  fact: ReadinessFact;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xs">
        <FactValue fact={fact}>{children}</FactValue>
      </dd>
    </div>
  );
}
export function ProviderConnectionCard({
  provider,
  readiness: r,
  status,
  now,
  compact = false,
  modelLabel,
  onDetails,
  onAction,
  checking = false,
  environmentId,
}: {
  provider: ServerProvider;
  readiness: ProviderReadiness;
  status: ConnectionStatus;
  now: number;
  compact?: boolean;
  modelLabel?: string | undefined;
  onDetails: () => void;
  onAction: () => void;
  checking?: boolean;
  environmentId?: EnvironmentId;
}) {
  const name = provider.displayName ?? provider.driver;
  const StatusIcon = {
    check: CircleCheckIcon,
    alert: CircleAlertIcon,
    waiting: HourglassIcon,
    unverified: CircleDashedIcon,
    off: CircleDashedIcon,
    disconnected: WifiOffIcon,
  }[status.icon];
  return (
    <article
      aria-label={`${name} connection`}
      aria-busy={checking}
      data-connection-group={status.group}
      className={`connections-card rounded-xl border bg-card ${status.group === "attention" ? "border-l-2 border-l-warning" : status.group === "signing-in" ? "border-l-2 border-l-primary" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2 p-4">
        <button
          type="button"
          className="flex min-w-32 flex-1 cursor-pointer items-center gap-3 rounded-md text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
          data-connection-instance={provider.instanceId}
          onClick={onDetails}
          aria-label={`${name} details, ${status.label}`}
        >
          <ProviderInstanceIcon
            driverKind={provider.driver}
            displayName={name}
            className="connections-provider-mark size-9 rounded-lg border bg-muted"
          />
          <span className="min-w-0">
            <span className="connections-provider-name block truncate text-sm font-semibold">
              {name}
            </span>
            <span
              className={`block truncate text-xs text-muted-foreground ${compact ? "" : "connections-card-meta"}`}
            >
              {compact
                ? status.label
                : `${provider.version ? `v${provider.version} · ` : ""}${provider.instanceId}`}
            </span>
            {!compact ? (
              <span className="connections-card-list-status text-xs text-muted-foreground">
                {status.label}
              </span>
            ) : null}
          </span>
          <ChevronRightIcon aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
        {!compact ? (
          <span
            className={`connections-card-status inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${CONNECTION_TONES[status.tone]}`}
          >
            {checking ? (
              <LoaderCircleIcon aria-hidden className="size-3 motion-safe:animate-spin" />
            ) : (
              <StatusIcon aria-hidden className="size-3" />
            )}
            {checking ? "Checking…" : status.label}
          </span>
        ) : null}
        {status.actionLabel && !compact ? (
          <Button
            className="connections-card-action max-md:w-full"
            variant="outline"
            size="xs"
            render={
              status.primaryAction === "settings" && environmentId ? (
                <Link
                  to="/settings/providers"
                  search={{ instance: provider.instanceId, environment: environmentId }}
                />
              ) : undefined
            }
            onClick={status.primaryAction === "settings" && environmentId ? undefined : onAction}
            disabled={checking}
            data-connection-attention={
              status.group === "attention" || status.group === "signing-in" ? "" : undefined
            }
          >
            {status.actionLabel === "Sign in"
              ? signInCopy(provider.driver).label
              : status.primaryAction === "settings" && provider.enabled === false
                ? "Enable in Provider Settings"
                : status.actionLabel}
          </Button>
        ) : null}
      </div>
      {!compact ? (
        <>
          <dl className="connections-facts grid grid-cols-3 gap-x-4 gap-y-4 border-t border-border/60 px-4 py-3">
            {(["authentication", "account"] as FactKey[]).map((key) => (
              <FactCell
                key={key}
                label={key === "authentication" ? "Sign-in" : "Account"}
                fact={r[key]}
              >
                {key === "account" && r.account === "verified" && provider.auth.email ? (
                  <RedactedSensitiveText
                    value={provider.auth.email}
                    ariaLabel="Toggle account identity"
                    revealTooltip="Reveal account"
                    hideTooltip="Hide account"
                  />
                ) : (
                  factCopy(key, r[key])
                )}
              </FactCell>
            ))}
            <FactCell label="Billing · reported" fact="unknown">
              {BILLING_COPY[r.billingRoute]}
            </FactCell>
            <FactCell label="Model" fact={r.modelAvailability}>
              {modelLabel ??
                provider.models.find((model) => model.isDefault)?.shortName ??
                provider.models.find((model) => model.isDefault)?.name ??
                "Model"}{" "}
              · {factCopy("modelAvailability", r.modelAvailability)}
            </FactCell>
            <FactCell label="Runtime" fact={r.runtime}>
              {factCopy("runtime", r.runtime)}
            </FactCell>
            <FactCell label="Last check" fact="unknown">
              {verificationCopy(r, now).replace("Verification expired · checked", "Expired ·")}
            </FactCell>
          </dl>
          {status.subline && status.group !== "unverified" && status.group !== "ready" ? (
            <p className="px-4 pb-3 text-xs text-muted-foreground">{status.subline}</p>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
