import type {
  Mission,
  MissionRun,
  ModelSelection,
  OrchestrationTask,
  OrchestrationThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import { computeMissionPlan } from "@t3tools/shared/missionGraph";

export const TERMINAL_CENTER_LAYOUTS = [
  "grid",
  "project-columns",
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
  /** Distinguishes a deliberately empty canvas from a canvas never initialized. */
  readonly membershipInitialized: boolean;
  readonly visibleThreadIds: ReadonlyArray<string>;
  readonly positions: Readonly<Record<string, CanvasPoint>>;
  readonly freeformPositions: Readonly<Record<string, CanvasPoint>>;
  readonly layout: TerminalCenterLayout;
  readonly viewport: CanvasViewport;
  readonly selectedThreadId: string | null;
  readonly quickLaunch: TerminalCenterQuickLaunchProfile | null;
}

export const DEFAULT_TERMINAL_CENTER_STATE: TerminalCenterProjectState = {
  membershipInitialized: false,
  visibleThreadIds: [],
  positions: {},
  freeformPositions: {},
  layout: "freeform",
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedThreadId: null,
  quickLaunch: null,
};

export const FOCUSED_TERMINAL_SHELL_CLASS = "relative h-dvh min-h-0 overflow-hidden bg-background";

export function terminalCenterKeyboardAction(input: {
  readonly key: string;
  readonly selectedThreadId: string | null;
  readonly focused: boolean;
  readonly targetIsFormControl: boolean;
}): "focus" | "exit" | null {
  if (input.key === "Escape" && input.focused) return "exit";
  if (
    input.key === "Enter" &&
    input.selectedThreadId !== null &&
    !input.focused &&
    !input.targetIsFormControl
  )
    return "focus";
  return null;
}

export interface TerminalCanvasNode {
  readonly threadId: ThreadId;
  readonly projectId: string;
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
  if (layout === "project-columns") return columns(nodes, (node) => node.projectId);
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

export type TerminalAgentState =
  | "ready"
  | "working"
  | "review-needed"
  | "waiting-resource"
  | "waiting-checkpoint"
  | "provider-unavailable"
  | "error"
  | "complete";

export interface TerminalAgentPresentation {
  readonly state: TerminalAgentState;
  readonly label: string;
  readonly canvasStatus: TerminalCanvasNode["status"];
  readonly detail: string | null;
  readonly elapsed: string | null;
}

function formatAgentElapsed(startedAt: string, nowMs: number): string | null {
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return null;
  const seconds = Math.max(0, Math.floor((nowMs - startedMs) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function deriveTerminalAgentPresentation(input: {
  readonly thread: OrchestrationThreadShell;
  readonly task: Pick<OrchestrationTask, "id" | "status"> | null;
  readonly run: Pick<MissionRun, "status" | "startedAt" | "decisions" | "attention"> | null;
  readonly providerAvailable: boolean;
  readonly nowMs?: number;
}): TerminalAgentPresentation {
  const elapsed = input.run
    ? formatAgentElapsed(input.run.startedAt, input.nowMs ?? Date.now())
    : null;
  if (!input.providerAvailable) {
    return {
      state: "provider-unavailable",
      label: "Provider unavailable",
      canvasStatus: "attention",
      detail: "The canonical Thread is preserved and can be resumed after provider recovery.",
      elapsed,
    };
  }
  if (input.thread.hasPendingApprovals || input.thread.hasPendingUserInput) {
    return {
      state: "review-needed",
      label: "Review needed",
      canvasStatus: "attention",
      detail: input.thread.hasPendingApprovals
        ? "Waiting for an approval in the canonical Thread."
        : "Waiting for user input in the canonical Thread.",
      elapsed,
    };
  }
  const taskDecision = input.task
    ? (input.run?.decisions ?? [])
        .toReversed()
        .find(
          (decision) =>
            decision.taskId === input.task?.id &&
            (decision.kind === "waiting_checkpoint" ||
              decision.kind === "waiting_resource" ||
              decision.kind === "attention"),
        )
    : null;
  if (taskDecision?.kind === "waiting_checkpoint") {
    return {
      state: "waiting-checkpoint",
      label: "Waiting for checkpoint",
      canvasStatus: "attention",
      detail: taskDecision.reason,
      elapsed,
    };
  }
  if (taskDecision?.kind === "waiting_resource") {
    return {
      state: "waiting-resource",
      label: "Waiting for resource",
      canvasStatus: "attention",
      detail: taskDecision.reason,
      elapsed,
    };
  }
  const taskAttention = input.task
    ? input.run?.attention.find((attention) => attention.taskId === input.task?.id)
    : null;
  if (taskAttention || taskDecision?.kind === "attention") {
    const detail = taskAttention?.detail ?? taskDecision?.reason ?? "Agent attention is required.";
    const review = `${taskAttention?.code ?? ""} ${detail}`.toLowerCase().includes("review");
    const providerUnavailable =
      taskAttention?.code === "provider_failed" &&
      /auth|credential|token|unauthorized|provider unavailable/i.test(detail);
    return {
      state: review ? "review-needed" : providerUnavailable ? "provider-unavailable" : "error",
      label: review ? "Review needed" : providerUnavailable ? "Provider unavailable" : "Error",
      canvasStatus: "attention",
      detail,
      elapsed,
    };
  }
  if (input.task?.status === "completed") {
    return {
      state: "complete",
      label: "Complete",
      canvasStatus: "ready",
      detail: null,
      elapsed,
    };
  }
  const canvasStatus = deriveTerminalNodeStatus(input.thread);
  if (canvasStatus === "attention") {
    return {
      state: "error",
      label: "Error",
      canvasStatus,
      detail:
        input.thread.latestTurn?.state === "error" ? "The latest provider turn failed." : null,
      elapsed,
    };
  }
  if (canvasStatus === "working") {
    return {
      state: "working",
      label: "Working",
      canvasStatus,
      detail: input.thread.planProgress?.step ?? null,
      elapsed,
    };
  }
  return {
    state: "ready",
    label: "Ready",
    canvasStatus,
    detail: null,
    elapsed: null,
  };
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
    membershipInitialized: true,
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
