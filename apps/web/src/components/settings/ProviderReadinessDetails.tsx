import { CircleCheckIcon, CircleDashedIcon, CircleXIcon } from "lucide-react";
import type { ProviderReadiness, ReadinessFact } from "@t3tools/shared/providerReadiness";

const FACT_PRESENTATION = {
  verified: { Icon: CircleCheckIcon, label: "Verified", className: "text-success" },
  blocked: { Icon: CircleXIcon, label: "Unavailable", className: "text-destructive" },
  unknown: { Icon: CircleDashedIcon, label: "Not verified", className: "text-muted-foreground" },
} as const;

export function ProviderReadinessDetails({ readiness }: { readonly readiness: ProviderReadiness }) {
  const facts: ReadonlyArray<readonly [string, ReadinessFact]> = [
    ["Registered driver", readiness.registered],
    ["Executable installed", readiness.installed],
    ["Authentication", readiness.authentication],
    ["Account identity", readiness.account],
    ["Subscription entitlement", readiness.subscriptionEntitlement],
    ["Selected/default model", readiness.modelAvailability],
    ["Runtime preflight", readiness.runtime],
  ];
  const route = {
    subscription: "Provider subscription route (provider reported)",
    api: "API key / API billing (provider reported)",
    "provider-managed": "Other provider-managed billing (provider reported)",
    unknown: "Not reported",
  }[readiness.billingRoute];
  return (
    <section aria-label="Provider readiness" className="space-y-2 text-xs">
      <dl className="grid gap-2 sm:grid-cols-2">
        {facts.map(([label, state]) => {
          const { Icon, label: value, className } = FACT_PRESENTATION[state];
          return (
            <div key={label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={`flex items-center gap-1 ${className}`}>
                <Icon className="size-3" aria-hidden />
                {value}
              </dd>
            </div>
          );
        })}
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Billing route</dt>
          <dd>{route}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground">
        A reported plan does not verify entitlement or remaining usage. Preflight does not verify a
        completed turn.
      </p>
      <p className="text-muted-foreground">
        Last verification:{" "}
        {readiness.verifiedAt ? new Date(readiness.verifiedAt).toLocaleString() : "Never"}
        {!readiness.fresh && readiness.verifiedAt ? " · stale; check again" : ""}
      </p>
    </section>
  );
}
