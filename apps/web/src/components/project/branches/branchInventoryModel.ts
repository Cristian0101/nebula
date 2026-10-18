import type {
  ProjectInventory,
  ProjectInventoryWorktree,
  ProjectWorkspaceContext,
  ScopedProjectRef,
  TerminalSummary,
} from "@t3tools/contracts";
import { terminalWorkspaceHostThreadId as terminalWorkspaceHost } from "../../terminalCenter/terminalWorkspace";
import type { TerminalWorkspace } from "../../terminalCenter/terminalWorkspace";

export const INVENTORY_FILTERS = ["All", "Has changes", "Task-owned", "Active"] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];
export type InventoryRef = ProjectInventory["refs"][number];
export type InventorySelection =
  | { kind: "worktree"; workspace: ProjectInventoryWorktree }
  | { kind: "ref"; ref: InventoryRef };
export const PAGE_LIMIT = 100;

export function belongsToProject(
  value: Pick<ProjectInventory, "environmentId" | "projectId">,
  ref: ScopedProjectRef,
) {
  return value.environmentId === ref.environmentId && value.projectId === ref.projectId;
}

/** Compound cursor pages must describe one observation and one physical Project. */
export function appendInventoryPage(
  pages: readonly ProjectInventory[],
  page: ProjectInventory,
): readonly ProjectInventory[] | null {
  const first = pages[0];
  const previous = pages.at(-1);
  if (page.issues.includes("stale-cursor")) return null;
  if (
    first &&
    (first.environmentId !== page.environmentId ||
      first.projectId !== page.projectId ||
      first.identity?.repositoryId !== page.identity?.repositoryId)
  )
    return null;
  if (
    previous?.nextCursor &&
    page.nextCursor &&
    previous.nextCursor.snapshotId !== page.nextCursor.snapshotId
  )
    return null;
  if (
    first &&
    ["refs", "worktrees"].some(
      (subject) =>
        first.observations.find((item) => item.subject === subject)?.observedAt !==
        page.observations.find((item) => item.subject === subject)?.observedAt,
    )
  )
    return null;
  return previous === page ? pages : [...pages, page];
}

export function inventoryRecords(pages: readonly ProjectInventory[]) {
  const worktrees = [
    ...new Map(
      pages.flatMap((page) => page.worktrees).map((item) => [item.workspaceKey, item]),
    ).values(),
  ];
  const refs = [
    ...new Map(pages.flatMap((page) => page.refs).map((item) => [item.fullRefName, item])).values(),
  ];
  const root = pages[0]?.identity?.projectRoot;
  worktrees.sort(
    (a, b) =>
      Number(b.isMain) - Number(a.isMain) ||
      Number(b.realPath === root) - Number(a.realPath === root) ||
      a.path.localeCompare(b.path),
  );
  refs.sort(
    (a, b) =>
      Number(a.kind === "remote-tracking") - Number(b.kind === "remote-tracking") ||
      a.fullRefName.localeCompare(b.fullRefName),
  );
  return { worktrees, refs: refs.filter((ref) => ref.workspaceKeys.length === 0) };
}

export function verifiedContext(
  context: ProjectWorkspaceContext | null | undefined,
  project: ScopedProjectRef,
  workspace: ProjectInventoryWorktree,
): ProjectWorkspaceContext | null {
  return context &&
    belongsToProject(context, project) &&
    context.workspace?.workspaceKey === workspace.workspaceKey
    ? context
    : null;
}
export function providerActivity(
  status: ProjectWorkspaceContext["providerSessions"][number]["status"],
) {
  return status === "running"
    ? "Running"
    : status === "ready"
      ? "Ready"
      : status === "closed"
        ? "Stopped"
        : status === "error"
          ? "Unavailable"
          : "Unknown";
}
export function changesLabel(context: ProjectWorkspaceContext | null | undefined) {
  if (!context?.git) return "Changes unknown";
  return context.git.trackedChanges || context.git.untrackedCount
    ? `${context.git.trackedChanges} tracked · ${context.git.untrackedCount} untracked`
    : "Clean · tracked and untracked observed";
}
export function filterWorktree(
  _workspace: ProjectInventoryWorktree,
  context: ProjectWorkspaceContext | undefined,
  filter: InventoryFilter,
  connected: boolean,
): "match" | "unknown" | "exclude" {
  if (filter === "All") return "match";
  if (!context || !connected || context.state === "invalid" || context.state === "unavailable")
    return "unknown";
  if (filter === "Has changes")
    return !context.git
      ? "unknown"
      : context.git.trackedChanges + context.git.untrackedCount > 0
        ? "match"
        : "exclude";
  if (filter === "Task-owned")
    return context.taskIds.length
      ? "match"
      : context.observations.find((item) => item.subject === "associations")?.completeness ===
          "complete"
        ? "exclude"
        : "unknown";
  if (
    context.providerSessions.some(
      (session) => session.status === "running" || session.status === "ready",
    )
  )
    return "match";
  // Provider directory records cannot prove process idleness; terminal coverage is separate.
  return "unknown";
}
export function searchWorktree(workspace: ProjectInventoryWorktree, search: string) {
  return `${workspace.branchRef ?? "detached HEAD"} ${workspace.path} ${workspace.workspaceKey} ${workspace.headSha ?? ""}`
    .toLocaleLowerCase()
    .includes(search.toLocaleLowerCase());
}

/** Local layouts are presentation hints only. Require server-verified associations and exact path. */
export function existingPresentations(
  context: ProjectWorkspaceContext,
  workspaces: readonly TerminalWorkspace[],
) {
  if (
    !context.workspace?.realPath ||
    context.state === "invalid" ||
    context.issues.some((issue) =>
      ["workspace-unavailable", "repository-mismatch", "workspace-invalid"].includes(issue),
    )
  )
    return [];
  return workspaces.flatMap((workspace) =>
    workspace.panes
      .filter(
        (pane) =>
          pane.workspacePath === context.workspace!.realPath &&
          (pane.threadId === null || context.threadIds.some((id) => id === pane.threadId)) &&
          (pane.taskId === null || context.taskIds.some((id) => id === pane.taskId)),
      )
      .map((pane) => ({ workspace, pane })),
  );
}

export function workspaceTerminals(
  context: ProjectWorkspaceContext,
  workspaces: readonly TerminalWorkspace[],
  terminals: readonly TerminalSummary[],
  projectId: string,
) {
  const presentations = existingPresentations(context, workspaces);
  return terminals.filter(
    (terminal) =>
      (terminal.worktreePath ?? terminal.cwd) === context.workspace?.realPath &&
      (context.threadIds.some((id) => id === terminal.threadId) ||
        presentations.some(
          ({ pane, workspace }) =>
            pane.terminalId === terminal.terminalId &&
            (pane.terminalThreadId ?? terminalWorkspaceHost(projectId, workspace.id)) ===
              terminal.threadId,
        )),
  );
}
