import { createContext, useContext, type ReactNode } from "react";
import type { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { Button } from "../ui/button";
export type OpenConnections = (
  instanceId?: ProviderInstanceId,
  environmentId?: EnvironmentId,
  selectedModel?: string,
  filter?: "attention",
) => void;
export const ProviderConnectionsContext = createContext<OpenConnections>(() => undefined);
export const useOpenProviderConnections = () => useContext(ProviderConnectionsContext);
export function ProviderConnectionsLink({
  instanceId,
  environmentId,
  children = "Provider Connections",
  onOpen,
  selectedModel,
  filter,
  className,
}: {
  instanceId?: ProviderInstanceId | undefined;
  environmentId?: EnvironmentId | undefined;
  children?: ReactNode;
  onOpen?: (() => void) | undefined;
  selectedModel?: string | undefined;
  filter?: "attention";
  className?: string;
}) {
  const open = useOpenProviderConnections();
  return (
    <Button
      className={className}
      size="xs"
      variant="ghost"
      onClick={() => {
        onOpen?.();
        open(instanceId, environmentId, selectedModel, filter);
      }}
    >
      {children}
    </Button>
  );
}
