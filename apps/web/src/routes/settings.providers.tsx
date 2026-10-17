import { createFileRoute } from "@tanstack/react-router";

import { ProviderSettingsPanel } from "../components/settings/ProviderSettingsPanel";

function SettingsProvidersRoute() {
  const environmentId = Route.useSearch().environmentId;
  return (
    <ProviderSettingsPanel
      key={environmentId ?? "default"}
      requestedEnvironmentId={environmentId}
    />
  );
}

export const Route = createFileRoute("/settings/providers")({
  validateSearch: (search: Record<string, unknown>): { environmentId?: string } =>
    typeof search.environmentId === "string" ? { environmentId: search.environmentId } : {},
  component: SettingsProvidersRoute,
});
