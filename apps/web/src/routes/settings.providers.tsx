import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { createFileRoute } from "@tanstack/react-router";

import { ProviderSettingsPanel } from "../components/settings/ProviderSettingsPanel";

function SettingsProvidersRoute() {
  return <ProviderSettingsPanel />;
}

const isProviderInstanceId = Schema.is(ProviderInstanceId);

export const Route = createFileRoute("/settings/providers")({
  component: SettingsProvidersRoute,
  validateSearch: (input: Record<string, unknown>) => ({
    ...(isProviderInstanceId(input.instance) ? { instance: input.instance } : {}),
    ...(typeof input.environment === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(input.environment)
      ? { environment: EnvironmentId.make(input.environment) }
      : {}),
  }),
});
