import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const TerminalCenterPage = lazy(() =>
  import("../components/terminalCenter/TerminalCenter").then((module) => ({
    default: module.TerminalCenterPage,
  })),
);

export const Route = createFileRoute("/projects/$projectKey_/terminal-center")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: TerminalCenterRoute,
});

function TerminalCenterRoute() {
  const { projectKey } = Route.useParams();
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
          Loading Terminal Center…
        </div>
      }
    >
      <TerminalCenterPage projectKey={projectKey} />
    </Suspense>
  );
}
