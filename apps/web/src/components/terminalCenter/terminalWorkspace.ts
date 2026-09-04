import type { DiscoveredLocalServer } from "@t3tools/contracts";

import type { TerminalCenterProjectState } from "./terminalCenterLogic";

export const TERMINAL_WORKSPACE_GRID_SIZE = 4;
export const TERMINAL_WORKSPACE_LAYOUTS = ["grid", "freeform", "split"] as const;
export type TerminalWorkspaceLayout = (typeof TERMINAL_WORKSPACE_LAYOUTS)[number];

export const TERMINAL_WORKSPACE_MODES = ["workbench", "preview", "build_preview"] as const;
export type TerminalWorkspaceMode = (typeof TERMINAL_WORKSPACE_MODES)[number];

export const TERMINAL_WORKSPACE_DOCK_AREAS = ["left", "center", "right"] as const;
export type TerminalWorkspaceDockArea = (typeof TERMINAL_WORKSPACE_DOCK_AREAS)[number];

export const TERMINAL_WORKSPACE_GRID_PRESETS = [
  "auto",
  "1x1",
  "2x1",
  "2x2",
  "3x2",
  "3x3",
  "4x3",
  "4x4",
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
  "diff",
  "file",
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

export interface TerminalWorkspaceDockPlacement {
  readonly area: TerminalWorkspaceDockArea;
  readonly order: number;
  readonly stackId: string | null;
}

export const TERMINAL_WORKSPACE_LAYOUT_PRESETS = [
  "solo",
  "side_by_side",
  "stacked",
  "2x2",
  "main_rail",
  "main_bottom",
  "main_two_rails",
  "zen_tabs",
  "preview_chat",
  "preview_terminal",
  "preview_logs",
  "build_preview",
  "diff_chat",
  "diff_preview",
  "git_diff",
  "test_triage",
  "three_columns",
  "3x3",
  "4x3",
  "4x4",
] as const;
export type TerminalWorkspaceLayoutPreset = (typeof TERMINAL_WORKSPACE_LAYOUT_PRESETS)[number];

export const TERMINAL_WORKSPACE_LAYOUT_PRESET_GROUPS = [
  "essentials",
  "focus",
  "build",
  "review",
  "dense",
] as const;
export type TerminalWorkspaceLayoutPresetGroup =
  (typeof TERMINAL_WORKSPACE_LAYOUT_PRESET_GROUPS)[number];

export interface TerminalWorkspaceLayoutPresetDefinition {
  readonly id: TerminalWorkspaceLayoutPreset;
  readonly group: TerminalWorkspaceLayoutPresetGroup;
  readonly label: string;
  readonly description: string;
}

export const TERMINAL_WORKSPACE_LAYOUT_PRESET_DEFINITIONS = [
  { id: "solo", group: "essentials", label: "Solo", description: "One focused tab stack" },
  {
    id: "side_by_side",
    group: "essentials",
    label: "Side by side",
    description: "Two equal columns",
  },
  { id: "stacked", group: "essentials", label: "Stacked", description: "Two equal rows" },
  { id: "2x2", group: "essentials", label: "2 × 2", description: "Four resizable slots" },
  {
    id: "main_rail",
    group: "focus",
    label: "Main + rail",
    description: "Large main pane with a tool rail",
  },
  {
    id: "main_bottom",
    group: "focus",
    label: "Main + bottom",
    description: "Large main pane with bottom tools",
  },
  {
    id: "main_two_rails",
    group: "focus",
    label: "Main + two rails",
    description: "Large main pane with two side rails",
  },
  {
    id: "zen_tabs",
    group: "focus",
    label: "Zen + tabs",
    description: "One calm surface with every pane tabbed",
  },
  {
    id: "preview_chat",
    group: "build",
    label: "Preview + chat",
    description: "Live app beside the active Chat",
  },
  {
    id: "preview_terminal",
    group: "build",
    label: "Preview + terminal",
    description: "Live app beside an interactive terminal",
  },
  {
    id: "preview_logs",
    group: "build",
    label: "Preview + logs",
    description: "Live app with runtime output",
  },
  {
    id: "build_preview",
    group: "build",
    label: "Build + preview",
    description: "Preview-first main with build rail",
  },
  {
    id: "diff_chat",
    group: "review",
    label: "Diff + chat",
    description: "Review changes beside the agent",
  },
  {
    id: "diff_preview",
    group: "review",
    label: "Diff + preview",
    description: "Compare changes with the running app",
  },
  {
    id: "git_diff",
    group: "review",
    label: "Git + diff",
    description: "Source control beside the working diff",
  },
  {
    id: "test_triage",
    group: "review",
    label: "Test triage",
    description: "Tests, logs, and the active agent",
  },
  {
    id: "three_columns",
    group: "dense",
    label: "3 columns",
    description: "Three equal vertical surfaces",
  },
  { id: "3x3", group: "dense", label: "3 × 3", description: "Nine pane slots" },
  { id: "4x3", group: "dense", label: "4 × 3", description: "Twelve pane slots" },
  { id: "4x4", group: "dense", label: "4 × 4", description: "Sixteen pane slots" },
] as const satisfies ReadonlyArray<TerminalWorkspaceLayoutPresetDefinition>;

export interface TerminalWorkspaceStackNode {
  readonly id: string;
  readonly kind: "stack";
  readonly paneIds: ReadonlyArray<string>;
  readonly activePaneId: string | null;
}

export interface TerminalWorkspaceSplitNode {
  readonly id: string;
  readonly kind: "split";
  readonly direction: "horizontal" | "vertical";
  readonly ratio: number;
  readonly first: TerminalWorkspaceLayoutNode;
  readonly second: TerminalWorkspaceLayoutNode;
}

export type TerminalWorkspaceLayoutNode = TerminalWorkspaceStackNode | TerminalWorkspaceSplitNode;

export type TerminalWorkspacePaneResizeEdge = "left" | "right" | "top" | "bottom";

export interface TerminalWorkspacePaneResizeBinding {
  readonly edge: TerminalWorkspacePaneResizeEdge;
  readonly nodeId: string;
  readonly direction: TerminalWorkspaceSplitNode["direction"];
  readonly paneSide: "first" | "second";
  readonly ratio: number;
}

export type TerminalWorkspaceLayoutDropPlacement = "left" | "right" | "top" | "bottom" | "tab";

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
  /** Durable domain binding. The pane remains a view; Task state stays canonical. */
  readonly taskId: string | null;
  readonly threadId: string | null;
  readonly providerInstanceId: string | null;
  /** Agent panes may expose the same provider as a structured Chat or an interactive CLI. */
  readonly agentSurface?: "chat" | "terminal" | null;
  /** Bidirectional link between the Chat and Terminal views for one provider choice. */
  readonly linkedPaneId?: string | null;
  readonly terminalId: string | null;
  /** Owning terminal thread. Missing values belong to the active Workspace host thread. */
  readonly terminalThreadId?: string | null;
  /** Origin Workspace when a project-managed service is viewed from another Workspace. */
  readonly sourceWorkspaceId?: string | null;
  readonly devServerProfileId: string | null;
  readonly attachedPaneId: string | null;
  readonly command: string | null;
  readonly previewUrl: string | null;
  /** Project-relative path used by ordinary file panes. */
  readonly filePath?: string | null;
  readonly externalServer: TerminalWorkspaceExternalServer | null;
  readonly workspacePath: string;
  readonly grid: TerminalWorkspaceGridPlacement;
  readonly freeform: TerminalWorkspaceFreeformPlacement;
  /** Predictable workbench placement. Legacy canvases are normalized on restore. */
  readonly dock?: TerminalWorkspaceDockPlacement;
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
  readonly mode?: TerminalWorkspaceMode;
  readonly previewPaneId?: string | null;
  readonly workbenchColumnRatios?: readonly [number, number, number];
  /** Optional scrollable Workbench height. Growing it adds room below without compressing panes above. */
  readonly workbenchCanvasHeight?: number;
  readonly buildPreviewRatio?: number;
  readonly buildPreviewRailRatio?: number;
  /** Recursive Workbench composition. Panes remain views; this only stores presentation. */
  readonly layoutTree?: TerminalWorkspaceLayoutNode;
  readonly layoutPreset?: TerminalWorkspaceLayoutPreset;
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
  readonly taskId?: string | null;
  readonly threadId?: string | null;
  readonly providerInstanceId?: string | null;
  readonly agentSurface?: "chat" | "terminal" | null;
  readonly linkedPaneId?: string | null;
  readonly terminalId?: string | null;
  readonly terminalThreadId?: string | null;
  readonly sourceWorkspaceId?: string | null;
  readonly devServerProfileId?: string | null;
  readonly attachedPaneId?: string | null;
  readonly command?: string | null;
  readonly previewUrl?: string | null;
  readonly filePath?: string | null;
  readonly externalServer?: TerminalWorkspaceExternalServer | null;
  readonly grid?: Partial<TerminalWorkspaceGridPlacement>;
  readonly dock?: Partial<TerminalWorkspaceDockPlacement>;
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

export const DEFAULT_TERMINAL_WORKSPACE_COLUMN_RATIOS = [32, 28, 40] as const;

export function defaultDockAreaForPaneType(
  type: TerminalWorkspacePaneType,
): TerminalWorkspaceDockArea {
  if (type === "provider" || type === "thread") return "left";
  if (type === "preview") return "right";
  return "center";
}

export function normalizeDockPlacement(
  value: Partial<TerminalWorkspaceDockPlacement> | undefined,
  type: TerminalWorkspacePaneType,
  fallbackOrder = 0,
): TerminalWorkspaceDockPlacement {
  return {
    area: TERMINAL_WORKSPACE_DOCK_AREAS.includes(value?.area as TerminalWorkspaceDockArea)
      ? (value!.area as TerminalWorkspaceDockArea)
      : defaultDockAreaForPaneType(type),
    order: Number.isFinite(value?.order) ? value!.order! : fallbackOrder,
    stackId: typeof value?.stackId === "string" && value.stackId.length > 0 ? value.stackId : null,
  };
}

export function normalizeWorkbenchColumnRatios(
  value: readonly number[] | undefined,
): readonly [number, number, number] {
  if (!value || value.length !== 3 || value.some((ratio) => !Number.isFinite(ratio))) {
    return DEFAULT_TERMINAL_WORKSPACE_COLUMN_RATIOS;
  }
  const extras = value.map((ratio) => Math.min(46, Math.max(0, ratio - 18)));
  const extraTotal = extras.reduce((sum, ratio) => sum + ratio, 0);
  if (extraTotal === 0) return DEFAULT_TERMINAL_WORKSPACE_COLUMN_RATIOS;
  return extras.map((ratio) => 18 + (ratio / extraTotal) * 46) as [number, number, number];
}

function layoutRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function clampSplitRatio(value: unknown, fallback = 50): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(85, Math.max(15, value))
    : fallback;
}

function stackNode(id: string, paneIds: ReadonlyArray<string> = []): TerminalWorkspaceStackNode {
  return { id, kind: "stack", paneIds, activePaneId: paneIds[0] ?? null };
}

function splitNode(
  id: string,
  direction: "horizontal" | "vertical",
  ratio: number,
  first: TerminalWorkspaceLayoutNode,
  second: TerminalWorkspaceLayoutNode,
): TerminalWorkspaceSplitNode {
  return { id, kind: "split", direction, ratio: clampSplitRatio(ratio), first, second };
}

function combineLayoutNodes(
  nodes: ReadonlyArray<TerminalWorkspaceLayoutNode>,
  direction: "horizontal" | "vertical",
  id: string,
): TerminalWorkspaceLayoutNode | null {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0]!;
  const [first, ...rest] = nodes;
  const second = combineLayoutNodes(rest, direction, `${id}:rest`)!;
  return splitNode(id, direction, 100 / nodes.length, first!, second);
}

function legacyLayoutTree(
  panes: ReadonlyArray<TerminalWorkspacePane>,
  ratios: readonly [number, number, number],
): TerminalWorkspaceLayoutNode {
  const visible = panes.filter((pane) => pane.visible);
  if (visible.length === 0) return stackNode("layout:empty");
  const areaNodes = TERMINAL_WORKSPACE_DOCK_AREAS.flatMap((area) => {
    const byStack = new Map<string, TerminalWorkspacePane[]>();
    for (const [index, pane] of visible.entries()) {
      const dock = normalizeDockPlacement(pane.dock, pane.type, index);
      if (dock.area !== area) continue;
      const key = dock.stackId ?? pane.id;
      const entries = byStack.get(key) ?? [];
      entries.push(pane);
      byStack.set(key, entries);
    }
    const stacks = [...byStack.entries()]
      .map(([id, entries]) => {
        const ordered = [...entries].sort(
          (left, right) =>
            normalizeDockPlacement(left.dock, left.type).order -
            normalizeDockPlacement(right.dock, right.type).order,
        );
        return stackNode(
          `layout:${area}:${id}`,
          ordered.map((pane) => pane.id),
        );
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    const node = combineLayoutNodes(stacks, "vertical", `layout:${area}`);
    return node ? [{ area, node }] : [];
  });
  if (areaNodes.length === 1) return areaNodes[0]!.node;
  const weightByArea = new Map<TerminalWorkspaceDockArea, number>([
    ["left", ratios[0]],
    ["center", ratios[1]],
    ["right", ratios[2]],
  ]);
  const combineAreas = (entries: typeof areaNodes, id: string): TerminalWorkspaceLayoutNode => {
    if (entries.length === 1) return entries[0]!.node;
    const [first, ...rest] = entries;
    const firstWeight = weightByArea.get(first!.area) ?? 1;
    const restWeight = rest.reduce((sum, entry) => sum + (weightByArea.get(entry.area) ?? 1), 0);
    return splitNode(
      id,
      "horizontal",
      (firstWeight / (firstWeight + restWeight)) * 100,
      first!.node,
      combineAreas(rest, `${id}:rest`),
    );
  };
  return combineAreas(areaNodes, "layout:workbench");
}

function appendPaneToFirstLayoutStack(
  node: TerminalWorkspaceLayoutNode,
  paneId: string,
): TerminalWorkspaceLayoutNode {
  let inserted = false;
  const append = (candidate: TerminalWorkspaceLayoutNode): TerminalWorkspaceLayoutNode => {
    if (candidate.kind === "stack") {
      if (inserted) return candidate;
      inserted = true;
      return {
        ...candidate,
        paneIds: [...candidate.paneIds, paneId],
        activePaneId: candidate.activePaneId ?? paneId,
      };
    }
    return { ...candidate, first: append(candidate.first), second: append(candidate.second) };
  };
  return append(node);
}

/**
 * Restore a recursive layout without trusting persisted node contents. Empty
 * stacks are intentional preset slots and therefore survive normalization.
 */
export function normalizeWorkspaceLayoutTree(
  value: unknown,
  panes: ReadonlyArray<TerminalWorkspacePane>,
  workbenchColumnRatios?: readonly number[],
): TerminalWorkspaceLayoutNode {
  const visibleIds = new Set(panes.filter((pane) => pane.visible).map((pane) => pane.id));
  const seen = new Set<string>();
  let generatedId = 0;
  const normalize = (candidate: unknown): TerminalWorkspaceLayoutNode | null => {
    const record = layoutRecord(candidate);
    if (!record) return null;
    const id =
      typeof record.id === "string" && record.id.length > 0
        ? record.id
        : `layout:restored:${generatedId++}`;
    if (record.kind === "stack") {
      const paneIds = Array.isArray(record.paneIds)
        ? record.paneIds.flatMap((paneId) => {
            if (typeof paneId !== "string" || !visibleIds.has(paneId) || seen.has(paneId))
              return [];
            seen.add(paneId);
            return [paneId];
          })
        : [];
      const activePaneId =
        typeof record.activePaneId === "string" && paneIds.includes(record.activePaneId)
          ? record.activePaneId
          : (paneIds[0] ?? null);
      return { id, kind: "stack", paneIds, activePaneId };
    }
    if (record.kind !== "split") return null;
    const first = normalize(record.first);
    const second = normalize(record.second);
    if (!first) return second;
    if (!second) return first;
    return splitNode(
      id,
      record.direction === "vertical" ? "vertical" : "horizontal",
      clampSplitRatio(record.ratio),
      first,
      second,
    );
  };
  let root = normalize(value);
  if (!root) {
    root = legacyLayoutTree(panes, normalizeWorkbenchColumnRatios(workbenchColumnRatios));
    const collect = (node: TerminalWorkspaceLayoutNode) => {
      if (node.kind === "stack") {
        node.paneIds.forEach((paneId) => seen.add(paneId));
        return;
      }
      collect(node.first);
      collect(node.second);
    };
    collect(root);
  }
  for (const pane of panes) {
    if (!pane.visible || seen.has(pane.id)) continue;
    root = appendPaneToFirstLayoutStack(root, pane.id);
    seen.add(pane.id);
  }
  return root;
}

function mapLayoutNode(
  node: TerminalWorkspaceLayoutNode,
  update: (node: TerminalWorkspaceLayoutNode) => TerminalWorkspaceLayoutNode,
): TerminalWorkspaceLayoutNode {
  const next =
    node.kind === "split"
      ? {
          ...node,
          first: mapLayoutNode(node.first, update),
          second: mapLayoutNode(node.second, update),
        }
      : node;
  return update(next);
}

function removePaneFromLayoutNode(
  node: TerminalWorkspaceLayoutNode,
  paneId: string,
): TerminalWorkspaceLayoutNode {
  return mapLayoutNode(node, (candidate) =>
    candidate.kind === "stack" && candidate.paneIds.includes(paneId)
      ? {
          ...candidate,
          paneIds: candidate.paneIds.filter((id) => id !== paneId),
          activePaneId:
            candidate.activePaneId === paneId
              ? (candidate.paneIds.find((id) => id !== paneId) ?? null)
              : candidate.activePaneId,
        }
      : candidate,
  );
}

type RemoveEmptyLayoutSlotResult = {
  readonly node: TerminalWorkspaceLayoutNode | null;
  /** Fraction of the node's previous visual weight that still remains. */
  readonly retainedWeight: number;
  readonly removed: boolean;
};

function removeEmptyLayoutSlotNode(
  node: TerminalWorkspaceLayoutNode,
  nodeId: string,
): RemoveEmptyLayoutSlotResult {
  if (node.kind === "stack") {
    if (node.id === nodeId && node.paneIds.length === 0) {
      return { node: null, retainedWeight: 0, removed: true };
    }
    return { node, retainedWeight: 1, removed: false };
  }

  const first = removeEmptyLayoutSlotNode(node.first, nodeId);
  const second = first.removed
    ? { node: node.second, retainedWeight: 1, removed: false }
    : removeEmptyLayoutSlotNode(node.second, nodeId);
  if (!first.removed && !second.removed) {
    return { node, retainedWeight: 1, removed: false };
  }

  const firstWeight = node.ratio * first.retainedWeight;
  const secondWeight = (100 - node.ratio) * second.retainedWeight;
  const retainedWeight = (firstWeight + secondWeight) / 100;
  if (!first.node) return { node: second.node, retainedWeight, removed: true };
  if (!second.node) return { node: first.node, retainedWeight, removed: true };

  return {
    node: splitNode(
      node.id,
      node.direction,
      (firstWeight / Math.max(Number.EPSILON, firstWeight + secondWeight)) * 100,
      first.node,
      second.node,
    ),
    retainedWeight,
    removed: true,
  };
}

/**
 * Remove one intentional empty preset slot without touching panes or processes.
 * The sibling is promoted and ancestor ratios are renormalized from their prior
 * visual weights, so the remaining slots expand without a lopsided gap.
 */
export function removeEmptyWorkspaceLayoutSlot(
  workspace: TerminalWorkspace,
  nodeId: string,
  now?: string,
): TerminalWorkspace {
  const layoutTree = normalizeWorkspaceLayoutTree(
    workspace.layoutTree,
    workspace.panes,
    workspace.workbenchColumnRatios,
  );
  const result = removeEmptyLayoutSlotNode(layoutTree, nodeId);
  // A workspace always retains one root slot so New Pane remains reachable.
  if (!result.removed || !result.node) return workspace;
  return {
    ...workspace,
    layoutTree: result.node,
    updatedAt: nowIso(now),
  };
}

function insertPaneIntoLayoutNode(
  root: TerminalWorkspaceLayoutNode,
  paneId: string,
  targetPaneId: string | null,
  targetStackId: string | null,
  placement: TerminalWorkspaceLayoutDropPlacement,
  nodeId: string,
): TerminalWorkspaceLayoutNode {
  const withoutPane = removePaneFromLayoutNode(root, paneId);
  let inserted = false;
  const insert = (node: TerminalWorkspaceLayoutNode): TerminalWorkspaceLayoutNode => {
    if (node.kind === "split") {
      return { ...node, first: insert(node.first), second: insert(node.second) };
    }
    const isTarget = targetStackId
      ? node.id === targetStackId
      : targetPaneId
        ? node.paneIds.includes(targetPaneId)
        : node.paneIds.length === 0;
    if (inserted || !isTarget) return node;
    inserted = true;
    if (placement === "tab") {
      return { ...node, paneIds: [...node.paneIds, paneId], activePaneId: paneId };
    }
    const added = stackNode(`${nodeId}:stack`, [paneId]);
    const horizontal = placement === "left" || placement === "right";
    const addedFirst = placement === "left" || placement === "top";
    return splitNode(
      nodeId,
      horizontal ? "horizontal" : "vertical",
      50,
      addedFirst ? added : node,
      addedFirst ? node : added,
    );
  };
  const next = insert(withoutPane);
  if (inserted) return next;
  return splitNode(
    `${nodeId}:fallback`,
    "horizontal",
    70,
    next,
    stackNode(`${nodeId}:stack`, [paneId]),
  );
}

export function movePaneInWorkspaceLayout(
  workspace: TerminalWorkspace,
  paneId: string,
  input: {
    readonly targetPaneId?: string | null;
    readonly targetStackId?: string | null;
    readonly placement: TerminalWorkspaceLayoutDropPlacement;
    readonly nodeId?: string;
  },
  now?: string,
): TerminalWorkspace {
  if (!workspace.panes.some((pane) => pane.id === paneId && pane.visible)) return workspace;
  const timestamp = nowIso(now);
  const root = normalizeWorkspaceLayoutTree(
    workspace.layoutTree,
    workspace.panes,
    workspace.workbenchColumnRatios,
  );
  return {
    ...workspace,
    layoutTree: insertPaneIntoLayoutNode(
      root,
      paneId,
      input.targetPaneId === undefined ? workspace.selectedPaneId : input.targetPaneId,
      input.targetStackId ?? null,
      input.placement,
      input.nodeId ?? `layout:${paneId}:${timestamp}`,
    ),
    selectedPaneId: paneId,
    updatedAt: timestamp,
  };
}

export function activateWorkspaceLayoutPane(
  workspace: TerminalWorkspace,
  paneId: string,
): TerminalWorkspace {
  if (!workspace.panes.some((pane) => pane.id === paneId && pane.visible)) return workspace;
  return {
    ...workspace,
    selectedPaneId: paneId,
    layoutTree: mapLayoutNode(
      normalizeWorkspaceLayoutTree(
        workspace.layoutTree,
        workspace.panes,
        workspace.workbenchColumnRatios,
      ),
      (node) =>
        node.kind === "stack" && node.paneIds.includes(paneId)
          ? { ...node, activePaneId: paneId }
          : node,
    ),
  };
}

/**
 * Switch between linked Chat and Terminal views without changing their shared
 * pane geometry. Selection and the containing tab stack always move together.
 */
export function activateAgentSurfaceView(
  workspace: TerminalWorkspace,
  paneId: string,
  surface: "chat" | "terminal",
  now?: string,
): TerminalWorkspace {
  const source = workspace.panes.find((pane) => pane.id === paneId);
  if (!source) return workspace;
  const target =
    source.agentSurface === surface
      ? source
      : source.linkedPaneId
        ? workspace.panes.find(
            (pane) => pane.id === source.linkedPaneId && pane.agentSurface === surface,
          )
        : null;
  if (!target) return workspace;
  const restored = target.visible ? workspace : restoreWorkspacePane(workspace, target.id, now);
  return activateWorkspaceLayoutPane(restored, target.id);
}

/**
 * Resolve the nearest horizontal and vertical split controlled by a pane. A
 * pane therefore exposes every real shared edge, and nested panes may expose a
 * corner that resizes both axes at once.
 */
export function resolveWorkspacePaneResizeBindings(
  layoutTree: TerminalWorkspaceLayoutNode,
  paneId: string,
): ReadonlyArray<TerminalWorkspacePaneResizeBinding> {
  type ResizeAncestor = {
    readonly node: TerminalWorkspaceSplitNode;
    readonly paneSide: "first" | "second";
  };
  const findPath = (
    node: TerminalWorkspaceLayoutNode,
    ancestors: ReadonlyArray<ResizeAncestor>,
  ): ReadonlyArray<ResizeAncestor> | null => {
    if (node.kind === "stack") {
      return node.paneIds.includes(paneId) ? ancestors : null;
    }
    return (
      findPath(node.first, [...ancestors, { node, paneSide: "first" }]) ??
      findPath(node.second, [...ancestors, { node, paneSide: "second" }])
    );
  };
  const path = findPath(layoutTree, []);
  if (!path) return [];
  const bindings: TerminalWorkspacePaneResizeBinding[] = [];
  const edges = new Set<TerminalWorkspacePaneResizeEdge>();
  for (const ancestor of path.toReversed()) {
    const edge: TerminalWorkspacePaneResizeEdge =
      ancestor.node.direction === "horizontal"
        ? ancestor.paneSide === "first"
          ? "right"
          : "left"
        : ancestor.paneSide === "first"
          ? "bottom"
          : "top";
    // Recursive grids can put a middle cell on both sides of splits in the
    // same axis. Keep the nearest split for each physical edge so every
    // adjacent boundary is draggable without binding one edge twice.
    if (edges.has(edge)) continue;
    edges.add(edge);
    bindings.push({
      edge,
      nodeId: ancestor.node.id,
      direction: ancestor.node.direction,
      paneSide: ancestor.paneSide,
      ratio: ancestor.node.ratio,
    });
  }
  return bindings;
}

export function resizeWorkspaceLayoutSplit(
  workspace: TerminalWorkspace,
  nodeId: string,
  ratio: number,
  now?: string,
): TerminalWorkspace {
  const timestamp = nowIso(now);
  return {
    ...workspace,
    layoutTree: mapLayoutNode(
      normalizeWorkspaceLayoutTree(
        workspace.layoutTree,
        workspace.panes,
        workspace.workbenchColumnRatios,
      ),
      (node) =>
        node.kind === "split" && node.id === nodeId
          ? { ...node, ratio: clampSplitRatio(ratio) }
          : node,
    ),
    updatedAt: timestamp,
  };
}

export function isWorkspacePaneOnBottomEdge(
  layoutTree: TerminalWorkspaceLayoutNode,
  paneId: string,
): boolean {
  const findPath = (
    node: TerminalWorkspaceLayoutNode,
    verticalSides: ReadonlyArray<"first" | "second">,
  ): ReadonlyArray<"first" | "second"> | null => {
    if (node.kind === "stack") {
      return node.paneIds.includes(paneId) ? verticalSides : null;
    }
    const firstPath = findPath(
      node.first,
      node.direction === "vertical" ? [...verticalSides, "first"] : verticalSides,
    );
    if (firstPath) return firstPath;
    return findPath(
      node.second,
      node.direction === "vertical" ? [...verticalSides, "second"] : verticalSides,
    );
  };
  const path = findPath(layoutTree, []);
  return path !== null && path.every((side) => side === "second");
}

/** Extend the scrollable Workbench floor and update the affected vertical splits atomically. */
export function resizeWorkspaceFloor(
  workspace: TerminalWorkspace,
  height: number,
  splitRatios: ReadonlyArray<{ readonly nodeId: string; readonly ratio: number }>,
  now?: string,
): TerminalWorkspace {
  const ratios = new Map(splitRatios.map((entry) => [entry.nodeId, entry.ratio]));
  const timestamp = nowIso(now);
  return {
    ...workspace,
    workbenchCanvasHeight: Math.min(6_000, Math.max(520, height)),
    layoutTree: mapLayoutNode(
      normalizeWorkspaceLayoutTree(
        workspace.layoutTree,
        workspace.panes,
        workspace.workbenchColumnRatios,
      ),
      (node) => {
        if (node.kind !== "split") return node;
        const ratio = ratios.get(node.id);
        return ratio === undefined ? node : { ...node, ratio: clampSplitRatio(ratio) };
      },
    ),
    updatedAt: timestamp,
  };
}

/** Change only the view rendered in a pane slot. Durable Task, thread, provider,
 * service, and layout bindings are intentionally retained for reversible
 * format changes. */
export function setWorkspacePaneFormat(
  workspace: TerminalWorkspace,
  paneId: string,
  input: {
    readonly type: TerminalWorkspacePaneType;
    readonly title?: string;
    readonly terminalId?: string | null;
    readonly terminalThreadId?: string | null;
    readonly previewUrl?: string | null;
    readonly attachedPaneId?: string | null;
    readonly command?: string | null;
  },
  now?: string,
): TerminalWorkspace {
  const timestamp = nowIso(now);
  let changed = false;
  const panes = workspace.panes.map((pane) => {
    if (pane.id !== paneId) return pane;
    changed = true;
    return {
      ...pane,
      type: input.type,
      title: input.title ?? pane.title,
      terminalId: input.terminalId === undefined ? pane.terminalId : input.terminalId,
      terminalThreadId:
        input.terminalThreadId === undefined
          ? (pane.terminalThreadId ?? null)
          : input.terminalThreadId,
      previewUrl: input.previewUrl === undefined ? pane.previewUrl : input.previewUrl,
      attachedPaneId:
        input.attachedPaneId === undefined ? pane.attachedPaneId : input.attachedPaneId,
      command: input.command === undefined ? pane.command : input.command,
      updatedAt: timestamp,
    };
  });
  if (!changed) return workspace;
  return { ...workspace, panes, selectedPaneId: paneId, updatedAt: timestamp };
}

function buildGridLayout(
  paneGroups: ReadonlyArray<ReadonlyArray<string>>,
  columns: number,
  rows: number,
  fillEmpty: boolean,
  id: string,
): TerminalWorkspaceLayoutNode {
  const requestedCells = columns * rows;
  const cellCount = fillEmpty
    ? requestedCells
    : Math.max(1, Math.min(requestedCells, paneGroups.length));
  const cells = Array.from({ length: cellCount }, (_, index) =>
    stackNode(`${id}:cell:${index}`, paneGroups[index] ?? []),
  );
  if (paneGroups.length > cellCount) {
    const last = cells.at(-1)!;
    const paneIdsForLast = [...last.paneIds, ...paneGroups.slice(cellCount).flat()];
    cells[cells.length - 1] = {
      ...last,
      paneIds: paneIdsForLast,
      activePaneId: paneIdsForLast[0]!,
    };
  }
  const rowNodes: TerminalWorkspaceLayoutNode[] = [];
  for (let row = 0; row < rows && row * columns < cells.length; row += 1) {
    const rowNode = combineLayoutNodes(
      cells.slice(row * columns, (row + 1) * columns),
      "horizontal",
      `${id}:row:${row}`,
    );
    if (rowNode) rowNodes.push(rowNode);
  }
  return combineLayoutNodes(rowNodes, "vertical", `${id}:rows`) ?? stackNode(`${id}:empty`);
}

function groupLinkedPresetPanes(
  paneIds: ReadonlyArray<string>,
  panes: ReadonlyArray<TerminalWorkspacePane>,
): ReadonlyArray<ReadonlyArray<string>> {
  const paneById = new Map(panes.map((pane) => [pane.id, pane]));
  const visibleIds = new Set(paneIds);
  const groupedIds = new Set<string>();
  const groups: string[][] = [];
  for (const paneId of paneIds) {
    if (groupedIds.has(paneId)) continue;
    groupedIds.add(paneId);
    const linkedPaneId = paneById.get(paneId)?.linkedPaneId;
    if (linkedPaneId && visibleIds.has(linkedPaneId) && !groupedIds.has(linkedPaneId)) {
      groupedIds.add(linkedPaneId);
      groups.push([paneId, linkedPaneId]);
      continue;
    }
    groups.push([paneId]);
  }
  return groups;
}

function prioritizePresetPaneIds(
  paneIds: ReadonlyArray<string>,
  panes: ReadonlyArray<TerminalWorkspacePane>,
  predicates: ReadonlyArray<(pane: TerminalWorkspacePane) => boolean>,
): ReadonlyArray<string> {
  const remaining = [...paneIds];
  const prioritized: string[] = [];
  for (const predicate of predicates) {
    const index = remaining.findIndex((paneId) => {
      const pane = panes.find((candidate) => candidate.id === paneId);
      return pane ? predicate(pane) : false;
    });
    if (index < 0) continue;
    prioritized.push(remaining[index]!);
    remaining.splice(index, 1);
  }
  return [...prioritized, ...remaining];
}

export function applyWorkspaceLayoutPreset(
  workspace: TerminalWorkspace,
  preset: TerminalWorkspaceLayoutPreset,
  input: {
    readonly primaryPaneId?: string | null;
    readonly mainRatio?: number;
    readonly fillEmpty?: boolean;
    readonly nodeId?: string;
  } = {},
  now?: string,
): TerminalWorkspace {
  const visibleIds = workspace.panes.filter((pane) => pane.visible).map((pane) => pane.id);
  const primaryPaneId = input.primaryPaneId ?? workspace.selectedPaneId;
  let paneIds: ReadonlyArray<string> =
    primaryPaneId && visibleIds.includes(primaryPaneId)
      ? [primaryPaneId, ...visibleIds.filter((paneId) => paneId !== primaryPaneId)]
      : visibleIds;
  const type = (value: TerminalWorkspacePaneType) => (pane: TerminalWorkspacePane) =>
    pane.type === value;
  const agentSurface = (value: "chat" | "terminal") => (pane: TerminalWorkspacePane) =>
    pane.agentSurface === value;
  if (preset === "preview_chat")
    paneIds = prioritizePresetPaneIds(paneIds, workspace.panes, [
      type("preview"),
      agentSurface("chat"),
    ]);
  else if (preset === "preview_terminal")
    paneIds = prioritizePresetPaneIds(paneIds, workspace.panes, [
      type("preview"),
      agentSurface("terminal"),
      type("shell"),
    ]);
  else if (preset === "preview_logs")
    paneIds = prioritizePresetPaneIds(paneIds, workspace.panes, [type("preview"), type("logs")]);
  else if (preset === "build_preview")
    paneIds = prioritizePresetPaneIds(paneIds, workspace.panes, [
      type("preview"),
      agentSurface("chat"),
      type("logs"),
    ]);
  else if (preset === "diff_chat")
    paneIds = prioritizePresetPaneIds(paneIds, workspace.panes, [
      type("diff"),
      agentSurface("chat"),
    ]);
  else if (preset === "diff_preview")
    paneIds = prioritizePresetPaneIds(paneIds, workspace.panes, [type("diff"), type("preview")]);
  else if (preset === "git_diff")
    paneIds = prioritizePresetPaneIds(paneIds, workspace.panes, [type("git"), type("diff")]);
  else if (preset === "test_triage")
    paneIds = prioritizePresetPaneIds(paneIds, workspace.panes, [
      type("tests"),
      type("logs"),
      agentSurface("chat"),
    ]);
  const paneGroups = groupLinkedPresetPanes(paneIds, workspace.panes);
  const fillEmpty = input.fillEmpty ?? true;
  const id = input.nodeId ?? `layout:preset:${preset}:${nowIso(now)}`;
  const mainRatio = clampSplitRatio(input.mainRatio, 68);
  let layoutTree: TerminalWorkspaceLayoutNode;
  if (preset === "solo" || preset === "zen_tabs") {
    layoutTree = stackNode(`${id}:solo`, paneIds);
  } else if (preset === "side_by_side") {
    layoutTree = buildGridLayout(paneGroups, 2, 1, fillEmpty, id);
  } else if (preset === "stacked") {
    layoutTree = buildGridLayout(paneGroups, 1, 2, fillEmpty, id);
  } else if (preset === "2x2") {
    layoutTree = buildGridLayout(paneGroups, 2, 2, fillEmpty, id);
  } else if (preset === "three_columns") {
    layoutTree = buildGridLayout(paneGroups, 3, 1, fillEmpty, id);
  } else if (preset === "3x3") {
    layoutTree = buildGridLayout(paneGroups, 3, 3, fillEmpty, id);
  } else if (preset === "4x3") {
    layoutTree = buildGridLayout(paneGroups, 4, 3, fillEmpty, id);
  } else if (preset === "4x4") {
    layoutTree = buildGridLayout(paneGroups, 4, 4, fillEmpty, id);
  } else if (preset === "main_bottom") {
    const main = stackNode(`${id}:main`, paneGroups[0] ?? []);
    const bottom = buildGridLayout(paneGroups.slice(1), 2, 1, fillEmpty, `${id}:bottom`);
    layoutTree = splitNode(id, "vertical", mainRatio, main, bottom);
  } else if (preset === "main_two_rails") {
    const main = stackNode(`${id}:main`, paneGroups[0] ?? []);
    const rails = buildGridLayout(paneGroups.slice(1), 2, 1, fillEmpty, `${id}:rails`);
    layoutTree = splitNode(id, "horizontal", mainRatio, main, rails);
  } else if (
    preset === "preview_chat" ||
    preset === "preview_terminal" ||
    preset === "preview_logs" ||
    preset === "diff_chat" ||
    preset === "diff_preview" ||
    preset === "git_diff"
  ) {
    const main = stackNode(`${id}:main`, paneGroups[0] ?? []);
    const companion = buildGridLayout(paneGroups.slice(1), 1, 1, fillEmpty, `${id}:companion`);
    layoutTree = splitNode(id, "horizontal", mainRatio, main, companion);
  } else {
    const main = stackNode(`${id}:main`, paneGroups[0] ?? []);
    const rail = buildGridLayout(paneGroups.slice(1), 1, 2, fillEmpty, `${id}:rail`);
    layoutTree = splitNode(id, "horizontal", mainRatio, main, rail);
  }
  const timestamp = nowIso(now);
  return {
    ...workspace,
    layout: "split",
    layoutPreset: preset,
    layoutTree,
    selectedPaneId: paneIds[0] ?? null,
    focusedPaneId: null,
    updatedAt: timestamp,
  };
}

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
    taskId: input.taskId ?? null,
    threadId: input.threadId ?? null,
    providerInstanceId: input.providerInstanceId ?? null,
    agentSurface: input.agentSurface ?? null,
    linkedPaneId: input.linkedPaneId ?? null,
    terminalId: input.terminalId ?? null,
    terminalThreadId: input.terminalThreadId ?? null,
    sourceWorkspaceId: input.sourceWorkspaceId ?? null,
    devServerProfileId: input.devServerProfileId ?? null,
    attachedPaneId: input.attachedPaneId ?? null,
    command: input.command ?? null,
    previewUrl: input.previewUrl ?? null,
    filePath: input.filePath ?? null,
    externalServer: input.externalServer ?? null,
    workspacePath: input.workspacePath,
    grid: normalizeGridPlacement(input.grid),
    freeform: DEFAULT_FREEFORM_PLACEMENT,
    dock: normalizeDockPlacement(input.dock, input.type),
    visible: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const PROVIDER_TERMINAL_BINARY_DEFAULTS: Readonly<Record<string, string>> = {
  codex: "codex",
  claudeAgent: "claude",
  cursor: "cursor-agent",
  grok: "grok",
  antigravity: "agy",
  opencode: "opencode",
};

export interface ProviderTerminalEnvironmentEntry {
  readonly name: string;
  readonly value: string;
  readonly sensitive?: boolean;
  readonly valueRedacted?: boolean;
}

export interface ProviderTerminalLaunchSpec {
  readonly command: string;
  readonly binaryPath: string;
  readonly env: Readonly<Record<string, string>>;
}

function recordValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Readonly<Record<string, unknown>>)[key];
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function shellQuoteExecutable(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/u.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

function shellHomePath(value: string): string {
  if (value === "~") return '"$HOME"';
  if (value.startsWith("~/")) return `"$HOME"/${shellQuoteExecutable(value.slice(2))}`;
  return shellQuoteExecutable(value);
}

/**
 * Resolve the human-facing CLI command for a provider instance without adding
 * provider runtime flags. The terminal remains an ordinary, approval-aware PTY.
 */
export function providerTerminalLaunchSpec(input: {
  readonly driverKind: string;
  readonly legacyBinaryPath?: string | null;
  readonly instanceConfig?: unknown;
  readonly instanceEnvironment?: ReadonlyArray<ProviderTerminalEnvironmentEntry>;
}): ProviderTerminalLaunchSpec | null {
  const fallback = PROVIDER_TERMINAL_BINARY_DEFAULTS[input.driverKind];
  if (!fallback) return null;
  const binaryPath =
    nonEmptyString(recordValue(input.instanceConfig, "binaryPath")) ??
    nonEmptyString(input.legacyBinaryPath) ??
    fallback;
  // Provider TUIs use terminal capability variables to decide whether to emit
  // their palettes. These sessions always render in Nebula's xterm-compatible
  // Ghostty surface, so advertise that capability even when the desktop host
  // inherited a minimal environment.
  const env: Record<string, string> = {
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    TERM_PROGRAM: "Nebula",
    FORCE_COLOR: "1",
  };
  for (const entry of input.instanceEnvironment ?? []) {
    if (entry.sensitive || entry.valueRedacted || !entry.name || !entry.value) continue;
    env[entry.name] = entry.value;
  }
  const homePath = nonEmptyString(recordValue(input.instanceConfig, "homePath"));
  const shadowHomePath = nonEmptyString(recordValue(input.instanceConfig, "shadowHomePath"));
  const commandEnvironment: string[] = [];
  if (input.driverKind === "codex" && (shadowHomePath || homePath)) {
    const path = shadowHomePath ?? homePath!;
    if (path === "~" || path.startsWith("~/")) {
      commandEnvironment.push(`CODEX_HOME=${shellHomePath(path)}`);
    } else {
      env.CODEX_HOME = path;
    }
  }
  if (input.driverKind === "claudeAgent" && homePath) {
    if (homePath === "~" || homePath.startsWith("~/")) {
      commandEnvironment.push(`CLAUDE_CONFIG_DIR=${shellHomePath(homePath)}`);
    } else {
      env.CLAUDE_CONFIG_DIR = homePath;
    }
  }
  const command = [
    ...(commandEnvironment.length > 0 ? ["env", ...commandEnvironment] : []),
    shellQuoteExecutable(binaryPath),
  ].join(" ");
  return { command, binaryPath, env };
}

export interface TerminalWorkspaceProjectService {
  readonly server: DiscoveredLocalServer;
  readonly servers: ReadonlyArray<DiscoveredLocalServer>;
  readonly sourceWorkspaceId: string;
  readonly sourceWorkspaceName: string;
  readonly sourcePaneId: string | null;
  readonly terminalThreadId: string;
  readonly terminalId: string;
  readonly devServerProfileId: string | null;
  readonly workspacePath: string;
}

/** Resolve managed local servers across every Workspace in one project. */
export function resolveTerminalWorkspaceProjectServices(input: {
  readonly projectId: string;
  readonly workspacePath: string;
  readonly workspaces: ReadonlyArray<TerminalWorkspace>;
  readonly servers: ReadonlyArray<DiscoveredLocalServer>;
}): ReadonlyArray<TerminalWorkspaceProjectService> {
  const workspaceByHostThread = new Map(
    input.workspaces.map((workspace) => [
      terminalWorkspaceHostThreadId(input.projectId, workspace.id),
      workspace,
    ]),
  );
  const serviceGroups = new Map<
    string,
    {
      readonly workspace: TerminalWorkspace;
      readonly sourcePane: TerminalWorkspacePane;
      readonly terminalThreadId: string;
      readonly terminalId: string;
      readonly servers: DiscoveredLocalServer[];
    }
  >();
  for (const server of input.servers) {
    if (!server.terminal) continue;
    const workspace = workspaceByHostThread.get(server.terminal.threadId);
    if (!workspace) continue;
    const sourcePane =
      workspace.panes.find(
        (pane) => pane.type === "dev_server" && pane.terminalId === server.terminal?.terminalId,
      ) ?? null;
    if (!sourcePane) continue;
    const key = `${server.terminal.threadId}\u0000${server.terminal.terminalId}`;
    const existing = serviceGroups.get(key);
    if (existing) {
      existing.servers.push(server);
      continue;
    }
    serviceGroups.set(key, {
      workspace,
      sourcePane,
      terminalThreadId: server.terminal.threadId,
      terminalId: server.terminal.terminalId,
      servers: [server],
    });
  }
  return [...serviceGroups.values()].map(
    ({ workspace, sourcePane, terminalThreadId, terminalId, servers }) => {
      let preferredPort: number | null = null;
      try {
        const url = sourcePane.previewUrl ? new URL(sourcePane.previewUrl) : null;
        preferredPort = url
          ? Number.parseInt(url.port || (url.protocol === "https:" ? "443" : "80"), 10)
          : null;
      } catch {
        // A stale profile URL should not hide a healthy discovered endpoint.
      }
      const orderedServers = [...servers].sort((left, right) => {
        if (preferredPort !== null) {
          const distance =
            Math.abs(left.port - preferredPort) - Math.abs(right.port - preferredPort);
          if (distance !== 0) return distance;
        }
        const embeddingRank = (server: DiscoveredLocalServer) =>
          server.embeddingPolicy === "allowed" ? 0 : server.embeddingPolicy === "unknown" ? 1 : 2;
        return embeddingRank(left) - embeddingRank(right) || left.port - right.port;
      });
      const server = orderedServers[0]!;
      return {
        server,
        servers: orderedServers,
        sourceWorkspaceId: workspace.id,
        sourceWorkspaceName: workspace.name,
        sourcePaneId: sourcePane.id,
        terminalThreadId,
        terminalId,
        devServerProfileId: sourcePane.devServerProfileId ?? null,
        workspacePath: sourcePane.workspacePath ?? input.workspacePath,
      };
    },
  );
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
        mode: "workbench",
        previewPaneId: null,
        layoutTree: stackNode(`${workspaceId}:layout:root`, [shellPane.id]),
        layoutPreset: "solo",
        workbenchColumnRatios: DEFAULT_TERMINAL_WORKSPACE_COLUMN_RATIOS,
        buildPreviewRatio: 70,
        buildPreviewRailRatio: 50,
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
      agentSurface: "chat",
      grid: placement ?? {
        column: 1,
        row: TERMINAL_WORKSPACE_GRID_SIZE,
        columnSpan: 1,
        rowSpan: 1,
      },
      now: timestamp,
    });
    providerPanes.push(pane);
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
  "4x4": { columns: 4, rows: 4 },
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

export function movePaneToDock(
  workspace: TerminalWorkspace,
  paneId: string,
  input: {
    readonly area: TerminalWorkspaceDockArea;
    readonly beforePaneId?: string;
    readonly afterPaneId?: string;
    readonly stackWithPaneId?: string;
  },
  now?: string,
): TerminalWorkspace {
  const pane = workspace.panes.find((candidate) => candidate.id === paneId);
  if (!pane) return workspace;
  const timestamp = nowIso(now);
  const peers = workspace.panes
    .filter((candidate) => candidate.visible && candidate.id !== paneId)
    .map((candidate, index) => ({
      pane: candidate,
      dock: normalizeDockPlacement(candidate.dock, candidate.type, index),
    }))
    .filter(({ dock }) => dock.area === input.area)
    .sort((left, right) => left.dock.order - right.dock.order);
  const targetId = input.stackWithPaneId ?? input.beforePaneId ?? input.afterPaneId;
  const target = targetId
    ? (peers.find(({ pane: candidate }) => candidate.id === targetId) ?? null)
    : null;
  const requestedIndex = input.beforePaneId
    ? Math.max(
        0,
        peers.findIndex(({ pane: candidate }) => candidate.id === input.beforePaneId),
      )
    : input.afterPaneId
      ? Math.max(
          0,
          peers.findIndex(({ pane: candidate }) => candidate.id === input.afterPaneId) + 1,
        )
      : peers.length;
  const orderedIds = peers.map(({ pane: candidate }) => candidate.id);
  orderedIds.splice(requestedIndex, 0, paneId);
  const stackId = input.stackWithPaneId
    ? (target?.dock.stackId ?? target?.pane.id ?? input.stackWithPaneId)
    : null;
  return {
    ...workspace,
    panes: workspace.panes.map((candidate) => {
      if (candidate.id === paneId) {
        return {
          ...candidate,
          dock: { area: input.area, order: orderedIds.indexOf(candidate.id), stackId },
          updatedAt: timestamp,
        };
      }
      const current = normalizeDockPlacement(candidate.dock, candidate.type);
      const order = orderedIds.indexOf(candidate.id);
      if (current.area !== input.area || order < 0) return candidate;
      return {
        ...candidate,
        dock: {
          ...current,
          order,
          ...(input.stackWithPaneId && candidate.id === target?.pane.id
            ? { stackId: stackId ?? candidate.id }
            : {}),
        },
        updatedAt: timestamp,
      };
    }),
    selectedPaneId: paneId,
    updatedAt: timestamp,
  };
}

/** Keep the structured Chat and interactive Terminal views together as one tab stack. */
export function linkAgentPaneViews(
  workspace: TerminalWorkspace,
  sourcePaneId: string,
  linkedPaneId: string,
  now?: string,
): TerminalWorkspace {
  const source = workspace.panes.find((pane) => pane.id === sourcePaneId);
  const linked = workspace.panes.find((pane) => pane.id === linkedPaneId);
  if (!source || !linked || source.id === linked.id) return workspace;
  const timestamp = nowIso(now);
  const sourceDock = normalizeDockPlacement(source.dock, source.type);
  const stackId = sourceDock.stackId ?? `agent:${source.id}`;
  const linkedWorkspace = {
    ...workspace,
    panes: workspace.panes.map((pane) => {
      if (pane.id === source.id) {
        return {
          ...pane,
          linkedPaneId: linked.id,
          dock: { ...sourceDock, stackId },
          updatedAt: timestamp,
        };
      }
      if (pane.id === linked.id) {
        return {
          ...pane,
          linkedPaneId: source.id,
          dock: { ...sourceDock, stackId },
          updatedAt: timestamp,
        };
      }
      return pane;
    }),
    selectedPaneId: linked.id,
    updatedAt: timestamp,
  };
  return movePaneInWorkspaceLayout(
    linkedWorkspace,
    linked.id,
    {
      targetPaneId: source.id,
      placement: "tab",
      nodeId: `layout:agent:${source.id}:${linked.id}`,
    },
    timestamp,
  );
}

export function hideWorkspacePane(
  workspace: TerminalWorkspace,
  paneId: string,
  now?: string,
): TerminalWorkspace {
  const timestamp = nowIso(now);
  return {
    ...workspace,
    layoutTree: removePaneFromLayoutNode(
      normalizeWorkspaceLayoutTree(
        workspace.layoutTree,
        workspace.panes,
        workspace.workbenchColumnRatios,
      ),
      paneId,
    ),
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
  const layoutTree = [...removedPaneIds].reduce(
    (tree, removedPaneId) => removePaneFromLayoutNode(tree, removedPaneId),
    normalizeWorkspaceLayoutTree(
      workspace.layoutTree,
      workspace.panes,
      workspace.workbenchColumnRatios,
    ),
  );
  return {
    ...workspace,
    layoutTree,
    panes: workspace.panes
      .filter((pane) => !removedPaneIds.has(pane.id))
      .map((pane) =>
        pane.linkedPaneId && removedPaneIds.has(pane.linkedPaneId)
          ? { ...pane, linkedPaneId: null, updatedAt: timestamp }
          : pane,
      ),
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
  const restoredWorkspace = {
    ...workspace,
    panes: workspace.panes.map((pane) =>
      pane.id === paneId ? { ...pane, visible: true, grid: placement, updatedAt: timestamp } : pane,
    ),
    selectedPaneId: paneId,
    updatedAt: timestamp,
  };
  return movePaneInWorkspaceLayout(
    restoredWorkspace,
    paneId,
    { targetPaneId: workspace.selectedPaneId, placement: "tab" },
    timestamp,
  );
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
