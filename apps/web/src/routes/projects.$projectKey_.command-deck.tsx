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

export interface CommandDeckSearch {
  readonly mode?: "swarm";
  readonly stage?: "brief" | "plan" | "war-room" | "review";
  readonly proposalId?: string;
  readonly missionId?: string;
  readonly selectedTask?: string;
}

export const Route = createFileRoute("/projects/$projectKey_/command-deck")({
  validateSearch: (search: Record<string, unknown>): CommandDeckSearch => {
    if (search.mode !== "swarm") return {};
    const stage: NonNullable<CommandDeckSearch["stage"]> = [
      "brief",
      "plan",
      "war-room",
      "review",
    ].includes(String(search.stage))
      ? (search.stage as NonNullable<CommandDeckSearch["stage"]>)
      : "brief";
    return {
      mode: "swarm",
      stage,
      ...(typeof search.proposalId === "string" ? { proposalId: search.proposalId } : {}),
      ...(typeof search.missionId === "string" ? { missionId: search.missionId } : {}),
      ...(typeof search.selectedTask === "string" ? { selectedTask: search.selectedTask } : {}),
    };
  },
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
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
          Loading Command Deck…
        </div>
      }
    >
      {search.mode === "swarm" ? (
        <SwarmWorkspacePage projectKey={projectKey} search={search} />
      ) : (
        <CommandDeckPage projectKey={projectKey} />
      )}
    </Suspense>
  );
}
