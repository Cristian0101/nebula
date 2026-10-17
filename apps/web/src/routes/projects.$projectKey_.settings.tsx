import { ProjectNavigationFrame } from "../components/project/ProjectNavigationFrame";
import { parseProjectNavigationSearch } from "../projectNavigation";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProjectSettingsPage } from "../components/settings/ProjectSettingsPanel";

export const Route = createFileRoute("/projects/$projectKey_/settings")({
  validateSearch: parseProjectNavigationSearch,
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: () => (
    <ProjectNavigationFrame
      projectKey={Route.useParams().projectKey}
      checkout={Route.useSearch().checkout}
      destination="settings"
    >
      {(projectKey) => <ProjectSettingsPage projectKey={projectKey} />}
    </ProjectNavigationFrame>
  ),
});
