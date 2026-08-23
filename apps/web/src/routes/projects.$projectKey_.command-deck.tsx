import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const CommandDeckPage = lazy(() =>
  import("../components/commandDeck/CommandDeck").then((module) => ({
    default: module.CommandDeckPage,
  })),
);

export const Route = createFileRoute("/projects/$projectKey_/command-deck")({
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
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
          Loading Command Deck…
        </div>
      }
    >
      <CommandDeckPage projectKey={projectKey} />
    </Suspense>
  );
}
