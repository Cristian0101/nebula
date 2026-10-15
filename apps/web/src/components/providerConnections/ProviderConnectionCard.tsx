import { CircleCheckIcon, CircleDashedIcon, CircleXIcon, ChevronRightIcon } from "lucide-react";
import type { ServerProvider } from "@t3tools/contracts";
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
  success: "text-success",
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
      className={`inline-flex min-w-0 items-center gap-1.5 ${fact === "verified" ? "text-success" : fact === "blocked" ? "text-destructive" : "text-muted-foreground"}`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="break-words">{children}</span>
    </span>
  );
}
export function ProviderFactList({ readiness }: { readiness: ProviderReadiness }) {
  return (
    <dl className="divide-y divide-border">
      {READINESS_FACTS.map(([key, label]) => (
        <div
          key={key}
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5 text-xs"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd>
            <FactValue fact={readiness[key]}>{factCopy(key, readiness[key])}</FactValue>
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
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
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
  onDetails,
  onAction,
}: {
  provider: ServerProvider;
  readiness: ProviderReadiness;
  status: ConnectionStatus;
  now: number;
  compact?: boolean;
  onDetails: () => void;
  onAction: () => void;
}) {
  const name = provider.displayName ?? provider.driver;
  return (
    <article
      aria-label={`${name} connection`}
      data-connection-group={status.group}
      className={`connections-card rounded-xl border bg-card ${status.group === "attention" ? "border-l-2 border-l-warning" : status.group === "signing-in" ? "border-l-2 border-l-primary" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2 p-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
          onClick={onDetails}
          aria-label={`${name} details, ${status.label}`}
        >
          <ProviderInstanceIcon
            driverKind={provider.driver}
            displayName={name}
            className="size-9 rounded-lg border bg-muted"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {compact
                ? status.label
                : `${provider.version ? `v${provider.version} · ` : ""}${provider.instanceId}`}
            </span>
          </span>
          {compact ? (
            <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
        </button>
        {!compact ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${CONNECTION_TONES[status.tone]}`}
          >
            <CircleDashedIcon aria-hidden className="size-3" />
            {status.label}
          </span>
        ) : null}
        {status.actionLabel && !compact ? (
          <Button variant="outline" size="xs" onClick={onAction}>
            {status.actionLabel}
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
              {factCopy("modelAvailability", r.modelAvailability)}
            </FactCell>
            <FactCell label="Runtime" fact={r.runtime}>
              {factCopy("runtime", r.runtime)}
            </FactCell>
            <FactCell label="Last check" fact="unknown">
              {verificationCopy(r, now).replace("Verification expired · checked", "Expired ·")}
            </FactCell>
          </dl>
          {status.subline && status.group !== "unverified" ? (
            <p className="px-4 pb-3 text-[11px] text-muted-foreground">{status.subline}</p>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
