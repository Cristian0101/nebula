import { useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { GitBranchIcon, RefreshCwIcon } from "lucide-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ProjectWorkspaceContext } from "@t3tools/contracts";
import { useProjectNavigationGroup } from "../projectNavigationContext";
import { useEnvironmentConnectionState } from "../../../state/environments";
import { useEnvironmentSessionState } from "../../../state/session";
import { serverEnvironment } from "../../../state/server";
import { environmentSnapshotAtom } from "../../../state/shell";
import { useUiStateStore } from "../../../uiStateStore";
import { useProjectNavigate } from "../../../hooks/useProjectNavigate";
import { encodeProjectCheckout } from "../../../projectNavigation";
import { Button } from "../../ui/button";
import { activateWorkspaceLayoutPane } from "../../terminalCenter/terminalWorkspace";
import {
  changesLabel,
  filterWorktree,
  INVENTORY_FILTERS,
  inventoryRecords,
  searchWorktree,
  providerActivity,
  existingPresentations,
  type InventoryFilter,
  type InventorySelection,
} from "./branchInventoryModel";
import { homeRelativeTime } from "../home/ProjectHomeSections";
import { WorktreeDetailSheet, ObservationList, type WorkDestination } from "./WorktreeDetailSheet";
import { useBranchInventory } from "./useBranchInventory";

const rowClass =
  "grid w-full min-w-0 gap-2 border-b border-border px-4 py-3 text-left text-sm last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)]";
export function inventoryKeyboard(event: KeyboardEvent<HTMLElement>) {
  if (
    !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
    !(event.target instanceof Element) ||
    !event.target.closest("[data-inventory-key]")
  )
    return;
  const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-inventory-key]")];
  const index = rows.indexOf(event.target.closest<HTMLButtonElement>("[data-inventory-key]")!);
  const target =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? rows.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
  event.preventDefault();
  rows[target]?.focus();
}
export function BranchInventory({ projectKey }: { projectKey: string }) {
  const group = useProjectNavigationGroup();
  return group ? (
    <ScopedBranchInventory key={`${group.environmentId}:${group.id}`} projectKey={projectKey} />
  ) : (
    <p role="status">Checkout unavailable.</p>
  );
}
function ScopedBranchInventory({ projectKey }: { projectKey: string }) {
  const group = useProjectNavigationGroup()!;
  const project = scopeProjectRef(group.environmentId, group.id);
  const checkout = encodeProjectCheckout(project);
  const connected = useEnvironmentConnectionState(group.environmentId).data?.phase === "connected";
  const session = useEnvironmentSessionState(group.environmentId);
  const readable =
    !session.hasError &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes("orchestration:read") === true;
  const terminalAllowed =
    connected &&
    !session.hasError &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes("terminal:operate") === true;
  const config = useAtomValue(serverEnvironment.configValueAtom(group.environmentId));
  const snapshot = useAtomValue(environmentSnapshotAtom(group.environmentId));
  const supported = config?.environment.capabilities.projectInventory === true;
  const inventory = useBranchInventory(project, connected && readable && supported);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("All");
  const [selection, setSelection] = useState<InventorySelection | null>(null);
  const [contexts, setContexts] = useState<Record<string, ProjectWorkspaceContext>>({});
  const storeContext = useCallback((context: ProjectWorkspaceContext) => {
    if (context.workspace)
      setContexts((previous) =>
        previous[context.workspace!.workspaceKey] === context
          ? previous
          : { ...previous, [context.workspace!.workspaceKey]: context },
      );
  }, []);
  const state = useUiStateStore((value) => value.terminalWorkspacesByProjectId[checkout]);
  const navigate = useProjectNavigate();
  const { worktrees, refs } = inventoryRecords(inventory.pages);
  const first = inventory.pages[0];
  const last = inventory.pages.at(-1);
  const lowerBound = inventory.pages.some(
    (page) =>
      page.state === "partial" ||
      page.observations.some((item) => item.completeness !== "complete") ||
      page.issues.includes("scan-limit") ||
      page.issues.includes("truncated"),
  );
  const filtered = worktrees
    .filter((item) => searchWorktree(item, search))
    .map((workspace) => ({
      workspace,
      match: filterWorktree(workspace, contexts[workspace.workspaceKey], filter, connected),
    }))
    .filter((item) => item.match !== "exclude");
  const visibleRefs =
    filter === "All"
      ? refs.filter((item) =>
          `${item.fullRefName} ${item.headSha} ${item.upstreamRef ?? ""}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
        )
      : [];
  const host =
    group.memberProjects.find(
      (member) => member.id === group.id && member.environmentId === group.environmentId,
    )?.environmentLabel ?? group.environmentId;
  const titleFor = (kind: "thread" | "task" | "mission" | "integration", id: string) => {
    const collection =
      kind === "thread"
        ? snapshot?.threads
        : kind === "task"
          ? snapshot?.tasks
          : kind === "mission"
            ? snapshot?.missions
            : snapshot?.projects.find((item) => item.id === group.id)?.integrationBatches;
    const record = collection?.find((item) => item.id === id && item.projectId === group.id);
    return record && "title" in record ? record.title : `${kind} ${id}`;
  };
  const open = (destination: WorkDestination) => {
    if (!connected) return;
    if (destination.kind === "thread")
      return void navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: group.environmentId, threadId: destination.id },
      });
    if (destination.kind === "presentation") {
      const current = useUiStateStore.getState().terminalWorkspacesByProjectId[checkout];
      const context =
        selection?.kind === "worktree" ? contexts[selection.workspace.workspaceKey] : null;
      if (
        !current ||
        !context ||
        !existingPresentations(context, current.workspaces).some(
          ({ workspace, pane }) =>
            workspace.id === destination.workspaceId && pane.id === destination.paneId,
        )
      )
        return;
      useUiStateStore.getState().setTerminalWorkspaceProjectState(checkout, {
        ...current,
        activeWorkspaceId: destination.workspaceId,
        workspaces: current.workspaces.map((workspace) =>
          workspace.id === destination.workspaceId
            ? activateWorkspaceLayoutPane(
                {
                  ...workspace,
                  panes: workspace.panes.map((pane) =>
                    pane.id === destination.paneId ? { ...pane, visible: true } : pane,
                  ),
                },
                destination.paneId,
              )
            : workspace,
        ),
      });
      return void navigate({
        to: "/projects/$projectKey/terminal-center",
        params: { projectKey },
        search: { checkout, inspect: true },
      });
    }
    void navigate({
      to: "/projects/$projectKey/command-deck",
      params: { projectKey },
      search: {
        checkout,
        ...(destination.kind === "task"
          ? { selectedTask: destination.id }
          : destination.kind === "mission"
            ? { mode: "swarm", stage: "war-room", missionId: destination.id }
            : { section: "integration" }),
      },
    });
  };
  return (
    <main className="min-h-0 min-w-0 flex-1 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-[100rem] space-y-4">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="branches-heading" tabIndex={-1} className="text-xl font-semibold">
              Branches &amp; Worktrees
            </h1>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {group.displayName} · {host} · {group.workspaceRoot}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Inspect existing checkouts and work. Selecting a row never switches branches.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!connected || !readable || !supported || inventory.pending}
            onClick={() => {
              setSelection(null);
              setContexts({});
              inventory.refresh();
            }}
          >
            <RefreshCwIcon className="size-3.5" />
            Refresh locally
          </Button>
        </header>
        {!connected ? (
          <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm">
            {host} is offline. Cached observations only; current Git status and activity are
            unknown. No other host is substituted.
          </p>
        ) : null}
        {!readable ? (
          <p role="status" className="rounded-md border border-border p-4">
            Inventory unavailable. Orchestration read permission is required on this host.
          </p>
        ) : !supported && connected ? (
          <p role="status" className="rounded-md border border-border p-4">
            Inventory unavailable. This server does not advertise Project inventory support. Update
            the selected host to inspect Git.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1 text-xs font-medium">
                Search refs and worktrees
                <input
                  type="search"
                  maxLength={512}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Branch, path, SHA or workspace identity"
                />
              </label>
              <div
                className="flex max-w-full flex-wrap items-end gap-1"
                role="group"
                aria-label="Inventory filter"
              >
                {INVENTORY_FILTERS.map((item) => (
                  <Button
                    key={item}
                    variant={filter === item ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={filter === item}
                    onClick={() => setFilter(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground" role="status">
              Search covers {worktrees.length} loaded checkouts and {refs.length} loaded branches
              without checkouts.{" "}
              {last?.nextCursor
                ? "More records remain; load more to extend results."
                : lowerBound
                  ? "Bounded observation is partial; counts are lower bounds."
                  : first
                    ? "All records in this local observation loaded."
                    : "No local observation loaded yet."}{" "}
              {filter !== "All"
                ? "Filters use inspected facts only; uninspected or incomplete checkouts remain marked unknown. Active covers observed provider sessions; external processes remain unknown."
                : "Git changes, work and provider activity load on inspection."}
            </p>
            {inventory.notice ? (
              <p role="status" className="rounded-md border border-border p-3 text-sm">
                {inventory.notice}
              </p>
            ) : null}
            {inventory.error ? (
              <p role="alert" className="rounded-md border border-border p-3 text-sm">
                Inventory request unavailable. Check connection and read permission, then refresh
                locally. Previous observations may be stale.
              </p>
            ) : null}
            {inventory.pending ? (
              <p role="status" className="rounded-md border border-border p-4">
                Loading local inventory…
              </p>
            ) : null}
            {first && !first.identity ? (
              <p role="status">
                {first.issues.includes("project-unavailable")
                  ? "Project unavailable on the selected host."
                  : "Git identity unavailable. This folder may not be a Git repository."}{" "}
                No fallback repository is selected.
              </p>
            ) : null}
            <div onKeyDown={inventoryKeyboard}>
              <section
                aria-labelledby="checkouts-heading"
                className="overflow-hidden rounded-lg border border-border bg-card"
              >
                <h2
                  id="checkouts-heading"
                  className="border-b border-border px-4 py-3 text-sm font-semibold"
                >
                  Registered checkouts · {worktrees.length} loaded
                  {first
                    ? ` / ${lowerBound ? "at least " : ""}${first.totals.worktrees} observed`
                    : ""}
                </h2>
                {filtered.map(({ workspace, match }) => {
                  const context = contexts[workspace.workspaceKey];
                  const current =
                    workspace.realPath !== null &&
                    workspace.realPath === first?.identity?.projectRoot;
                  return (
                    <button
                      type="button"
                      key={workspace.workspaceKey}
                      data-inventory-key={workspace.workspaceKey}
                      aria-label={`Inspect ${workspace.branchRef ?? (workspace.detached ? "Detached HEAD" : "Branch unknown")}${current ? ", Current checkout" : ""}, ${workspace.availability}${workspace.locked ? ", Locked" : ""}${workspace.prunable ? ", Prunable" : ""}`}
                      className={`${rowClass} ${current ? "bg-accent/30" : ""}`}
                      onClick={() => setSelection({ kind: "worktree", workspace })}
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-start gap-2">
                          <GitBranchIcon
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          />
                          <span className="break-all font-mono text-xs">
                            {workspace.detached
                              ? `Detached HEAD @ ${workspace.headSha?.slice(0, 7) ?? "unknown"}`
                              : (workspace.branchRef ?? "Branch unknown")}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {workspace.isMain ? "Main checkout" : "Linked checkout"}
                          {current ? " · Current checkout" : ""} · {workspace.availability}
                          {workspace.locked ? " · Locked" : ""}
                          {workspace.prunable ? " · Prunable" : ""} · HEAD{" "}
                          {workspace.headSha?.slice(0, 7) ?? workspace.headState}
                        </span>
                        <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                          {workspace.path}
                        </span>
                      </span>
                      <span className="min-w-0 text-xs">
                        <span className="block">
                          {connected ? changesLabel(context) : "Changes unknown · host offline"}
                        </span>
                        <span className="mt-1 block text-muted-foreground">
                          {context
                            ? `${context.taskIds.length} Tasks · ${context.threadIds.length} Threads · ${context.missionIds.length} Missions · ${context.integrationBatchIds.length} Integrations${context.issues.includes("ambiguous-ownership") ? " · Ambiguous ownership" : ""}`
                            : "Work associations unknown · inspect checkout"}
                        </span>
                        {match === "unknown" ? (
                          <span className="mt-1 block">Filter unknown until inspected</span>
                        ) : null}
                      </span>
                      <span className="min-w-0 text-xs text-muted-foreground">
                        {!connected
                          ? "Activity unknown · offline"
                          : context?.providerSessions.length
                            ? context.providerSessions
                                .map(
                                  (item) => `${item.instanceId}: ${providerActivity(item.status)}`,
                                )
                                .join(" · ")
                            : "Provider activity unknown"}
                        <span className="mt-1 block">
                          {context
                            ? `${context.state} context · ${context.observations.find((item) => item.subject === "status")?.observedAt ? homeRelativeTime(context.observations.find((item) => item.subject === "status")!.observedAt!, now) : "time unknown"}`
                            : "Registration only · status not inspected"}
                        </span>
                        <span className="mt-1 block">Inspect checkout →</span>
                      </span>
                    </button>
                  );
                })}
                {!filtered.length && !inventory.pending ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No matching checkouts in loaded observations.{" "}
                    {last?.nextCursor || lowerBound
                      ? "More matches may exist beyond this page or scan."
                      : "Adjust search or filter."}
                  </p>
                ) : null}
              </section>
              <section
                aria-labelledby="branches-section-heading"
                className="mt-4 overflow-hidden rounded-lg border border-border bg-card"
              >
                <h2
                  id="branches-section-heading"
                  className="border-b border-border px-4 py-3 text-sm font-semibold"
                >
                  Branches without checkouts · {refs.length} loaded
                </h2>
                {visibleRefs.map((ref) => (
                  <button
                    type="button"
                    key={ref.fullRefName}
                    data-inventory-key={encodeURIComponent(ref.fullRefName)}
                    className={rowClass}
                    onClick={() => setSelection({ kind: "ref", ref })}
                  >
                    <span className="min-w-0 break-all font-mono text-xs">
                      {ref.fullRefName}
                      <span className="mt-1 block font-sans text-muted-foreground">
                        {ref.kind === "local" ? "Local branch" : "Remote-tracking ref"}
                      </span>
                    </span>
                    <span className="min-w-0 break-all text-xs text-muted-foreground">
                      Tip {ref.headSha.slice(0, 7)}
                      <span className="mt-1 block">
                        {ref.committedAt
                          ? `Commit ${new Date(ref.committedAt).toLocaleString()}`
                          : "Commit time unknown"}
                      </span>
                    </span>
                    <span className="min-w-0 break-all text-xs text-muted-foreground">
                      Upstream: {ref.upstreamRef ?? "None recorded"}
                      <span className="mt-1 block">No working-tree status</span>
                    </span>
                  </button>
                ))}
                {!visibleRefs.length && !inventory.pending ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    {filter !== "All"
                      ? "Checkout filters do not apply to branches without checkouts."
                      : "No matching branches without checkouts in loaded observations."}
                  </p>
                ) : null}
              </section>
            </div>
            <div className="flex flex-wrap gap-2">
              {last?.nextCursor ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!connected || inventory.pending || inventory.blocked}
                  className="h-auto max-w-full whitespace-normal text-left"
                  onClick={inventory.loadMore}
                >
                  Load next page (up to 100 refs and checkouts)
                </Button>
              ) : null}
              {!inventory.remote ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!connected || inventory.pending}
                  className="h-auto max-w-full whitespace-normal text-left"
                  onClick={() => {
                    setSelection(null);
                    setContexts({});
                    inventory.showRemote();
                  }}
                >
                  Include remote-tracking refs
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Remote freshness: not verified. Refresh reads local Git only and never fetches from a
              remote. No checkout creation, switching or removal is available here.
            </p>
            {first ? <ObservationList context={first} now={now} /> : null}
          </>
        )}
        {selection && readable ? (
          <WorktreeDetailSheet
            key={
              selection.kind === "worktree"
                ? selection.workspace.workspaceKey
                : selection.ref.fullRefName
            }
            selection={selection}
            project={project}
            host={host}
            now={now}
            connected={connected}
            readable={readable && supported}
            terminalAllowed={terminalAllowed}
            workspaces={state?.workspaces ?? []}
            cachedContext={
              selection.kind === "worktree"
                ? (contexts[selection.workspace.workspaceKey] ?? null)
                : null
            }
            onContext={storeContext}
            onClose={() => setSelection(null)}
            open={open}
            titleFor={titleFor}
          />
        ) : null}
      </div>
    </main>
  );
}
