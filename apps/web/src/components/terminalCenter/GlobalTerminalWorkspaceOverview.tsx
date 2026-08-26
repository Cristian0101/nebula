import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { useNavigate } from "@tanstack/react-router";
import {
  AppWindowIcon,
  BotIcon,
  BoxesIcon,
  EyeIcon,
  FileClockIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  PlusIcon,
  TerminalSquareIcon,
} from "lucide-react";
import { useMemo } from "react";

import { usePrimarySettings } from "../../hooks/useSettings";
import { useThreadShells } from "../../state/entities";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { useUiStateStore } from "../../uiStateStore";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { useSettingsProjectGroups } from "../settings/ProjectSettingsPanel";
import {
  createTerminalWorkspacePane,
  updateWorkspace,
  type TerminalWorkspacePaneType,
} from "./terminalWorkspace";

type ProjectGroup = ReturnType<typeof useSettingsProjectGroups>[number];

const paneIcons: Record<TerminalWorkspacePaneType, typeof TerminalSquareIcon> = {
  shell: TerminalSquareIcon,
  provider: BotIcon,
  dev_server: AppWindowIcon,
  preview: EyeIcon,
  tests: FlaskConicalIcon,
  logs: FileClockIcon,
  git: GitBranchIcon,
  thread: BotIcon,
};

function ProjectColumn({ group }: { readonly group: ProjectGroup }) {
  const navigate = useNavigate();
  const projectState = useUiStateStore((state) => state.terminalWorkspacesByProjectId[group.id]);
  const project =
    group.memberProjects.find(
      (member) => member.environmentId === group.environmentId && member.id === group.id,
    ) ?? group.memberProjects[0]!;
  const sessions = useKnownTerminalSessions({
    environmentId: project.environmentId,
    threadId: null,
  });
  const workspace =
    projectState?.workspaces.find((candidate) => candidate.id === projectState.activeWorkspaceId) ??
    projectState?.workspaces[0] ??
    null;
  const visible = workspace?.panes.filter((pane) => pane.visible) ?? [];
  const hiddenCount = workspace?.panes.filter((pane) => !pane.visible).length ?? 0;
  const hasRunningPane = visible.some((pane) =>
    sessions.some(
      (session) =>
        pane.terminalId === session.target.terminalId && session.state.hasRunningSubprocess,
    ),
  );

  return (
    <section className="flex min-h-0 min-w-72 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-left hover:bg-muted/25"
        onClick={() =>
          void navigate({
            to: "/projects/$projectKey/terminal-center",
            params: { projectKey: group.projectKey },
          })
        }
      >
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <BoxesIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{group.displayName}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {workspace?.name ?? "Not initialized"} · {visible.length} panes
          </p>
        </div>
        <span
          className={`size-2 rounded-full ${hasRunningPane ? "bg-emerald-500" : "bg-muted-foreground/35"}`}
          aria-label={hasRunningPane ? "Processes running" : "Idle"}
        />
      </button>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {visible.map((pane) => {
          const Icon = paneIcons[pane.type];
          const running = sessions.some(
            (session) =>
              session.target.terminalId === pane.terminalId && session.state.hasRunningSubprocess,
          );
          return (
            <button
              key={pane.id}
              type="button"
              className="flex w-full items-start gap-2 rounded-lg border border-border/70 bg-background/60 p-2.5 text-left hover:border-primary/40 hover:bg-muted/25"
              onClick={() =>
                void navigate({
                  to: "/projects/$projectKey/terminal-center",
                  params: { projectKey: group.projectKey },
                })
              }
            >
              <Icon className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{pane.title}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                  {pane.type === "provider" || pane.type === "thread"
                    ? "Live canonical Thread"
                    : (pane.command ?? pane.previewUrl ?? pane.workspacePath)}
                </p>
              </div>
              <span
                className={`mt-1 size-1.5 rounded-full ${running ? "bg-emerald-500" : "bg-muted-foreground/35"}`}
              />
            </button>
          );
        })}
        {!workspace ? (
          <div className="grid min-h-52 place-items-center rounded-lg border border-dashed border-border p-5 text-center">
            <div>
              <TerminalSquareIcon className="mx-auto size-6 text-primary" />
              <p className="mt-3 text-xs font-medium">Open the Project Workspace</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Nebula will create its Default Workspace and rooted Shell.
              </p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t border-border px-2 py-2 text-[10px] text-muted-foreground">
        <span>{hiddenCount > 0 ? `Hidden panes (${hiddenCount})` : "No hidden panes"}</span>
        <Button
          size="micro"
          variant="ghost"
          onClick={() =>
            void navigate({
              to: "/projects/$projectKey/terminal-center",
              params: { projectKey: group.projectKey },
            })
          }
        >
          <PlusIcon /> Add Pane
        </Button>
      </div>
    </section>
  );
}

export function GlobalTerminalWorkspaceOverview() {
  const navigate = useNavigate();
  const groups = useSettingsProjectGroups();
  const threads = useThreadShells();
  const settings = usePrimarySettings();
  const workspaceStates = useUiStateStore((state) => state.terminalWorkspacesByProjectId);
  const setWorkspaceState = useUiStateStore((state) => state.setTerminalWorkspaceProjectState);
  const activeThreads = useMemo(
    () =>
      threads
        .filter(
          (thread) =>
            thread.latestTurn?.state === "running" ||
            thread.backgroundLiveness === "working" ||
            thread.hasPendingApprovals ||
            thread.hasPendingUserInput,
        )
        .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [threads],
  );
  const visiblePaneCount = Object.values(workspaceStates).reduce(
    (total, state) =>
      total +
      state.workspaces.reduce(
        (count, workspace) => count + workspace.panes.filter((pane) => pane.visible).length,
        0,
      ),
    0,
  );
  const hiddenPaneCount = Object.values(workspaceStates).reduce(
    (total, state) =>
      total +
      state.workspaces.reduce(
        (count, workspace) => count + workspace.panes.filter((pane) => !pane.visible).length,
        0,
      ),
    0,
  );
  const profileCount = Object.values(settings.devServerProfilesByProject).flat().length;

  const focusThreadInWorkspace = (thread: EnvironmentThreadShell) => {
    const group = groups.find((candidate) =>
      candidate.memberProjects.some(
        (project) =>
          project.environmentId === thread.environmentId && project.id === thread.projectId,
      ),
    );
    if (!group) return;
    const state = workspaceStates[group.id];
    if (state) {
      const workspace =
        state.workspaces.find((candidate) => candidate.id === state.activeWorkspaceId) ??
        state.workspaces[0];
      if (workspace) {
        const existing = workspace.panes.find((pane) => pane.threadId === thread.id);
        const pane =
          existing ??
          createTerminalWorkspacePane({
            id: crypto.randomUUID(),
            type: "thread",
            title: thread.title,
            workspacePath:
              group.memberProjects.find((project) => project.id === thread.projectId)
                ?.workspaceRoot ?? "Unavailable",
            threadId: thread.id,
            providerInstanceId: thread.modelSelection.instanceId,
            grid: firstOpenCell(workspace.panes),
          });
        setWorkspaceState(
          group.id,
          updateWorkspace(state, workspace.id, (current) => ({
            ...current,
            panes: existing
              ? current.panes.map((candidate) =>
                  candidate.id === existing.id ? { ...candidate, visible: true } : candidate,
                )
              : [...current.panes, pane],
            selectedPaneId: pane.id,
          })),
        );
      }
    }
    void navigate({
      to: "/projects/$projectKey/terminal-center",
      params: { projectKey: group.projectKey },
    });
  };

  return (
    <SidebarInset className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <WorkspacePageHeader className="border-b border-border bg-background">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">Global Terminal Center</h1>
          <p className="text-[11px] text-muted-foreground">Live multi-project command center</p>
        </div>
        <Button
          size="xs"
          onClick={() =>
            groups[0] &&
            void navigate({
              to: "/projects/$projectKey/terminal-center",
              params: { projectKey: groups[0].projectKey },
            })
          }
        >
          <PlusIcon /> New Project Workspace
        </Button>
      </WorkspacePageHeader>
      <nav
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2"
        aria-label="Project tabs"
      >
        <Button size="xs" variant="secondary">
          All Projects
        </Button>
        {groups.map((group) => (
          <Button
            key={group.projectKey}
            size="xs"
            variant="ghost"
            onClick={() =>
              void navigate({
                to: "/projects/$projectKey/terminal-center",
                params: { projectKey: group.projectKey },
              })
            }
          >
            {group.displayName}
          </Button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-x-auto p-3">
          <div className="flex h-full min-h-[520px] gap-3">
            {groups.map((group) => (
              <ProjectColumn key={group.projectKey} group={group} />
            ))}
          </div>
        </main>
        <aside className="hidden w-72 shrink-0 overflow-auto border-l border-border bg-card/60 p-3 xl:block">
          <h2 className="text-xs font-medium">Overview</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xl font-semibold">{visiblePaneCount}</p>
              <p className="text-[10px] text-muted-foreground">Visible panes</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xl font-semibold">{groups.length}</p>
              <p className="text-[10px] text-muted-foreground">Projects</p>
            </div>
          </div>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Hidden panes</dt>
              <dd>{hiddenPaneCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Approved Dev Servers</dt>
              <dd>{profileCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Active Threads</dt>
              <dd>{activeThreads.length}</dd>
            </div>
          </dl>
          <h2 className="mt-6 text-xs font-medium">Active Threads</h2>
          <div className="mt-2 space-y-1">
            {activeThreads.map((thread) => (
              <div
                key={`${thread.environmentId}:${thread.id}`}
                className="rounded-lg border border-border bg-background p-2"
              >
                <div className="flex items-center gap-2">
                  <BotIcon className="size-3.5" />
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">{thread.title}</p>
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                </div>
                <div className="mt-2 flex gap-1">
                  <Button
                    size="micro"
                    variant="ghost"
                    onClick={() =>
                      void navigate({
                        to: "/$environmentId/$threadId",
                        params: { environmentId: thread.environmentId, threadId: thread.id },
                      })
                    }
                  >
                    Open Thread
                  </Button>
                  <Button
                    size="micro"
                    variant="ghost"
                    onClick={() => focusThreadInWorkspace(thread)}
                  >
                    Focus in Workspace
                  </Button>
                </div>
              </div>
            ))}
            {activeThreads.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No active provider turns.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </SidebarInset>
  );
}

function firstOpenCell(
  panes: ReadonlyArray<{
    readonly visible: boolean;
    readonly grid: {
      readonly column: number;
      readonly row: number;
      readonly columnSpan: number;
      readonly rowSpan: number;
    };
  }>,
) {
  for (let row = 1; row <= 4; row += 1) {
    for (let column = 1; column <= 4; column += 1) {
      const occupied = panes.some(
        (pane) =>
          pane.visible &&
          column >= pane.grid.column &&
          column < pane.grid.column + pane.grid.columnSpan &&
          row >= pane.grid.row &&
          row < pane.grid.row + pane.grid.rowSpan,
      );
      if (!occupied) return { column, row, columnSpan: 1, rowSpan: 1 };
    }
  }
  return { column: 1, row: 1, columnSpan: 1, rowSpan: 1 };
}
