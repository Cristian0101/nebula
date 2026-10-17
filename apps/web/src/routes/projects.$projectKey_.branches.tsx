import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ProjectNavigationFrame } from "../components/project/ProjectNavigationFrame";
import { parseProjectNavigationSearch } from "../projectNavigation";
const BranchInventory = lazy(() =>
  import("../components/project/branches/BranchInventory").then((module) => ({
    default: module.BranchInventory,
  })),
);
export const Route = createFileRoute("/projects/$projectKey_/branches")({
  validateSearch: parseProjectNavigationSearch,
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    )
      throw redirect({ to: "/pair", replace: true });
  },
  component: () => (
    <ProjectNavigationFrame
      projectKey={Route.useParams().projectKey}
      checkout={Route.useSearch().checkout}
      destination="branches"
    >
      {(projectKey) => (
        <Suspense
          fallback={
            <p role="status" className="p-6">
              Loading Branches &amp; Worktrees…
            </p>
          }
        >
          <BranchInventory projectKey={projectKey} />
        </Suspense>
      )}
    </ProjectNavigationFrame>
  ),
});
