import { PlugIcon } from "lucide-react";
import { useProviderConnectionAttempts } from "./useProviderAuthenticationAttempt";
import { useEffect, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { deriveProviderReadiness } from "@t3tools/shared/providerReadiness";
import { useEnvironmentConnectionState } from "../../state/environments";
import { useProviderConnectionsEnvironment } from "./useProviderConnectionsEnvironment";
import { useEnvironmentSessionState } from "../../state/session";
import { serverEnvironment, EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { ProviderConnectionsLink } from "./ProviderConnectionsContext";
import { deriveProviderConnectionStatus } from "./providerConnectionStatus";
export function ProviderConnectionEntry({
  environmentId,
  mode = "summary",
}: {
  environmentId?: EnvironmentId | undefined;
  mode?: "summary" | "toolbar";
}) {
  const selectedEnvironment = useProviderConnectionsEnvironment();
  const id = environmentId ?? selectedEnvironment;
  return id ? <ScopedEntry environmentId={id} mode={mode} /> : null;
}
function ScopedEntry({
  environmentId,
  mode,
}: {
  environmentId: EnvironmentId;
  mode: "summary" | "toolbar";
}) {
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const connection = useEnvironmentConnectionState(environmentId);
  const session = useEnvironmentSessionState(environmentId);
  const mirror = useProviderConnectionAttempts((state) => state.attempts);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const connected = connection.data?.phase === "connected" && !connection.error;
  if (session.hasError || !session.data?.scopes?.includes("orchestration:read")) return null;
  const statuses = providers
    .filter((p) => p.enabled !== false)
    .map((provider) => ({
      provider,
      status: deriveProviderConnectionStatus({
        readiness: deriveProviderReadiness({
          environmentId,
          instanceId: provider.instanceId,
          snapshot: { environmentId, provider },
          connected,
          now,
        }),
        lifecycle:
          mirror[
            JSON.stringify([
              environmentId,
              provider.instanceId,
              connection.data?.generation,
              connection.data?.phase,
              connected && session.data?.scopes?.includes("access:write") === true,
            ])
          ] ?? null,
        connected,
        enabled: true,
        canManage: session.data?.scopes?.includes("access:write") === true,
        canOperate: session.data?.scopes?.includes("orchestration:operate") === true,
        capabilityAvailable: true,
        now,
      }),
    }));
  if (mode === "toolbar") {
    const actionable = statuses.some(
      ({ provider, status }) =>
        ["codex", "cursor", "claudeAgent"].includes(provider.driver) &&
        status.group === "attention" &&
        status.primaryAction !== null,
    );
    return actionable ? (
      <ProviderConnectionsLink environmentId={environmentId} filter="attention">
        <PlugIcon aria-hidden className="size-3.5" />
        Connect providers
      </ProviderConnectionsLink>
    ) : null;
  }
  const ready = statuses.filter((s) => s.status.group === "ready").length;
  const attention = statuses.filter(
    (s) => s.status.group === "attention" || s.status.group === "signing-in",
  ).length;
  return (
    <div className="px-2 py-1">
      <ProviderConnectionsLink
        environmentId={environmentId}
        className="w-full min-w-0 justify-start"
      >
        <PlugIcon aria-hidden className="size-3.5" />
        <span className="truncate">
          {statuses.length === 0
            ? "No providers enabled"
            : `Providers · ${ready}/${statuses.length} ready${attention ? ` · ${attention} need attention` : ""}`}
        </span>
      </ProviderConnectionsLink>
    </div>
  );
}
export function ComposerProviderRecovery({
  provider,
  environmentId,
  instanceId,
  selectedModel,
}: {
  provider: ServerProvider | null | undefined;
  environmentId: EnvironmentId;
  instanceId: ProviderInstanceId;
  selectedModel?: string | undefined;
}) {
  const connection = useEnvironmentConnectionState(environmentId);
  const readiness = deriveProviderReadiness({
    environmentId,
    instanceId,
    selectedModel,
    snapshot: provider ? { environmentId, provider } : undefined,
    connected: connection.data?.phase === "connected" && !connection.error,
    now: Date.now(),
  });
  return readiness.runtime === "blocked" ? (
    <div className="flex flex-wrap items-center gap-1 px-3 pb-2 text-xs text-muted-foreground">
      <span>{readiness.headline}</span>
      <ProviderConnectionsLink
        instanceId={instanceId}
        environmentId={environmentId}
        selectedModel={selectedModel}
      >
        Fix provider connection
      </ProviderConnectionsLink>
    </div>
  ) : null;
}
