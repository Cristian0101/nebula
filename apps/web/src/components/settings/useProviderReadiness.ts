import { useEffect, useState } from "react";
import type { EnvironmentId, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { deriveProviderReadiness } from "@t3tools/shared/providerReadiness";

/** Settings mounts only for a connected environment; freshness also expires while idle. */
export function useProviderReadiness(
  environmentId: EnvironmentId,
  instanceId: ProviderInstanceId,
  provider: ServerProvider | undefined,
) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return deriveProviderReadiness({
    environmentId,
    instanceId,
    connected: true,
    now: Math.max(now, Date.now()),
    snapshot: provider ? { environmentId, provider } : undefined,
  });
}
