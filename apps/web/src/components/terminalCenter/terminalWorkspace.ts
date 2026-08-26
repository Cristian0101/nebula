import type { TerminalCenterProjectState } from "./terminalCenterLogic";

export const TERMINAL_WORKSPACE_GRID_SIZE = 4;
export const TERMINAL_WORKSPACE_LAYOUTS = ["grid", "freeform", "split"] as const;
export type TerminalWorkspaceLayout = (typeof TERMINAL_WORKSPACE_LAYOUTS)[number];

export const TERMINAL_WORKSPACE_GRID_PRESETS = [
  "auto",
  "1x1",
  "2x1",
  "2x2",
  "3x2",
  "3x3",
  "4x3",
] as const;
export type TerminalWorkspaceGridPreset = (typeof TERMINAL_WORKSPACE_GRID_PRESETS)[number];

export interface TerminalWorkspaceGridDimensions {
  readonly columns: number;
  readonly rows: number;
}

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

export interface TerminalWorkspaceExternalServer {
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly pid: number | null;
  readonly processName: string | null;
  readonly attachedAt: string;
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
  readonly externalServer: TerminalWorkspaceExternalServer | null;
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
  readonly gridPreset: TerminalWorkspaceGridPreset;
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
  readonly externalServer?: TerminalWorkspaceExternalServer | null;
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
    externalServer: input.externalServer ?? null,
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
        gridPreset: "auto",
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
  const providerPanes: TerminalWorkspacePane[] = [];
  for (const threadId of threadIds) {
    const placement = firstAvailableGridPlacement(providerPanes);
    const pane = createTerminalWorkspacePane({
      id: `${workspace.id}:thread:${threadId}`,
      type: "thread",
      title: "Existing Thread",
      workspacePath: input.workspacePath,
      threadId,
      grid: placement ?? {
        column: 1,
        row: TERMINAL_WORKSPACE_GRID_SIZE,
        columnSpan: 1,
        rowSpan: 1,
      },
      now: timestamp,
    });
    providerPanes.push(placement ? pane : { ...pane, visible: false });
  }
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

const GRID_PRESET_DIMENSIONS: Record<
  Exclude<TerminalWorkspaceGridPreset, "auto">,
  TerminalWorkspaceGridDimensions
> = {
  "1x1": { columns: 1, rows: 1 },
  "2x1": { columns: 2, rows: 1 },
  "2x2": { columns: 2, rows: 2 },
  "3x2": { columns: 3, rows: 2 },
  "3x3": { columns: 3, rows: 3 },
  "4x3": { columns: 4, rows: 3 },
};

function automaticGridDimensions(
  panes: ReadonlyArray<TerminalWorkspacePane>,
): TerminalWorkspaceGridDimensions {
  const visible = panes.filter((pane) => pane.visible);
  const count = visible.length;
  const base =
    count <= 1
      ? { columns: 1, rows: 1 }
      : count <= 2
        ? { columns: 2, rows: 1 }
        : count <= 4
          ? { columns: 2, rows: 2 }
          : count <= 6
            ? { columns: 3, rows: 2 }
            : count <= 9
              ? { columns: 3, rows: 3 }
              : count <= 12
                ? { columns: 4, rows: 3 }
                : { columns: 4, rows: 4 };
  return {
    columns: Math.min(
      TERMINAL_WORKSPACE_GRID_SIZE,
      Math.max(base.columns, ...visible.map((pane) => pane.grid.column + pane.grid.columnSpan - 1)),
    ),
    rows: Math.min(
      TERMINAL_WORKSPACE_GRID_SIZE,
      Math.max(base.rows, ...visible.map((pane) => pane.grid.row + pane.grid.rowSpan - 1)),
    ),
  };
}

export function terminalWorkspaceGridDimensions(
  workspace: Pick<TerminalWorkspace, "gridPreset" | "panes">,
): TerminalWorkspaceGridDimensions {
  return workspace.gridPreset === "auto"
    ? automaticGridDimensions(workspace.panes)
    : GRID_PRESET_DIMENSIONS[workspace.gridPreset];
}

function placementFitsDimensions(
  placement: TerminalWorkspaceGridPlacement,
  dimensions: TerminalWorkspaceGridDimensions,
): boolean {
  return (
    placement.column >= 1 &&
    placement.row >= 1 &&
    placement.column + placement.columnSpan - 1 <= dimensions.columns &&
    placement.row + placement.rowSpan - 1 <= dimensions.rows
  );
}

function placementIsAvailable(
  panes: ReadonlyArray<TerminalWorkspacePane>,
  placement: TerminalWorkspaceGridPlacement,
  ignorePaneId?: string,
): boolean {
  const occupied = occupiedCells(panes, ignorePaneId);
  for (let row = placement.row; row < placement.row + placement.rowSpan; row += 1) {
    for (
      let column = placement.column;
      column < placement.column + placement.columnSpan;
      column += 1
    ) {
      if (occupied.has(`${column}:${row}`)) return false;
    }
  }
  return true;
}

export function firstAvailableGridPlacement(
  panes: ReadonlyArray<TerminalWorkspacePane>,
  preferred?: { readonly column: number; readonly row: number },
  dimensions: TerminalWorkspaceGridDimensions = {
    columns: TERMINAL_WORKSPACE_GRID_SIZE,
    rows: TERMINAL_WORKSPACE_GRID_SIZE,
  },
): TerminalWorkspaceGridPlacement | null {
  const occupied = occupiedCells(panes);
  const candidates = preferred
    ? [preferred]
    : Array.from({ length: dimensions.columns * dimensions.rows }, (_, index) => ({
        column: (index % dimensions.columns) + 1,
        row: Math.floor(index / dimensions.columns) + 1,
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
  if (!placementFitsDimensions(normalized, terminalWorkspaceGridDimensions(workspace)))
    return workspace;
  if (!placementIsAvailable(workspace.panes, normalized, paneId)) return workspace;
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

export function removeWorkspacePane(
  workspace: TerminalWorkspace,
  paneId: string,
  now?: string,
): TerminalWorkspace {
  if (!workspace.panes.some((pane) => pane.id === paneId)) return workspace;
  const removedPaneIds = new Set([
    paneId,
    ...workspace.panes.filter((pane) => pane.attachedPaneId === paneId).map((pane) => pane.id),
  ]);
  const timestamp = nowIso(now);
  return {
    ...workspace,
    panes: workspace.panes.filter((pane) => !removedPaneIds.has(pane.id)),
    selectedPaneId:
      workspace.selectedPaneId && removedPaneIds.has(workspace.selectedPaneId)
        ? null
        : workspace.selectedPaneId,
    focusedPaneId:
      workspace.focusedPaneId && removedPaneIds.has(workspace.focusedPaneId)
        ? null
        : workspace.focusedPaneId,
    updatedAt: timestamp,
  };
}

export function restoreWorkspacePane(
  workspace: TerminalWorkspace,
  paneId: string,
  now?: string,
): TerminalWorkspace {
  const pane = workspace.panes.find((candidate) => candidate.id === paneId);
  if (!pane) return workspace;
  if (pane.visible) {
    return workspace.selectedPaneId === paneId
      ? workspace
      : { ...workspace, selectedPaneId: paneId };
  }
  const timestamp = nowIso(now);
  const currentDimensions = terminalWorkspaceGridDimensions(workspace);
  const dimensions =
    workspace.gridPreset === "auto"
      ? {
          columns: Math.min(
            TERMINAL_WORKSPACE_GRID_SIZE,
            Math.max(currentDimensions.columns, pane.grid.column + pane.grid.columnSpan - 1),
          ),
          rows: Math.min(
            TERMINAL_WORKSPACE_GRID_SIZE,
            Math.max(currentDimensions.rows, pane.grid.row + pane.grid.rowSpan - 1),
          ),
        }
      : currentDimensions;
  const placement =
    placementFitsDimensions(pane.grid, dimensions) &&
    placementIsAvailable(workspace.panes, pane.grid, pane.id)
      ? pane.grid
      : firstAvailableGridPlacement(workspace.panes, undefined, dimensions);
  if (!placement) return workspace;
  return {
    ...workspace,
    panes: workspace.panes.map((pane) =>
      pane.id === paneId ? { ...pane, visible: true, grid: placement, updatedAt: timestamp } : pane,
    ),
    selectedPaneId: paneId,
    updatedAt: timestamp,
  };
}

export function reflowWorkspaceGrid(
  workspace: TerminalWorkspace,
  gridPreset: TerminalWorkspaceGridPreset,
  now?: string,
): TerminalWorkspace {
  const visiblePanes = workspace.panes.filter((pane) => pane.visible);
  const dimensions =
    gridPreset === "auto"
      ? automaticGridDimensions(visiblePanes)
      : GRID_PRESET_DIMENSIONS[gridPreset];
  if (visiblePanes.length > dimensions.columns * dimensions.rows) return workspace;

  const placed: TerminalWorkspacePane[] = [];
  const placements = new Map<string, TerminalWorkspaceGridPlacement>();
  for (const [index, pane] of visiblePanes.entries()) {
    const preferred = {
      column: Math.min(dimensions.columns, pane.grid.column),
      row: Math.min(dimensions.rows, pane.grid.row),
      columnSpan: Math.min(dimensions.columns, pane.grid.columnSpan),
      rowSpan: Math.min(dimensions.rows, pane.grid.rowSpan),
    };
    const remainingPaneCount = visiblePanes.length - index - 1;
    const preferredCellCount = preferred.columnSpan * preferred.rowSpan;
    const hasRoomForRemainingPanes =
      dimensions.columns * dimensions.rows - occupiedCells(placed).size - preferredCellCount >=
      remainingPaneCount;
    const candidate =
      hasRoomForRemainingPanes &&
      placementFitsDimensions(preferred, dimensions) &&
      placementIsAvailable(placed, preferred)
        ? preferred
        : firstAvailableGridPlacement(placed, undefined, dimensions);
    if (!candidate) return workspace;
    placements.set(pane.id, candidate);
    placed.push({ ...pane, grid: candidate });
  }

  const timestamp = nowIso(now);
  return {
    ...workspace,
    gridPreset,
    panes: workspace.panes.map((pane) => {
      const grid = placements.get(pane.id);
      return grid ? { ...pane, grid, updatedAt: timestamp } : pane;
    }),
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
