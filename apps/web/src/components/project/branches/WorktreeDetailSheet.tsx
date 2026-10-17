import { useEffect } from "react";
import type {
  ProjectWorkspaceContext,
  ScopedProjectRef,
  TerminalSummary,
} from "@t3tools/contracts";
import { Sheet, SheetPopup, SheetHeader, SheetTitle, SheetDescription } from "../../ui/sheet";
import { Button } from "../../ui/button";
import { useEnvironmentQuery } from "../../../state/query";
import { projectEnvironment } from "../../../state/projects";
import { terminalEnvironment } from "../../../state/terminal";
import type { TerminalWorkspace } from "../../terminalCenter/terminalWorkspace";
import {
  changesLabel,
  existingPresentations,
  providerActivity,
  verifiedContext,
  workspaceTerminals,
  type InventorySelection,
} from "./branchInventoryModel";
import { homeRelativeTime } from "../home/ProjectHomeSections";

export type WorkDestination =
  | { kind: "thread" | "task" | "mission" | "integration"; id: string }
  | { kind: "presentation"; workspaceId: string; paneId: string };

export function ObservationList({
  context,
  now = Date.now(),
}: {
  now?: number;
  context: Pick<ProjectWorkspaceContext, "observations" | "issues" | "state">;
}) {
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <p>Observation: {context.state}. Reads from multiple sources are not atomic.</p>
      <ul className="space-y-1">
        {context.observations.map((item) => (
          <li key={item.subject}>
            {item.subject}: {item.completeness} ·{" "}
            {item.observedAt
              ? `${item.cache} ${homeRelativeTime(item.observedAt, now)}`
              : "observation time unavailable"}
          </li>
        ))}
      </ul>
      {context.issues.length ? <p role="status">Issues: {context.issues.join(", ")}</p> : null}
    </div>
  );
}
export function TerminalActivity({
  terminals,
  now = Date.now(),
}: {
  terminals: readonly TerminalSummary[];
  now?: number;
}) {
  return (
    <>
      {terminals.length ? (
        <ul className="space-y-2">
          {terminals.map((item) => (
            <li key={`${item.threadId}:${item.terminalId}`} className="text-sm">
              {item.hasRunningSubprocess
                ? "Running"
                : item.status === "running"
                  ? "Ready"
                  : item.status === "exited"
                    ? "Stopped"
                    : "Unknown"}{" "}
              · terminal <span className="font-mono text-xs break-all">{item.terminalId}</span>
              <p className="text-xs text-muted-foreground">
                Observed {homeRelativeTime(item.updatedAt, now)}. Service readiness unknown.
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No associated terminals observed. External process activity is unknown.
        </p>
      )}
    </>
  );
}

export function WorktreeDetailSheet({
  selection,
  project,
  host,
  now = Date.now(),
  connected,
  readable,
  terminalAllowed,
  workspaces,
  cachedContext,
  onContext,
  onClose,
  open,
  titleFor,
}: {
  selection: InventorySelection;
  project: ScopedProjectRef;
  host: string;
  now?: number;
  connected: boolean;
  readable: boolean;
  terminalAllowed: boolean;
  workspaces: readonly TerminalWorkspace[];
  cachedContext: ProjectWorkspaceContext | null;
  onContext: (context: ProjectWorkspaceContext) => void;
  onClose: () => void;
  open: (destination: WorkDestination) => void;
  titleFor: (kind: "thread" | "task" | "mission" | "integration", id: string) => string;
}) {
  const workspace = selection.kind === "worktree" ? selection.workspace : null;
  const query = useEnvironmentQuery(
    connected && readable && workspace
      ? projectEnvironment.workspaceContext({
          environmentId: project.environmentId,
          input: { projectId: project.projectId, workspaceKey: workspace.workspaceKey },
        })
      : null,
  );
  const context = workspace
    ? verifiedContext(query.data ?? cachedContext, project, workspace)
    : null;
  useEffect(() => {
    if (context && query.data === context) onContext(context);
  }, [context, query.data, onContext]);
  const metadata = useEnvironmentQuery(
    terminalAllowed && context
      ? terminalEnvironment.metadata({ environmentId: project.environmentId, input: null })
      : null,
  );
  const presentations = context ? existingPresentations(context, workspaces) : [];
  const terminals = context
    ? workspaceTerminals(context, workspaces, metadata.data ?? [], project.projectId)
    : [];
  const invalid =
    !context || context.state === "invalid" || context.state === "unavailable" || !!query.error;
  const title = workspace
    ? workspace.detached
      ? "Detached HEAD"
      : (workspace.branchRef ?? "Branch unavailable")
    : selection.kind === "ref"
      ? selection.ref.fullRefName
      : "Checkout unavailable";
  const lists = context
    ? ([
        ["task", "Tasks", context.taskIds],
        ["mission", "Missions", context.missionIds],
        ["integration", "Integration batches", context.integrationBatchIds],
        ["thread", "Threads", context.threadIds],
      ] as const)
    : [];
  return (
    <Sheet
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <SheetPopup
        className="w-full! max-w-[30rem]! motion-reduce:transition-none [&_[data-slot=sheet-close]]:shrink-0"
        initialFocus={() => document.getElementById("worktree-detail-title")}
        finalFocus={() =>
          document.querySelector<HTMLElement>(
            `[data-inventory-key="${workspace?.workspaceKey ?? (selection.kind === "ref" ? encodeURIComponent(selection.ref.fullRefName) : "")}"]`,
          ) ?? document.getElementById("branches-heading")
        }
      >
        <SheetHeader className="pr-12">
          <SheetTitle id="worktree-detail-title" tabIndex={-1} className="break-all leading-snug">
            {title}
          </SheetTitle>
          <SheetDescription>Inspection only · {host}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto p-6 pt-0">
          {workspace ? (
            <>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Registered checkout</dt>
                  <dd className="break-all font-mono text-xs">{workspace.path}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Workspace identity</dt>
                  <dd className="break-all font-mono text-xs">{workspace.workspaceKey}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Availability</dt>
                  <dd>
                    {workspace.isMain ? "Main" : "Linked"} ·{" "}
                    {context?.workspace?.availability ?? workspace.availability}
                    {workspace.locked ? " · Locked" : ""}
                    {workspace.prunable ? " · Prunable" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">HEAD</dt>
                  <dd className="break-all font-mono text-xs">
                    {context?.git?.headSha ?? workspace.headSha ?? "Unknown"}
                    {(context?.git?.detached ?? workspace.detached) ? " · Detached HEAD" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Branch at inspection</dt>
                  <dd className="break-all font-mono text-xs">
                    {context?.git?.branchRef ?? "Unknown or detached"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Git changes</dt>
                  <dd>
                    {!connected ? "Cached: " : ""}
                    {changesLabel(context)}
                  </dd>
                </div>
              </dl>
              {!connected ? (
                <p role="status" className="text-sm">
                  Host offline. Cached observations only; current activity unknown.
                </p>
              ) : null}
              {query.isPending ? <p role="status">Inspecting selected checkout…</p> : null}
              {query.error ? (
                <p role="alert">
                  Inspection unavailable. Check this host’s permissions and connection.
                </p>
              ) : null}
              {connected && readable ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={query.isPending}
                  className="h-auto max-w-full whitespace-normal break-all text-left"
                  onClick={query.refresh}
                >
                  Reinspect checkout
                </Button>
              ) : null}
              {context?.issues.includes("ambiguous-ownership") ? (
                <p role="alert" className="rounded-md border border-border p-3 text-sm">
                  Ambiguous ownership. Multiple canonical claims are retained; no exclusive owner is
                  selected.
                </p>
              ) : null}
              {context?.git &&
              (workspace.headSha !== context.git.headSha ||
                workspace.branchRef !== context.git.branchRef) ? (
                <p role="status">Checkout changed since inventory. Refresh locally to reconcile.</p>
              ) : null}
              {invalid ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Verified checkout context unavailable. No fallback checkout is selected. Refresh
                  inventory or recover the recorded checkout through its existing surface.
                </p>
              ) : (
                <>
                  {lists.map(([kind, label, ids]) => (
                    <section key={kind} aria-label={label}>
                      <h3 className="mb-2 text-sm font-semibold">{label}</h3>
                      {ids.length ? (
                        <ul className="space-y-2">
                          {ids.map((id) => (
                            <li key={id}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-auto max-w-full justify-start whitespace-normal break-all text-left"
                                disabled={!connected}
                                onClick={() => open({ kind, id })}
                              >
                                Open {titleFor(kind, id)}
                              </Button>
                              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                                {id}
                              </p>
                              {kind === "task" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!connected}
                                  className="h-auto max-w-full whitespace-normal break-all text-left"
                                  onClick={() => open({ kind: "task", id })}
                                >
                                  Open Task Diff in inspector
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No verified {label.toLowerCase()} returned
                          {context.state === "partial" ? " · coverage partial" : ""}.
                        </p>
                      )}
                    </section>
                  ))}
                  <section aria-label="Observed provider sessions">
                    <h3 className="mb-2 text-sm font-semibold">Observed provider sessions</h3>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Session records do not prove OS process liveness.
                    </p>
                    {context.providerSessions.length ? (
                      <ul className="space-y-2">
                        {context.providerSessions.map((item) => (
                          <li
                            key={`${item.threadId}:${item.instanceId}`}
                            className="break-all text-sm"
                          >
                            {connected ? providerActivity(item.status) : "Unknown"} ·{" "}
                            {item.instanceId} · {item.driver}
                            <p className="text-xs text-muted-foreground">
                              Provider record: {item.status} · updated{" "}
                              {homeRelativeTime(item.updatedAt, now)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {context.observations.find((item) => item.subject === "sessions")
                          ?.completeness === "complete"
                          ? "No associated provider sessions observed. Process activity unknown."
                          : "Provider activity unavailable or partial."}
                      </p>
                    )}
                  </section>
                  <section aria-label="Terminal activity">
                    <h3 className="mb-2 text-sm font-semibold">Terminal activity</h3>
                    {!terminalAllowed ? (
                      <p className="text-sm text-muted-foreground">
                        Unavailable. Existing terminal permission and a connected host are required.
                      </p>
                    ) : metadata.error ? (
                      <p role="status">Terminal activity unavailable.</p>
                    ) : metadata.isPending && metadata.data === null ? (
                      <p role="status">Loading terminal observations…</p>
                    ) : (
                      <TerminalActivity terminals={terminals} now={now} />
                    )}
                  </section>
                  <section aria-label="Existing presentations">
                    <h3 className="mb-2 text-sm font-semibold">Existing presentations</h3>
                    {presentations.length ? (
                      <ul className="space-y-2">
                        {presentations.map(({ workspace: layout, pane }) => (
                          <li key={`${layout.id}:${pane.id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!connected}
                              className="h-auto max-w-full whitespace-normal break-all text-left"
                              onClick={() =>
                                open({
                                  kind: "presentation",
                                  workspaceId: layout.id,
                                  paneId: pane.id,
                                })
                              }
                            >
                              Open{" "}
                              {pane.type === "preview"
                                ? "Preview"
                                : pane.type === "diff"
                                  ? "Diff"
                                  : "Workbench"}{" "}
                              · {layout.name} / {pane.title}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No existing workspace presentation is associated with this checkout. Open an
                        associated Thread or Task to recover existing work.
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Opening a presentation never creates a pane, Thread or process. Preview
                      service readiness is unknown.
                    </p>
                  </section>
                </>
              )}
              {context ? <ObservationList context={context} now={now} /> : null}
            </>
          ) : selection.kind === "ref" ? (
            <>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt>Full branch identity</dt>
                  <dd className="break-all font-mono text-xs">{selection.ref.fullRefName}</dd>
                </div>
                <div>
                  <dt>Tip SHA</dt>
                  <dd className="break-all font-mono text-xs">{selection.ref.headSha}</dd>
                </div>
                <div>
                  <dt>Commit timestamp</dt>
                  <dd>{selection.ref.committedAt ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>Upstream</dt>
                  <dd className="break-all font-mono text-xs">
                    {selection.ref.upstreamRef ?? "None recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Origin</dt>
                  <dd>{selection.ref.kind}</dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                This branch has no registered checkout. Working-tree changes and activity do not
                apply. Creation belongs to E4.3B.
              </p>
            </>
          ) : null}
        </div>
      </SheetPopup>
    </Sheet>
  );
}
