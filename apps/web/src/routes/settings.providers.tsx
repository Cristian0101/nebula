import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { createFileRoute } from "@tanstack/react-router";

import { ProviderSettingsPanel } from "../components/settings/ProviderSettingsPanel";

function SettingsProvidersRoute() {
  const search = Route.useSearch();
  const environmentId = search.environmentId ?? search.environment;
  return (
    <ProviderSettingsPanel
      key={environmentId ?? "default"}
      requestedEnvironmentId={environmentId}
    />
  );
}

const isProviderInstanceId = Schema.is(ProviderInstanceId);

export const Route = createFileRoute("/settings/providers")({
  component: SettingsProvidersRoute,
  validateSearch: (input: Record<string, unknown>) => ({
    ...(typeof input.environmentId === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(input.environmentId)
      ? { environmentId: EnvironmentId.make(input.environmentId) }
      : {}),
    ...(isProviderInstanceId(input.instance) ? { instance: input.instance } : {}),
    ...(typeof input.environment === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(input.environment)
      ? { environment: EnvironmentId.make(input.environment) }
      : {}),
  }),
});
