import { ProjectNavigationFrame } from "../components/project/ProjectNavigationFrame";
import { parseCommandDeckSearch } from "../commandDeckSearch";
export type { CommandDeckSearch } from "../commandDeckSearch";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const CommandDeckPage = lazy(() =>
  import("../components/commandDeck/CommandDeck").then((module) => ({
    default: module.CommandDeckPage,
  })),
);

const SwarmWorkspacePage = lazy(() =>
  import("../components/commandDeck/SwarmWorkspace").then((module) => ({
    default: module.SwarmWorkspacePage,
  })),
);

export const Route = createFileRoute("/projects/$projectKey_/command-deck")({
  validateSearch: parseCommandDeckSearch,
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: CommandDeckRoute,
});

function CommandDeckRoute() {
  const { projectKey } = Route.useParams();
  const search = Route.useSearch();
  return (
    <ProjectNavigationFrame projectKey={projectKey} checkout={search.checkout} destination="tasks">
      {(resolvedKey) => (
        <Suspense
          fallback={
            <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
              Loading Command Deck…
            </div>
          }
        >
          {search.mode === "swarm" ? (
            <SwarmWorkspacePage projectKey={resolvedKey} search={search} />
          ) : (
            <CommandDeckPage projectKey={resolvedKey} search={search} />
          )}
        </Suspense>
      )}
    </ProjectNavigationFrame>
  );
}
