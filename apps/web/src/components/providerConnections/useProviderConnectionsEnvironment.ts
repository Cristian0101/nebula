import { useAtomValue } from "@effect/atom-react";
import { useLocation, useParams } from "@tanstack/react-router";
import { resolveProjectCheckout } from "../../projectNavigation";
import { useActiveEnvironmentId } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { allEnvironmentProjectIdentitiesKnownAtom } from "../../state/shell";
import { useUiStateStore } from "../../uiStateStore";
import { useSettingsProjectGroups } from "../settings/ProjectSettingsPanel";

/** Resolve presentation context without changing the active connection or execution state. */
export function useProviderConnectionsEnvironment() {
  const { projectKey } = useParams({ strict: false });
  const checkout = useLocation({ select: (location) => location.search.checkout });
  const groups = useSettingsProjectGroups();
  const identitiesKnown = useAtomValue(allEnvironmentProjectIdentitiesKnownAtom);
  const remembered = useUiStateStore((state) =>
    projectKey ? state.projectNavigationByKey?.[projectKey] : undefined,
  );
  const active = useActiveEnvironmentId();
  const primary = usePrimaryEnvironmentId();
  if (!projectKey) return active ?? primary;
  return (
    resolveProjectCheckout({
      group: groups.find((group) => group.projectKey === projectKey) ?? null,
      allowRepresentative: identitiesKnown,
      ...(checkout !== undefined ? { explicitCheckout: checkout } : {}),
      ...(remembered ? { rememberedCheckout: remembered.checkout } : {}),
    }).member?.environmentId ?? null
  );
}
