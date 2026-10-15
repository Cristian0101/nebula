import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
export interface ProviderConnectionsSearch {
  connections?: "all" | ProviderInstanceId;
  connectionsEnv?: EnvironmentId;
}
// Navigation identifiers only. Reject URL/command/code-shaped and unbounded values.
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
export function parseProviderConnectionsSearch(
  search: Record<string, unknown>,
): ProviderConnectionsSearch {
  if (!identifier(search.connections)) return {};
  return {
    connections: search.connections === "all" ? "all" : ProviderInstanceId.make(search.connections),
    ...(identifier(search.connectionsEnv)
      ? { connectionsEnv: EnvironmentId.make(search.connectionsEnv) }
      : {}),
  };
}
