import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { deriveProviderReadiness } from "@t3tools/shared/providerReadiness";
import { LayoutDashboardIcon, Settings2Icon, WorkflowIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useProjectNavigate } from "../../hooks/useProjectNavigate";
import { useClientSettings, useEnvironmentSettings } from "../../hooks/useSettings";
import { useComposerDraftStore } from "../../composerDraftStore";
import { encodeProjectCheckout } from "../../projectNavigation";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
} from "../../providerInstances";
import { environmentSnapshotAtom } from "../../state/shell";
import { useEnvironmentConnectionState } from "../../state/environments";
import { useEnvironmentSessionState } from "../../state/session";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { projectEnvironment } from "../../state/projects";
import { terminalEnvironment } from "../../state/terminal";
import { previewEnvironment } from "../../state/preview";
import { useUiStateStore } from "../../uiStateStore";
import { Button } from "../ui/button";
import { useProjectNavigationGroup } from "./projectNavigationContext";
import {
  deriveAgentPresence,
  deriveProjectAttention,
  deriveProjectResume,
  selectProjectHomeScope,
  type HomeDestination,
} from "./home/projectHomeSelectors";
import { deriveProjectServices, selectProjectTerminals } from "./home/projectHomeActivity";
import {
  EmptyProjectHero,
  HomeCardBoundary,
  HomeQueryState,
  ProjectAttentionList,
  ProjectContextBlock,
  ProjectLaunchBar,
  ProjectLiveNow,
  ProjectResumeList,
  homeRelativeTime,
} from "./home/ProjectHomeSections";

// Transient focus hints only; no execution state survives navigation here.
const homeReturnFocus = new Map<string, string>();

export function ProjectLaunchpadPage({ projectKey }: { readonly projectKey: string }) {
  const group = useProjectNavigationGroup();
  // No representative or display-name fallback: the route frame owns resolution.
  if (!group)
    return (
      <p role="status" className="p-6">
        Checkout unavailable. Select a physical Project checkout.
      </p>
    );
  return (
    <ProjectHome
      key={`${group.environmentId}:${group.id}`}
      projectKey={projectKey}
      projectRef={scopeProjectRef(group.environmentId, group.id)}
      name={group.displayName}
      host={
        group.memberProjects.find(
          (member) => member.id === group.id && member.environmentId === group.environmentId,
        )?.environmentLabel ?? group.environmentId
      }
      path={group.workspaceRoot}
    />
  );
}

function ProjectHome({
  projectKey,
  projectRef,
  name,
  host,
  path,
}: {
  projectKey: string;
  projectRef: ScopedProjectRef;
  name: string;
  host: string;
  path: string;
}) {
  const navigate = useProjectNavigate();
  const createDraft = useNewThreadHandler();
  const snapshot = useAtomValue(environmentSnapshotAtom(projectRef.environmentId));
  const config = useAtomValue(serverEnvironment.configValueAtom(projectRef.environmentId));
  const settings = useEnvironmentSettings(projectRef.environmentId);
  const autoSettleAfterDays = useClientSettings((value) => value.sidebarAutoSettleAfterDays);
  const connection = useEnvironmentConnectionState(projectRef.environmentId);
  const connected = connection.data?.phase === "connected";
  const session = useEnvironmentSessionState(projectRef.environmentId);
  const terminalAllowed =
    connected &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes("terminal:operate") === true;
  const canCompose =
    connected &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes("orchestration:operate") === true;
  const [launchText, setLaunchText] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const checkout = encodeProjectCheckout(projectRef);
  const filter = useUiStateStore(
    (state) => state.projectHomeResumeFilterByCheckout?.[checkout] ?? "All",
  );
  useEffect(() => {
    const key = homeReturnFocus.get(checkout);
    if (
      !key ||
      !snapshot ||
      (document.activeElement !== document.body &&
        document.activeElement?.id !== "project-home-main")
    )
      return;
    const row = [...document.querySelectorAll<HTMLButtonElement>("button[data-home-row-key]")].find(
      (item) => item.dataset.homeRowKey === key,
    );
    if (row) {
      homeReturnFocus.delete(checkout);
      row.focus({ preventScroll: true });
    }
  }, [checkout, snapshot]);
  const setFilter = useUiStateStore((state) => state.setProjectHomeResumeFilter);
  const workspacesState = useUiStateStore((state) => state.terminalWorkspacesByProjectId[checkout]);
  const workspaces = workspacesState?.workspaces ?? [];
  const scope = { ref: projectRef, environmentId: projectRef.environmentId, snapshot };
  const scoped = selectProjectHomeScope(scope);
  const inventorySupported = config?.environment.capabilities.projectInventory === true;
  const inventory = useEnvironmentQuery(
    connected && inventorySupported
      ? projectEnvironment.inventory({
          environmentId: projectRef.environmentId,
          input: { projectId: projectRef.projectId, limit: 200 },
        })
      : null,
  );
  // Both sides are canonical server realpaths, not client-normalized user paths.
  const rootWorkspace = inventory.data?.worktrees.find(
    (item) =>
      item.realPath === inventory.data?.identity?.projectRoot && item.availability === "present",
  );
  const context = useEnvironmentQuery(
    connected && rootWorkspace
      ? projectEnvironment.workspaceContext({
          environmentId: projectRef.environmentId,
          input: { projectId: projectRef.projectId, workspaceKey: rootWorkspace.workspaceKey },
        })
      : null,
  );
  const metadata = useEnvironmentQuery(
    terminalAllowed
      ? terminalEnvironment.metadata({ environmentId: projectRef.environmentId, input: null })
      : null,
  );
  // Discovery can contain protected terminal associations, so use the same explicit scope.
  const discovery = useEnvironmentQuery(
    terminalAllowed
      ? previewEnvironment.discoveredServers({ environmentId: projectRef.environmentId, input: {} })
      : null,
  );
  const providers = useMemo(
    () =>
      applyProviderInstanceSettings(
        deriveProviderInstanceEntries(config?.providers ?? []),
        settings,
      ),
    [config?.providers, settings],
  );
  const attention = deriveProjectAttention({ ...scope, providers, connected, now });
  const resume = deriveProjectResume({
    ...scope,
    filter,
    now: new Date(now).toISOString(),
    autoSettleAfterDays,
  });
  const agents = scoped.threads
    .filter((thread) => !thread.archivedAt)
    .flatMap((thread) => {
      const status = deriveAgentPresence(thread);
      if (!status) return [];
      return [
        {
          id: thread.id,
          title: thread.title,
          status: connected ? status : "Unknown · host offline",
          detail: `${thread.modelSelection.instanceId} · ${thread.branch ?? "Branch unknown"}`,
          destination: { kind: "thread" as const, threadId: thread.id },
        },
      ];
    });
  const threadIds = scoped.threads.map((thread) => thread.id);
  const terminals = selectProjectTerminals({
    allowed: terminalAllowed && metadata.data !== null && !metadata.error,
    projectId: projectRef.projectId,
    threadIds,
    workspaces,
    terminals: metadata.data ?? [],
  });
  const services =
    terminalAllowed && !metadata.error && !discovery.error
      ? deriveProjectServices({
          projectId: projectRef.projectId,
          threadIds,
          workspaces,
          profiles: settings.devServerProfilesByProject[projectKey] ?? [],
          terminals: metadata.data ?? [],
          servers: discovery.data?.servers ?? [],
        })
      : [];
  const openWorkbench = (workspaceId?: string | null) => {
    if (workspaceId && workspacesState && workspaces.some((item) => item.id === workspaceId))
      useUiStateStore.getState().setTerminalWorkspaceProjectState(checkout, {
        ...workspacesState,
        activeWorkspaceId: workspaceId,
      });
    void navigate({
      to: "/projects/$projectKey/terminal-center",
      params: { projectKey },
      search: { checkout },
    });
  };
  const open = (destination: HomeDestination) => {
    const rowKey = (document.activeElement as HTMLElement | null)?.dataset.homeRowKey;
    if (rowKey) homeReturnFocus.set(checkout, rowKey);
    if (destination.kind === "thread")
      return void navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: projectRef.environmentId, threadId: destination.threadId },
      });
    // E3 remains separate; Provider Settings is the supported recovery surface at this base.
    if (destination.kind === "provider")
      return void navigate({
        to: "/settings/providers",
        search: { environmentId: projectRef.environmentId },
      });
    void navigate({
      to: "/projects/$projectKey/command-deck",
      params: { projectKey },
      search: {
        checkout,
        ...(destination.kind === "task"
          ? { selectedTask: destination.taskId }
          : destination.kind === "mission"
            ? { mode: "swarm", stage: destination.stage, missionId: destination.missionId }
            : destination.kind === "plan"
              ? { mode: "swarm", stage: "plan", proposalId: destination.proposalId }
              : { section: "integration" }),
      },
    });
  };
  const invalid =
    inventory.data?.state === "invalid" ||
    context.data?.state === "invalid" ||
    inventory.data?.issues.includes("project-unavailable") ||
    context.data?.issues.includes("workspace-unavailable") ||
    context.data?.issues.includes("repository-mismatch");
  const disabledReason = !connected
    ? `${host} is offline. Reconnect to create a draft.`
    : !canCompose
      ? "Creating work needs orchestration permission on this host."
      : invalid
        ? "Checkout unavailable. Refresh or select a valid checkout."
        : inventorySupported &&
            (!context.data?.workspace ||
              context.isPending ||
              inventory.isPending ||
              inventory.error !== null ||
              context.error !== null)
          ? "Checkout context is not verified. Refresh context before creating work."
          : !scoped.project
            ? "Project data is loading."
            : null;
  const readiness = providers
    .filter((entry) => entry.enabled)
    .map((entry) =>
      deriveProviderReadiness({
        environmentId: projectRef.environmentId,
        instanceId: entry.instanceId,
        connected,
        now,
        snapshot: { environmentId: projectRef.environmentId, provider: entry.snapshot },
      }),
    );
  const readinessLabel = readiness.some((item) => item.runtime === "verified")
    ? "Provider preflight observed; composer verifies before execution."
    : "Provider readiness not verified; review it in the composer.";
  const launch = async (kind: "chat" | "task" | "mission", text: string) => {
    if (disabledReason) return;
    const result = await createDraft(projectRef, {
      branch: context.data?.git?.branchRef?.replace(/^refs\/heads\//u, "") ?? null,
      worktreePath: null,
      envMode: "local",
      startFromOrigin: false,
    });
    if (!result) throw new Error("Draft unavailable");
    useComposerDraftStore.getState().setPrompt(result.draftId, text);
    if (kind !== "chat")
      await navigate({
        to: "/projects/$projectKey/command-deck",
        params: { projectKey },
        search: {
          checkout,
          workDraft: result.draftId,
          ...(kind === "task" ? { createTask: true } : { mode: "swarm", stage: "brief" }),
        },
        replace: true,
      });
  };
  const empty =
    snapshot !== null &&
    snapshot.tasks !== undefined &&
    snapshot.missions !== undefined &&
    scoped.project !== null &&
    scoped.threads.length === 0 &&
    scoped.tasks.length === 0 &&
    scoped.missions.length === 0;
  const gitObservation = context.data?.observations.find((item) => item.subject === "status");
  const inventoryObservation = context.data?.observations.find(
    (item) => item.subject === "worktrees",
  );
  const contextEvidence = !connected
    ? `Cached · ${host} is offline. Live status unavailable; work may still be running.`
    : context.data
      ? [
          context.data.state === "partial" ? "Partial information" : null,
          gitObservation?.observedAt
            ? `Git checked ${homeRelativeTime(gitObservation.observedAt, now)}`
            : "Git freshness unknown",
          inventoryObservation?.observedAt
            ? `Worktree inventory ${inventoryObservation.cache === "cached" ? "cached" : "observed"} ${homeRelativeTime(inventoryObservation.observedAt, now)}`
            : "Inventory freshness unknown",
          snapshot?.updatedAt
            ? `Project activity ${homeRelativeTime(snapshot.updatedAt, now)}`
            : "Activity freshness unknown",
        ]
          .filter(Boolean)
          .join(" · ")
      : !inventorySupported
        ? "Git context unavailable on this host. Project identity is canonical; Git facts are unknown."
        : inventory.isPending || context.isPending
          ? "Loading checkout context…"
          : "Git unavailable or folder is not a repository. Checkout facts are unknown.";

  return (
    <main
      id="project-home-main"
      tabIndex={-1}
      className="min-h-0 min-w-0 flex-1 bg-background text-foreground"
    >
      <a href="#project-home-content" className="sr-only focus:not-sr-only focus:block focus:p-3">
        Skip to Project Home content
      </a>
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm text-muted-foreground">Project / Overview</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openWorkbench()}>
            <LayoutDashboardIcon />
            Workbench
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Project settings"
            onClick={() =>
              void navigate({
                to: "/projects/$projectKey/settings",
                params: { projectKey },
                search: { checkout },
              })
            }
          >
            <Settings2Icon />
          </Button>
        </div>
      </header>
      <div
        id="project-home-content"
        className="mx-auto w-full max-w-6xl space-y-5 px-4 pt-4 sm:px-6 sm:pt-6"
      >
        <HomeCardBoundary label="Project context">
          <ProjectContextBlock
            name={name}
            host={host}
            path={path}
            context={context.data}
            evidence={contextEvidence}
            refresh={() => {
              inventory.refresh();
              context.refresh();
            }}
          />
          {inventory.error || context.error ? (
            <HomeQueryState
              label="Checkout context"
              pending={false}
              unavailable
              retry={() => {
                inventory.refresh();
                context.refresh();
              }}
            />
          ) : null}
        </HomeCardBoundary>
        {!connected ? (
          <p className="rounded-lg border border-border bg-muted p-3 text-sm" role="status">
            {host} is offline. Cached information only; work may still be running. Reconnect in
            Connections.
          </p>
        ) : null}
        {!snapshot ? (
          <HomeQueryState
            label="Project activity"
            pending
            unavailable={false}
            retry={() => void navigate({ to: "/settings/connections" })}
          />
        ) : null}
        {snapshot &&
        (snapshot.tasks === undefined ||
          snapshot.missions === undefined ||
          snapshot.missionRuns === undefined) ? (
          <p role="status" className="text-xs text-muted-foreground">
            Partial Project data. Task or Mission activity is unavailable from this host.
          </p>
        ) : null}
        {!snapshot ? null : empty ? (
          <EmptyProjectHero
            name={name}
            onIdea={(idea) => {
              setLaunchText(idea);
              document.getElementById("home-launch")?.focus();
            }}
          />
        ) : (
          <>
            <HomeCardBoundary label="Needs you">
              <ProjectAttentionList
                items={attention}
                open={open}
                now={now}
                partial={
                  snapshot.tasks === undefined ||
                  snapshot.missions === undefined ||
                  snapshot.missionRuns === undefined
                }
              />
            </HomeCardBoundary>
            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
              <HomeCardBoundary label="Resume work">
                <ProjectResumeList
                  items={resume}
                  filter={filter}
                  setFilter={(value) => setFilter(checkout, value)}
                  open={open}
                  now={now}
                />
              </HomeCardBoundary>
              <HomeCardBoundary label="Live now">
                <ProjectLiveNow
                  agents={agents}
                  services={services}
                  terminals={terminals}
                  terminalMessage={
                    !terminalAllowed ? (
                      <p className="text-xs text-muted-foreground">
                        Terminal activity unavailable. This view needs terminal permission and a
                        connected host.
                      </p>
                    ) : (
                      <HomeQueryState
                        label="Terminal activity"
                        pending={metadata.isPending}
                        unavailable={metadata.error !== null}
                        retry={metadata.refresh}
                      />
                    )
                  }
                  serviceMessage={
                    <div className="mt-2 text-xs text-muted-foreground">
                      {discovery.error ? (
                        <HomeQueryState
                          label="Server discovery"
                          pending={false}
                          unavailable
                          retry={discovery.refresh}
                        />
                      ) : (
                        "Unassigned external servers can be discovered and attached in Workbench. Preview and Logs use their existing controls."
                      )}
                    </div>
                  }
                  open={open}
                  workbench={openWorkbench}
                />
              </HomeCardBoundary>
            </div>
          </>
        )}
        <HomeCardBoundary label="Start new work">
          <ProjectLaunchBar
            text={launchText}
            setText={setLaunchText}
            name={name}
            disabledReason={disabledReason}
            readiness={readinessLabel}
            launch={launch}
            gitAvailable={context.data?.git !== null && context.data?.git !== undefined && !invalid}
          />
        </HomeCardBoundary>
        {empty ? (
          <section aria-label="Project entry points" className="grid gap-3 pb-6 sm:grid-cols-3">
            <Button variant="outline" onClick={() => openWorkbench()}>
              <LayoutDashboardIcon />
              Open Workbench
            </Button>
            <Button
              variant="outline"
              onClick={() => void launch("mission", "")}
              disabled={disabledReason !== null || !context.data?.git}
            >
              <WorkflowIcon />
              Plan a Swarm
            </Button>
            <Button
              variant="outline"
              onClick={() => void launch("chat", "")}
              disabled={disabledReason !== null}
            >
              Quick thread
            </Button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
