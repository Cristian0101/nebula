import type {
  Mission,
  ModelSelection,
  OrchestrationTask,
  OrchestrationThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import { computeMissionPlan } from "@t3tools/shared/missionGraph";

export const TERMINAL_CENTER_LAYOUTS = [
  "grid",
  "provider-columns",
  "status-lanes",
  "mission-flow",
  "radial",
  "compact",
  "freeform",
] as const;

export type TerminalCenterLayout = (typeof TERMINAL_CENTER_LAYOUTS)[number];
export type TerminalCenterWorkspaceMode = "current" | "isolated";
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}
export interface CanvasViewport extends CanvasPoint {
  readonly zoom: number;
}
export interface TerminalCenterQuickLaunchProfile {
  readonly workspaceMode: TerminalCenterWorkspaceMode;
  readonly isolatedWritePattern: string;
  readonly modelByProvider: Readonly<Record<string, string>>;
}
export interface TerminalCenterProjectState {
  readonly visibleThreadIds: ReadonlyArray<string>;
  readonly positions: Readonly<Record<string, CanvasPoint>>;
  readonly freeformPositions: Readonly<Record<string, CanvasPoint>>;
  readonly layout: TerminalCenterLayout;
  readonly viewport: CanvasViewport;
  readonly selectedThreadId: string | null;
  readonly quickLaunch: TerminalCenterQuickLaunchProfile | null;
}

export const DEFAULT_TERMINAL_CENTER_STATE: TerminalCenterProjectState = {
  visibleThreadIds: [],
  positions: {},
  freeformPositions: {},
  layout: "freeform",
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedThreadId: null,
  quickLaunch: null,
};

export interface TerminalCanvasNode {
  readonly threadId: ThreadId;
  readonly providerId: string;
  readonly status: "ready" | "working" | "attention";
  readonly taskId: string | null;
  readonly missionId: string | null;
}

const NODE_WIDTH = 272;
const NODE_HEIGHT = 164;

function grid(
  nodes: ReadonlyArray<TerminalCanvasNode>,
  compact: boolean,
): Record<string, CanvasPoint> {
  const columns = compact
    ? Math.max(1, Math.ceil(Math.sqrt(nodes.length * 1.6)))
    : Math.min(3, Math.max(1, nodes.length));
  const xGap = compact ? 220 : NODE_WIDTH + 28;
  const yGap = compact ? 124 : NODE_HEIGHT + 28;
  return Object.fromEntries(
    nodes.map((node, index) => [
      node.threadId,
      {
        x: 36 + (index % columns) * xGap,
        y: 42 + Math.floor(index / columns) * yGap,
      },
    ]),
  );
}

function columns(
  nodes: ReadonlyArray<TerminalCanvasNode>,
  keyFor: (node: TerminalCanvasNode) => string,
): Record<string, CanvasPoint> {
  const keys = [...new Set(nodes.map(keyFor))].sort();
  const counts = new Map<string, number>();
  return Object.fromEntries(
    nodes.map((node) => {
      const key = keyFor(node);
      const row = counts.get(key) ?? 0;
      counts.set(key, row + 1);
      return [
        node.threadId,
        { x: 36 + keys.indexOf(key) * (NODE_WIDTH + 36), y: 76 + row * (NODE_HEIGHT + 24) },
      ];
    }),
  );
}

function missionFlow(
  nodes: ReadonlyArray<TerminalCanvasNode>,
  tasks: ReadonlyArray<OrchestrationTask>,
  missions: ReadonlyArray<Mission>,
): Record<string, CanvasPoint> {
  const result: Record<string, CanvasPoint> = {};
  let missionOffset = 0;
  for (const mission of missions) {
    const plan = computeMissionPlan({ mission, tasks, threads: [] });
    for (const wave of plan.waves) {
      wave.taskIds.forEach((taskId, index) => {
        const node = nodes.find((candidate) => candidate.taskId === taskId);
        if (node)
          result[node.threadId] = {
            x: 36 + (wave.number - 1) * (NODE_WIDTH + 42),
            y: missionOffset + 64 + index * (NODE_HEIGHT + 24),
          };
      });
    }
    missionOffset +=
      Math.max(1, ...plan.waves.map((wave) => wave.taskIds.length)) * (NODE_HEIGHT + 24) + 72;
  }
  const unplaced = nodes.filter((node) => result[node.threadId] === undefined);
  for (const [index, node] of unplaced.entries()) {
    result[node.threadId] = { x: 36 + index * (NODE_WIDTH + 28), y: missionOffset + 42 };
  }
  return result;
}

export function arrangeTerminalNodes(input: {
  readonly nodes: ReadonlyArray<TerminalCanvasNode>;
  readonly layout: TerminalCenterLayout;
  readonly selectedThreadId?: string | null;
  readonly currentPositions?: Readonly<Record<string, CanvasPoint>>;
  readonly tasks?: ReadonlyArray<OrchestrationTask>;
  readonly missions?: ReadonlyArray<Mission>;
}): Record<string, CanvasPoint> {
  const { nodes, layout } = input;
  if (layout === "freeform") return { ...input.currentPositions };
  if (layout === "grid") return grid(nodes, false);
  if (layout === "compact") return grid(nodes, true);
  if (layout === "provider-columns") return columns(nodes, (node) => node.providerId);
  if (layout === "status-lanes")
    return columns(
      nodes,
      (node) => ({ ready: "1-ready", working: "2-working", attention: "3-attention" })[node.status],
    );
  if (layout === "mission-flow") return missionFlow(nodes, input.tasks ?? [], input.missions ?? []);
  const selectedIndex = Math.max(
    0,
    nodes.findIndex((node) => node.threadId === input.selectedThreadId),
  );
  const selected = nodes[selectedIndex];
  const others = nodes.filter((node) => node !== selected);
  const result: Record<string, CanvasPoint> = {};
  if (selected) result[selected.threadId] = { x: 420, y: 270 };
  const radius = Math.max(230, others.length * 42);
  others.forEach((node, index) => {
    const angle = (index / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2;
    result[node.threadId] = {
      x: 420 + Math.cos(angle) * radius,
      y: 270 + Math.sin(angle) * radius,
    };
  });
  return result;
}

export function deriveTerminalNodeStatus(
  thread: OrchestrationThreadShell,
): TerminalCanvasNode["status"] {
  if (
    thread.hasPendingApprovals ||
    thread.hasPendingUserInput ||
    thread.latestTurn?.state === "error" ||
    thread.session?.status === "error"
  )
    return "attention";
  if (
    thread.latestTurn?.state === "running" ||
    thread.session?.status === "starting" ||
    thread.backgroundLiveness === "working"
  )
    return "working";
  return "ready";
}

export function hasSharedCheckoutWarning(
  threads: ReadonlyArray<Pick<OrchestrationThreadShell, "worktreePath" | "runtimeMode">>,
): boolean {
  return (
    threads.filter(
      (thread) => thread.worktreePath === null && thread.runtimeMode !== "approval-required",
    ).length > 1
  );
}

export function nextFreeformPosition(
  positions: Readonly<Record<string, CanvasPoint>>,
  index: number,
): CanvasPoint {
  const existing = Object.values(positions);
  let slot = index;
  while (true) {
    const candidate = { x: 42 + (slot % 4) * 298, y: 52 + Math.floor(slot / 4) * 192 };
    const overlaps = existing.some(
      (point) =>
        Math.abs(point.x - candidate.x) < NODE_WIDTH + 16 &&
        Math.abs(point.y - candidate.y) < NODE_HEIGHT + 16,
    );
    if (!overlaps) return candidate;
    slot += 1;
  }
}

export function providerLaunchBlockReason(entry: {
  readonly enabled: boolean;
  readonly isAvailable: boolean;
  readonly installed: boolean;
  readonly status: string;
}): string | null {
  if (!entry.enabled) return "Disabled in provider settings";
  if (!entry.isAvailable || !entry.installed) return "Provider is not installed or available";
  if (entry.status !== "ready") return `Provider is ${entry.status}`;
  return null;
}

export function hydrateTerminalCanvasThreads<T extends { readonly id: string }>(
  visibleThreadIds: ReadonlyArray<string>,
  threads: ReadonlyArray<T>,
): T[] {
  const byId = new Map(threads.map((thread) => [thread.id, thread] as const));
  return visibleThreadIds.flatMap((id) => {
    const thread = byId.get(id);
    return thread ? [thread] : [];
  });
}

export function removeTerminalFromCanvas(
  state: TerminalCenterProjectState,
  threadId: string,
): TerminalCenterProjectState {
  const { [threadId]: _removed, ...positions } = state.positions;
  return {
    ...state,
    visibleThreadIds: state.visibleThreadIds.filter((id) => id !== threadId),
    positions,
    selectedThreadId: state.selectedThreadId === threadId ? null : state.selectedThreadId,
  };
}

export function terminalWorkspaceLabel(input: {
  readonly worktreePath: string | null;
  readonly taskBacked: boolean;
}): string {
  if (input.worktreePath === null) return "Current checkout";
  return input.taskBacked ? "Isolated Task worktree" : "Worktree";
}

export function terminalThreadCreateFields(input: {
  readonly title: string;
  readonly modelSelection: ModelSelection;
  readonly workspace:
    | { readonly mode: "current" }
    | { readonly mode: "isolated"; readonly branch: string; readonly path: string };
}) {
  return {
    title: input.title,
    modelSelection: input.modelSelection,
    runtimeMode: "full-access" as const,
    interactionMode: "default" as const,
    branch: input.workspace.mode === "isolated" ? input.workspace.branch : null,
    worktreePath: input.workspace.mode === "isolated" ? input.workspace.path : null,
  };
}
