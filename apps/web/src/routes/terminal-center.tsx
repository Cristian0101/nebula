import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const GlobalTerminalCenterPage = lazy(() =>
  import("../components/terminalCenter/GlobalTerminalCenter").then((module) => ({
    default: module.GlobalTerminalCenterPage,
  })),
);

export const Route = createFileRoute("/terminal-center")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: () => (
    <Suspense
      fallback={
        <div className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">
          Loading Global Terminal Center…
        </div>
      }
    >
      <GlobalTerminalCenterPage />
    </Suspense>
  ),
});
