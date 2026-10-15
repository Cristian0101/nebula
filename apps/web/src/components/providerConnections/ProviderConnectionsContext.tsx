import { createContext, useContext, type ReactNode } from "react";
import type { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { Button } from "../ui/button";
export type OpenConnections = (
  instanceId?: ProviderInstanceId,
  environmentId?: EnvironmentId,
  selectedModel?: string,
) => void;
export const ProviderConnectionsContext = createContext<OpenConnections>(() => undefined);
export const useOpenProviderConnections = () => useContext(ProviderConnectionsContext);
export function ProviderConnectionsLink({
  instanceId,
  environmentId,
  children = "Provider Connections",
  onOpen,
  selectedModel,
}: {
  instanceId?: ProviderInstanceId | undefined;
  environmentId?: EnvironmentId | undefined;
  children?: ReactNode;
  onOpen?: (() => void) | undefined;
  selectedModel?: string | undefined;
}) {
  const open = useOpenProviderConnections();
  return (
    <Button
      size="xs"
      variant="ghost"
      onClick={() => {
        onOpen?.();
        open(instanceId, environmentId, selectedModel);
      }}
    >
      {children}
    </Button>
  );
}
