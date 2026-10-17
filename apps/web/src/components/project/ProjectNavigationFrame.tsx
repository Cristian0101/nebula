import { useAtomValue } from "@effect/atom-react";
import { allEnvironmentProjectIdentitiesKnownAtom } from "../../state/shell";
import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  PROJECT_DESTINATIONS,
  findProjectSuccessor,
  resolveProjectCheckout,
  type ProjectDestination,
} from "../../projectNavigation";
import { useUiStateStore } from "../../uiStateStore";
import { useEnvironments } from "../../state/environments";
import { useSettingsProjectGroups } from "../settings/ProjectSettingsPanel";
import { ProjectNavigationContext } from "./projectNavigationContext";
import { ProjectCheckoutSwitcher } from "./ProjectCheckoutSwitcher";
import { Button } from "../ui/button";

export function ProjectNavigationFrame({
  projectKey,
  checkout,
  destination,
  children,
}: {
  projectKey: string;
  checkout?: string | undefined;
  destination: ProjectDestination;
  children: (projectKey: string) => ReactNode;
}) {
  const groups = useSettingsProjectGroups();
  const navigate = useNavigate();
  const identitiesKnown = useAtomValue(allEnvironmentProjectIdentitiesKnownAtom);
  const location = useLocation();
  const { environments, isReady } = useEnvironments();
  const remembered = useUiStateStore((state) => state.projectNavigationByKey?.[projectKey]);
  const remember = useUiStateStore((state) => state.rememberProjectNavigation);
  const requested = checkout ?? remembered?.checkout;
  const originalGroup = groups.find((group) => group.projectKey === projectKey) ?? null;
  const successor = findProjectSuccessor(groups, requested);
  const group =
    (!originalGroup ||
      (requested !== undefined && remembered?.lastResolvedCheckout === requested)) &&
    successor
      ? successor
      : originalGroup;
  const resolved = resolveProjectCheckout({
    allowRepresentative: identitiesKnown,
    group,
    ...(checkout !== undefined ? { explicitCheckout: checkout } : {}),
    ...(remembered ? { rememberedCheckout: remembered.checkout } : {}),
  });
  const member = resolved.member;
  const scopedGroup =
    group && member
      ? { ...group, ...member, projectKey: group.projectKey, displayName: group.displayName }
      : null;
  const environment = environments.find((entry) => entry.environmentId === member?.environmentId);
  const connected = environment?.connection.phase === "connected";
  const target = PROJECT_DESTINATIONS.find((entry) => entry.id === destination)!;
  const selectCheckout = (value: string) =>
    void navigate({
      to: target.to,
      params: { projectKey: group?.projectKey ?? projectKey },
      search: { ...location.search, checkout: value },
    });
  useEffect(() => {
    if (resolved.checkout === undefined) return;
    // Includes unavailable identities, retained for recovery. Never write execution state.
    remember({
      projectKey: group?.projectKey ?? projectKey,
      checkout: resolved.checkout,
      destination,
      ...(member ? { lastResolvedCheckout: resolved.checkout } : {}),
    });
    if (group && (group.projectKey !== projectKey || checkout === undefined)) {
      void navigate({
        to: target.to,
        params: { projectKey: group.projectKey },
        search: { ...location.search, checkout: resolved.checkout },
        replace: true,
      });
    }
  }, [
    checkout,
    destination,
    group?.projectKey,
    location.search,
    navigate,
    projectKey,
    remember,
    resolved.checkout,
    member?.id,
    member?.environmentId,
    target.to,
  ]);
  return (
    <div
      className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-background text-foreground [&>main]:h-auto [&>main]:min-h-[32rem] [&>main]:flex-1 [&>main>header]:pl-3! [&>main>div>header]:pl-3!"
      data-project-checkout={resolved.checkout ?? "unselected"}
    >
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 pl-12"
        aria-label="Project checkout context"
      >
        <span className="min-w-0 max-w-60 truncate text-sm font-medium">
          {group?.displayName ?? "Project unavailable"}
        </span>
        {group ? (
          <ProjectCheckoutSwitcher
            group={group}
            checkout={resolved.checkout}
            onSelect={selectCheckout}
          />
        ) : null}
        {member ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void navigate({
                to: "/projects/$projectKey/terminal-center",
                params: { projectKey: group!.projectKey },
                search: { checkout: resolved.checkout!, files: true },
              })
            }
          >
            Files
          </Button>
        ) : null}
        {member ? (
          <span
            className="min-w-0 flex-1 basis-40 truncate font-mono text-xs text-muted-foreground"
            dir="rtl"
          >
            {"\u200e" + member.workspaceRoot}
          </span>
        ) : null}
      </div>
      {group ? (
        <nav
          className="flex shrink-0 flex-wrap gap-1 border-b border-border p-2 md:hidden"
          aria-label="Project destinations"
        >
          {PROJECT_DESTINATIONS.map((entry) => (
            <Button
              key={entry.id}
              size="sm"
              variant={entry.id === destination ? "secondary" : "ghost"}
              aria-current={entry.id === destination ? "page" : undefined}
              onClick={() =>
                void navigate({
                  to: entry.to,
                  params: { projectKey: group.projectKey },
                  search: resolved.checkout !== undefined ? { checkout: resolved.checkout } : {},
                })
              }
            >
              {entry.label}
            </Button>
          ))}
        </nav>
      ) : null}
      {!scopedGroup || (!connected && destination !== "overview" && destination !== "branches") ? (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto p-6 text-center"
          role="status"
        >
          <h1 className="text-lg font-semibold">
            {!scopedGroup
              ? resolved.reason
              : `${member?.environmentLabel ?? member?.environmentId} is ${environment?.connection.phase === "error" ? "unavailable" : environment?.connection.phase === "available" ? "not connected" : (environment?.connection.phase ?? "unavailable")}`}
          </h1>
          <p className="max-w-lg text-sm text-muted-foreground">
            {!isReady
              ? "Loading environments…"
              : !scopedGroup
                ? "Choose an available physical checkout to continue. Your requested identity is retained."
                : "Live status unavailable. Reconnect this environment or explicitly select another checkout. Existing work keeps its bindings."}
          </p>
          {resolved.checkout !== undefined && !member ? (
            <code className="max-w-full break-all text-xs text-muted-foreground">
              {resolved.checkout}
            </code>
          ) : null}
          {scopedGroup ? (
            <Button
              variant="outline"
              onClick={() => void navigate({ to: "/settings/connections" })}
            >
              Open Connections
            </Button>
          ) : null}
        </div>
      ) : (
        <ProjectNavigationContext key={resolved.checkout} value={scopedGroup}>
          {children(group!.projectKey)}
        </ProjectNavigationContext>
      )}
    </div>
  );
}
