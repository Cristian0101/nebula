import { ProjectNavigationFrame } from "../components/project/ProjectNavigationFrame";
import { parseProjectNavigationSearch } from "../projectNavigation";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProjectLaunchpadPage } from "../components/project/ProjectLaunchpad";

export const Route = createFileRoute("/projects/$projectKey")({
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
      destination="overview"
    >
      {(projectKey) => <ProjectLaunchpadPage projectKey={projectKey} />}
    </ProjectNavigationFrame>
  ),
});
