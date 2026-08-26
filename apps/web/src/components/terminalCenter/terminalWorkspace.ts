import type { TerminalCenterProjectState } from "./terminalCenterLogic";

export const TERMINAL_WORKSPACE_GRID_SIZE = 4;
export const TERMINAL_WORKSPACE_LAYOUTS = ["grid", "freeform", "split"] as const;
export type TerminalWorkspaceLayout = (typeof TERMINAL_WORKSPACE_LAYOUTS)[number];

export const TERMINAL_WORKSPACE_PANE_TYPES = [
  "shell",
  "provider",
  "dev_server",
  "preview",
  "tests",
  "logs",
  "git",
  "thread",
] as const;
export type TerminalWorkspacePaneType = (typeof TERMINAL_WORKSPACE_PANE_TYPES)[number];

export interface TerminalWorkspaceGridPlacement {
  readonly column: number;
  readonly row: number;
  readonly columnSpan: number;
  readonly rowSpan: number;
}

export interface TerminalWorkspaceFreeformPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly z: number;
}

export interface TerminalWorkspacePane {
  readonly id: string;
  readonly type: TerminalWorkspacePaneType;
  readonly title: string;
  readonly threadId: string | null;
  readonly providerInstanceId: string | null;
  readonly terminalId: string | null;
  readonly devServerProfileId: string | null;
  readonly attachedPaneId: string | null;
  readonly command: string | null;
  readonly previewUrl: string | null;
  readonly workspacePath: string;
  readonly grid: TerminalWorkspaceGridPlacement;
  readonly freeform: TerminalWorkspaceFreeformPlacement;
  readonly visible: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TerminalWorkspace {
  readonly id: string;
  readonly name: string;
  readonly layout: TerminalWorkspaceLayout;
  readonly splitDirection: "horizontal" | "vertical";
  readonly panes: ReadonlyArray<TerminalWorkspacePane>;
  readonly selectedPaneId: string | null;
  readonly focusedPaneId: string | null;
  readonly viewport: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TerminalWorkspaceProjectState {
  readonly initialized: true;
  readonly activeWorkspaceId: string;
  readonly workspaces: ReadonlyArray<TerminalWorkspace>;
}

export interface CreateTerminalWorkspacePaneInput {
  readonly id: string;
  readonly type: TerminalWorkspacePaneType;
  readonly title: string;
  readonly workspacePath: string;
  readonly threadId?: string | null;
  readonly providerInstanceId?: string | null;
  readonly terminalId?: string | null;
  readonly devServerProfileId?: string | null;
  readonly attachedPaneId?: string | null;
  readonly command?: string | null;
  readonly previewUrl?: string | null;
  readonly grid?: Partial<TerminalWorkspaceGridPlacement>;
  readonly now?: string;
}

export function terminalWorkspaceHostThreadId(projectId: string, workspaceId: string): string {
  const value = `${projectId}:${workspaceId}`;
  let first = 2_166_136_261;
  let second = 2_654_435_761;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16_777_619) >>> 0;
    second = Math.imul(second ^ code, 2_246_822_519) >>> 0;
  }
  return `terminal-workspace-${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

const DEFAULT_GRID_PLACEMENT: TerminalWorkspaceGridPlacement = {
  column: 1,
  row: 1,
  columnSpan: 2,
  rowSpan: 2,
};

const DEFAULT_FREEFORM_PLACEMENT: TerminalWorkspaceFreeformPlacement = {
  x: 24,
  y: 24,
  width: 560,
  height: 360,
  z: 1,
};

function nowIso(now?: string): string {
  return now ?? new Date().toISOString();
}

function clampGrid(value: number): number {
  return Math.min(TERMINAL_WORKSPACE_GRID_SIZE, Math.max(1, Math.round(value)));
}

export function normalizeGridPlacement(
  placement: Partial<TerminalWorkspaceGridPlacement> | undefined,
): TerminalWorkspaceGridPlacement {
  const column = clampGrid(placement?.column ?? DEFAULT_GRID_PLACEMENT.column);
  const row = clampGrid(placement?.row ?? DEFAULT_GRID_PLACEMENT.row);
  return {
    column,
    row,
    columnSpan: Math.min(
      TERMINAL_WORKSPACE_GRID_SIZE - column + 1,
      clampGrid(placement?.columnSpan ?? DEFAULT_GRID_PLACEMENT.columnSpan),
    ),
    rowSpan: Math.min(
      TERMINAL_WORKSPACE_GRID_SIZE - row + 1,
      clampGrid(placement?.rowSpan ?? DEFAULT_GRID_PLACEMENT.rowSpan),
    ),
  };
}

export function createTerminalWorkspacePane(
  input: CreateTerminalWorkspacePaneInput,
): TerminalWorkspacePane {
  const timestamp = nowIso(input.now);
  return {
    id: input.id,
    type: input.type,
    title: input.title,
    threadId: input.threadId ?? null,
    providerInstanceId: input.providerInstanceId ?? null,
    terminalId: input.terminalId ?? null,
    devServerProfileId: input.devServerProfileId ?? null,
    attachedPaneId: input.attachedPaneId ?? null,
    command: input.command ?? null,
    previewUrl: input.previewUrl ?? null,
    workspacePath: input.workspacePath,
    grid: normalizeGridPlacement(input.grid),
    freeform: DEFAULT_FREEFORM_PLACEMENT,
    visible: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDefaultTerminalWorkspaceProjectState(input: {
  readonly projectId: string;
  readonly workspacePath: string;
  readonly now?: string;
}): TerminalWorkspaceProjectState {
  const timestamp = nowIso(input.now);
  const workspaceId = `${input.projectId}:terminal-workspace:default`;
  const shellPane = createTerminalWorkspacePane({
    id: `${workspaceId}:shell`,
    type: "shell",
    title: "Shell",
    workspacePath: input.workspacePath,
    terminalId: "workspace-shell-1",
    grid: { column: 1, row: 1, columnSpan: 2, rowSpan: 2 },
    now: timestamp,
  });
  return {
    initialized: true,
    activeWorkspaceId: workspaceId,
    workspaces: [
      {
        id: workspaceId,
        name: "Default",
        layout: "grid",
        splitDirection: "horizontal",
        panes: [shellPane],
        selectedPaneId: shellPane.id,
        focusedPaneId: null,
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

export function migrateTerminalCanvasToWorkspace(input: {
  readonly projectId: string;
  readonly workspacePath: string;
  readonly legacy: TerminalCenterProjectState | undefined;
  readonly now?: string;
}): TerminalWorkspaceProjectState {
  const base = createDefaultTerminalWorkspaceProjectState(input);
  const workspace = base.workspaces[0]!;
  const threadIds = input.legacy?.visibleThreadIds ?? [];
  if (threadIds.length === 0) return base;
  const timestamp = nowIso(input.now);
  const providerPanes = threadIds.map((threadId, index) =>
    createTerminalWorkspacePane({
      id: `${workspace.id}:thread:${threadId}`,
      type: "thread",
      title: "Existing Thread",
      workspacePath: input.workspacePath,
      threadId,
      grid: {
        column: (index % TERMINAL_WORKSPACE_GRID_SIZE) + 1,
        row: Math.min(TERMINAL_WORKSPACE_GRID_SIZE, Math.floor(index / 4) + 1),
        columnSpan: 1,
        rowSpan: 1,
      },
      now: timestamp,
    }),
  );
  return {
    ...base,
    workspaces: [
      {
        ...workspace,
        panes: providerPanes,
        selectedPaneId: providerPanes[0]?.id ?? null,
        updatedAt: timestamp,
      },
    ],
  };
}

function occupiedCells(
  panes: ReadonlyArray<TerminalWorkspacePane>,
  ignorePaneId?: string,
): Set<string> {
  const occupied = new Set<string>();
  for (const pane of panes) {
    if (!pane.visible || pane.id === ignorePaneId) continue;
    for (let row = pane.grid.row; row < pane.grid.row + pane.grid.rowSpan; row += 1) {
      for (
        let column = pane.grid.column;
        column < pane.grid.column + pane.grid.columnSpan;
        column += 1
      ) {
        occupied.add(`${column}:${row}`);
      }
    }
  }
  return occupied;
}

export function firstAvailableGridPlacement(
  panes: ReadonlyArray<TerminalWorkspacePane>,
  preferred?: { readonly column: number; readonly row: number },
): TerminalWorkspaceGridPlacement | null {
  const occupied = occupiedCells(panes);
  const candidates = preferred
    ? [preferred]
    : Array.from({ length: TERMINAL_WORKSPACE_GRID_SIZE ** 2 }, (_, index) => ({
        column: (index % TERMINAL_WORKSPACE_GRID_SIZE) + 1,
        row: Math.floor(index / TERMINAL_WORKSPACE_GRID_SIZE) + 1,
      }));
  for (const candidate of candidates) {
    if (!occupied.has(`${candidate.column}:${candidate.row}`)) {
      return { ...candidate, columnSpan: 1, rowSpan: 1 };
    }
  }
  return null;
}

export function movePaneToGrid(
  workspace: TerminalWorkspace,
  paneId: string,
  placement: TerminalWorkspaceGridPlacement,
  now?: string,
): TerminalWorkspace {
  const normalized = normalizeGridPlacement(placement);
  const occupied = occupiedCells(workspace.panes, paneId);
  for (let row = normalized.row; row < normalized.row + normalized.rowSpan; row += 1) {
    for (
      let column = normalized.column;
      column < normalized.column + normalized.columnSpan;
      column += 1
    ) {
      if (occupied.has(`${column}:${row}`)) return workspace;
    }
  }
  const timestamp = nowIso(now);
  return {
    ...workspace,
    panes: workspace.panes.map((pane) =>
      pane.id === paneId ? { ...pane, grid: normalized, updatedAt: timestamp } : pane,
    ),
    updatedAt: timestamp,
  };
}

export function hideWorkspacePane(
  workspace: TerminalWorkspace,
  paneId: string,
  now?: string,
): TerminalWorkspace {
  const timestamp = nowIso(now);
  return {
    ...workspace,
    panes: workspace.panes.map((pane) =>
      pane.id === paneId ? { ...pane, visible: false, updatedAt: timestamp } : pane,
    ),
    selectedPaneId: workspace.selectedPaneId === paneId ? null : workspace.selectedPaneId,
    focusedPaneId: workspace.focusedPaneId === paneId ? null : workspace.focusedPaneId,
    updatedAt: timestamp,
  };
}

export function restoreWorkspacePane(
  workspace: TerminalWorkspace,
  paneId: string,
  now?: string,
): TerminalWorkspace {
  const timestamp = nowIso(now);
  const placement = firstAvailableGridPlacement(workspace.panes);
  return {
    ...workspace,
    panes: workspace.panes.map((pane) =>
      pane.id === paneId
        ? { ...pane, visible: true, grid: placement ?? pane.grid, updatedAt: timestamp }
        : pane,
    ),
    selectedPaneId: paneId,
    updatedAt: timestamp,
  };
}

export function updateWorkspace(
  state: TerminalWorkspaceProjectState,
  workspaceId: string,
  update: (workspace: TerminalWorkspace) => TerminalWorkspace,
): TerminalWorkspaceProjectState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId ? update(workspace) : workspace,
    ),
  };
}
