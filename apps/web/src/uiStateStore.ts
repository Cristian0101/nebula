import { Debouncer } from "@tanstack/react-pacer";
import { create } from "zustand";
import { normalizeProjectPathForComparison } from "./lib/projectPaths";
import {
  DEFAULT_TERMINAL_CENTER_STATE,
  TERMINAL_CENTER_LAYOUTS,
  type CanvasPoint,
  type CanvasViewport,
  type TerminalCenterLayout,
  type TerminalCenterProjectState,
  type TerminalCenterQuickLaunchProfile,
} from "./components/terminalCenter/terminalCenterLogic";
import {
  TERMINAL_WORKSPACE_LAYOUTS,
  TERMINAL_WORKSPACE_GRID_PRESETS,
  TERMINAL_WORKSPACE_PANE_TYPES,
  normalizeGridPlacement,
  reflowWorkspaceGrid,
  type TerminalWorkspace,
  type TerminalWorkspaceFreeformPlacement,
  type TerminalWorkspacePane,
  type TerminalWorkspaceProjectState,
} from "./components/terminalCenter/terminalWorkspace";

export const PERSISTED_STATE_KEY = "t3code:ui-state:v1";
const THREAD_CHANGED_FILES_EXPANSION_VERSION = 1;
const LEGACY_PERSISTED_STATE_KEYS = [
  "t3code:renderer-state:v8",
  "t3code:renderer-state:v7",
  "t3code:renderer-state:v6",
  "t3code:renderer-state:v5",
  "t3code:renderer-state:v4",
  "t3code:renderer-state:v3",
  "codething:renderer-state:v4",
  "codething:renderer-state:v3",
  "codething:renderer-state:v2",
  "codething:renderer-state:v1",
] as const;

export interface PersistedUiState {
  projectExpandedById?: Record<string, boolean>;
  projectOrder?: string[];
  threadLastVisitedAtById?: Record<string, string>;
  collapsedProjectCwds?: string[];
  expandedProjectCwds?: string[];
  projectOrderCwds?: string[];
  defaultAdvertisedEndpointKey?: string | null;
  threadChangedFilesExpansionVersion?: typeof THREAD_CHANGED_FILES_EXPANSION_VERSION;
  threadChangedFilesExpandedById?: Record<string, Record<string, boolean>>;
  terminalCenterByProjectId?: Record<string, TerminalCenterProjectState>;
  terminalWorkspacesByProjectId?: Record<string, TerminalWorkspaceProjectState>;
}

export interface UiProjectState {
  projectExpandedById: Record<string, boolean>;
  projectOrder: string[];
}

export interface UiThreadState {
  threadLastVisitedAtById: Record<string, string>;
  threadChangedFilesExpandedById: Record<string, Record<string, boolean>>;
}

export interface UiEndpointState {
  defaultAdvertisedEndpointKey: string | null;
}

export interface UiTerminalCenterState {
  terminalCenterByProjectId: Record<string, TerminalCenterProjectState>;
  terminalWorkspacesByProjectId: Record<string, TerminalWorkspaceProjectState>;
}

export interface UiState
  extends UiProjectState, UiThreadState, UiEndpointState, UiTerminalCenterState {}

const initialState: UiState = {
  projectExpandedById: {},
  projectOrder: [],
  threadLastVisitedAtById: {},
  threadChangedFilesExpandedById: {},
  defaultAdvertisedEndpointKey: null,
  terminalCenterByProjectId: {},
  terminalWorkspacesByProjectId: {},
};

function sanitizeFreeformPlacement(value: unknown): TerminalWorkspaceFreeformPlacement {
  const candidate = (value ?? {}) as Partial<TerminalWorkspaceFreeformPlacement>;
  return {
    x: Number.isFinite(candidate.x) ? candidate.x! : 24,
    y: Number.isFinite(candidate.y) ? candidate.y! : 24,
    width: Number.isFinite(candidate.width) ? Math.max(240, candidate.width!) : 560,
    height: Number.isFinite(candidate.height) ? Math.max(180, candidate.height!) : 360,
    z: Number.isFinite(candidate.z) ? Math.max(1, Math.round(candidate.z!)) : 1,
  };
}

function sanitizeWorkspacePane(value: unknown): TerminalWorkspacePane | null {
  if (!value || typeof value !== "object") return null;
  const pane = value as Partial<TerminalWorkspacePane>;
  if (
    typeof pane.id !== "string" ||
    pane.id.length === 0 ||
    !TERMINAL_WORKSPACE_PANE_TYPES.includes(pane.type as TerminalWorkspacePane["type"]) ||
    typeof pane.workspacePath !== "string" ||
    pane.workspacePath.length === 0
  )
    return null;
  const createdAt = typeof pane.createdAt === "string" ? pane.createdAt : new Date(0).toISOString();
  const externalServerCandidate = pane.externalServer;
  const externalServer =
    externalServerCandidate &&
    typeof externalServerCandidate === "object" &&
    typeof externalServerCandidate.host === "string" &&
    Number.isInteger(externalServerCandidate.port) &&
    externalServerCandidate.port > 0 &&
    externalServerCandidate.port < 65_536 &&
    typeof externalServerCandidate.url === "string"
      ? {
          host: externalServerCandidate.host,
          port: externalServerCandidate.port,
          url: externalServerCandidate.url,
          pid: Number.isInteger(externalServerCandidate.pid) ? externalServerCandidate.pid! : null,
          processName:
            typeof externalServerCandidate.processName === "string"
              ? externalServerCandidate.processName
              : null,
          attachedAt:
            typeof externalServerCandidate.attachedAt === "string"
              ? externalServerCandidate.attachedAt
              : createdAt,
        }
      : null;
  return {
    id: pane.id,
    type: pane.type as TerminalWorkspacePane["type"],
    title: typeof pane.title === "string" && pane.title.length > 0 ? pane.title : "Pane",
    taskId: typeof pane.taskId === "string" ? pane.taskId : null,
    threadId: typeof pane.threadId === "string" ? pane.threadId : null,
    providerInstanceId:
      typeof pane.providerInstanceId === "string" ? pane.providerInstanceId : null,
    terminalId: typeof pane.terminalId === "string" ? pane.terminalId : null,
    devServerProfileId:
      typeof pane.devServerProfileId === "string" ? pane.devServerProfileId : null,
    attachedPaneId: typeof pane.attachedPaneId === "string" ? pane.attachedPaneId : null,
    command: typeof pane.command === "string" ? pane.command : null,
    previewUrl: typeof pane.previewUrl === "string" ? pane.previewUrl : null,
    externalServer,
    workspacePath: pane.workspacePath,
    grid: normalizeGridPlacement(pane.grid),
    freeform: sanitizeFreeformPlacement(pane.freeform),
    visible: pane.visible !== false,
    createdAt,
    updatedAt: typeof pane.updatedAt === "string" ? pane.updatedAt : createdAt,
  };
}

function sanitizeTerminalWorkspaces(value: unknown): Record<string, TerminalWorkspaceProjectState> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, TerminalWorkspaceProjectState> = {};
  for (const [projectId, raw] of Object.entries(value)) {
    if (!projectId || !raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<TerminalWorkspaceProjectState>;
    const workspaces = (Array.isArray(candidate.workspaces) ? candidate.workspaces : []).flatMap(
      (rawWorkspace): TerminalWorkspace[] => {
        if (!rawWorkspace || typeof rawWorkspace !== "object") return [];
        const workspace = rawWorkspace as Partial<TerminalWorkspace>;
        if (typeof workspace.id !== "string" || workspace.id.length === 0) return [];
        const paneIds = new Set<string>();
        let visiblePaneCount = 0;
        const panes = (Array.isArray(workspace.panes) ? workspace.panes : []).flatMap((pane) => {
          const sanitized = sanitizeWorkspacePane(pane);
          if (!sanitized || paneIds.has(sanitized.id)) return [];
          paneIds.add(sanitized.id);
          if (!sanitized.visible) return [sanitized];
          visiblePaneCount += 1;
          return [visiblePaneCount <= 16 ? sanitized : { ...sanitized, visible: false }];
        });
        const createdAt =
          typeof workspace.createdAt === "string" ? workspace.createdAt : new Date(0).toISOString();
        const selectedPaneId =
          typeof workspace.selectedPaneId === "string" &&
          panes.some((pane) => pane.id === workspace.selectedPaneId && pane.visible)
            ? workspace.selectedPaneId
            : null;
        const focusedPaneId =
          typeof workspace.focusedPaneId === "string" &&
          panes.some((pane) => pane.id === workspace.focusedPaneId && pane.visible)
            ? workspace.focusedPaneId
            : null;
        const gridPreset = TERMINAL_WORKSPACE_GRID_PRESETS.includes(
          workspace.gridPreset as TerminalWorkspace["gridPreset"],
        )
          ? (workspace.gridPreset as TerminalWorkspace["gridPreset"])
          : "auto";
        const sanitized: TerminalWorkspace = {
          id: workspace.id,
          name:
            typeof workspace.name === "string" && workspace.name.length > 0
              ? workspace.name
              : "Workspace",
          layout: TERMINAL_WORKSPACE_LAYOUTS.includes(
            workspace.layout as TerminalWorkspace["layout"],
          )
            ? (workspace.layout as TerminalWorkspace["layout"])
            : "grid",
          gridPreset,
          splitDirection: workspace.splitDirection === "vertical" ? "vertical" : "horizontal",
          panes,
          selectedPaneId,
          focusedPaneId,
          viewport:
            workspace.viewport &&
            Number.isFinite(workspace.viewport.x) &&
            Number.isFinite(workspace.viewport.y) &&
            Number.isFinite(workspace.viewport.zoom)
              ? {
                  x: workspace.viewport.x,
                  y: workspace.viewport.y,
                  zoom: Math.min(2, Math.max(0.5, workspace.viewport.zoom)),
                }
              : { x: 0, y: 0, zoom: 1 },
          createdAt,
          updatedAt: typeof workspace.updatedAt === "string" ? workspace.updatedAt : createdAt,
        };
        const reflowed = reflowWorkspaceGrid(sanitized, gridPreset, sanitized.updatedAt);
        return [
          reflowed === sanitized
            ? reflowWorkspaceGrid(sanitized, "auto", sanitized.updatedAt)
            : reflowed,
        ];
      },
    );
    if (workspaces.length === 0) continue;
    result[projectId] = {
      initialized: true,
      activeWorkspaceId:
        typeof candidate.activeWorkspaceId === "string" &&
        workspaces.some((workspace) => workspace.id === candidate.activeWorkspaceId)
          ? candidate.activeWorkspaceId
          : workspaces[0]!.id,
      workspaces,
    };
  }
  return result;
}

function sanitizeTerminalCenterState(value: unknown): Record<string, TerminalCenterProjectState> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, TerminalCenterProjectState> = {};
  for (const [projectId, raw] of Object.entries(value)) {
    if (!projectId || !raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<TerminalCenterProjectState>;
    const layout = TERMINAL_CENTER_LAYOUTS.includes(candidate.layout as TerminalCenterLayout)
      ? (candidate.layout as TerminalCenterLayout)
      : DEFAULT_TERMINAL_CENTER_STATE.layout;
    const positions = Object.fromEntries(
      Object.entries(candidate.positions ?? {}).filter(
        (entry): entry is [string, CanvasPoint] =>
          Boolean(entry[0]) && Number.isFinite(entry[1]?.x) && Number.isFinite(entry[1]?.y),
      ),
    );
    const freeformPositions = Object.fromEntries(
      Object.entries(candidate.freeformPositions ?? positions).filter(
        (entry): entry is [string, CanvasPoint] =>
          Boolean(entry[0]) && Number.isFinite(entry[1]?.x) && Number.isFinite(entry[1]?.y),
      ),
    );
    const viewport = candidate.viewport;
    result[projectId] = {
      membershipInitialized: candidate.membershipInitialized !== false,
      visibleThreadIds: sanitizeStringArray(candidate.visibleThreadIds),
      positions,
      freeformPositions,
      layout,
      viewport:
        viewport &&
        Number.isFinite(viewport.x) &&
        Number.isFinite(viewport.y) &&
        Number.isFinite(viewport.zoom)
          ? { x: viewport.x, y: viewport.y, zoom: Math.min(2, Math.max(0.35, viewport.zoom)) }
          : DEFAULT_TERMINAL_CENTER_STATE.viewport,
      selectedThreadId:
        typeof candidate.selectedThreadId === "string" ? candidate.selectedThreadId : null,
      quickLaunch:
        candidate.quickLaunch &&
        (candidate.quickLaunch.workspaceMode === "current" ||
          candidate.quickLaunch.workspaceMode === "isolated") &&
        typeof candidate.quickLaunch.isolatedWritePattern === "string"
          ? {
              workspaceMode: candidate.quickLaunch.workspaceMode,
              isolatedWritePattern: candidate.quickLaunch.isolatedWritePattern,
              modelByProvider: candidate.quickLaunch.modelByProvider ?? {},
            }
          : null,
    };
  }
  return result;
}

const LEGACY_PROJECT_CWD_PREFERENCE_PREFIX = "legacy-project-cwd:";
const LEGACY_PROJECT_EXPANSION_DEFAULT_KEY = "legacy-project-expansion-default";
let legacyKeysCleanedUp = false;

export function legacyProjectCwdPreferenceKey(cwd: string): string {
  return `${LEGACY_PROJECT_CWD_PREFERENCE_PREFIX}${normalizeProjectPathForComparison(cwd)}`;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
    ),
  ];
}

function sanitizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => entry[0].length > 0 && typeof entry[1] === "boolean",
    ),
  );
}

function sanitizeTimestampRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        entry[0].length > 0 &&
        typeof entry[1] === "string" &&
        entry[1].length > 0 &&
        Number.isFinite(Date.parse(entry[1])),
    ),
  );
}

export function parsePersistedState(parsed: PersistedUiState): UiState {
  const projectExpandedById =
    parsed.projectExpandedById === undefined
      ? (() => {
          const migrated: Record<string, boolean> = {};
          const collapsedProjectCwds = sanitizeStringArray(parsed.collapsedProjectCwds);
          const expandedProjectCwds = sanitizeStringArray(parsed.expandedProjectCwds);
          for (const cwd of collapsedProjectCwds) {
            migrated[legacyProjectCwdPreferenceKey(cwd)] = false;
          }
          for (const cwd of expandedProjectCwds) {
            migrated[legacyProjectCwdPreferenceKey(cwd)] = true;
          }
          if (!Array.isArray(parsed.collapsedProjectCwds) && expandedProjectCwds.length > 0) {
            migrated[LEGACY_PROJECT_EXPANSION_DEFAULT_KEY] = false;
          }
          return migrated;
        })()
      : sanitizeBooleanRecord(parsed.projectExpandedById);
  const projectOrder =
    parsed.projectOrder === undefined
      ? sanitizeStringArray(parsed.projectOrderCwds).map(legacyProjectCwdPreferenceKey)
      : sanitizeStringArray(parsed.projectOrder);

  return {
    projectExpandedById,
    projectOrder,
    threadLastVisitedAtById: sanitizeTimestampRecord(parsed.threadLastVisitedAtById),
    threadChangedFilesExpandedById:
      parsed.threadChangedFilesExpansionVersion === THREAD_CHANGED_FILES_EXPANSION_VERSION
        ? sanitizePersistedThreadChangedFilesExpanded(parsed.threadChangedFilesExpandedById)
        : {},
    defaultAdvertisedEndpointKey:
      typeof parsed.defaultAdvertisedEndpointKey === "string" &&
      parsed.defaultAdvertisedEndpointKey.length > 0
        ? parsed.defaultAdvertisedEndpointKey
        : null,
    terminalCenterByProjectId: sanitizeTerminalCenterState(parsed.terminalCenterByProjectId),
    terminalWorkspacesByProjectId: sanitizeTerminalWorkspaces(parsed.terminalWorkspacesByProjectId),
  };
}

function readPersistedState(): UiState {
  if (typeof window === "undefined") {
    return initialState;
  }
  try {
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
        const legacyRaw = window.localStorage.getItem(legacyKey);
        if (!legacyRaw) {
          continue;
        }
        return parsePersistedState(JSON.parse(legacyRaw) as PersistedUiState);
      }
      return initialState;
    }
    return parsePersistedState(JSON.parse(raw) as PersistedUiState);
  } catch {
    return initialState;
  }
}

function sanitizePersistedThreadChangedFilesExpanded(
  value: PersistedUiState["threadChangedFilesExpandedById"],
): Record<string, Record<string, boolean>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const nextState: Record<string, Record<string, boolean>> = {};
  for (const [threadId, turns] of Object.entries(value)) {
    if (!threadId || !turns || typeof turns !== "object") {
      continue;
    }

    const nextTurns: Record<string, boolean> = {};
    for (const [turnId, expanded] of Object.entries(turns)) {
      if (turnId && typeof expanded === "boolean") {
        nextTurns[turnId] = expanded;
      }
    }

    if (Object.keys(nextTurns).length > 0) {
      nextState[threadId] = nextTurns;
    }
  }

  return nextState;
}

export function persistState(state: UiState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const projectExpandedById = Object.fromEntries(
      Object.entries(state.projectExpandedById).filter(
        ([key]) => key !== LEGACY_PROJECT_EXPANSION_DEFAULT_KEY,
      ),
    );
    window.localStorage.setItem(
      PERSISTED_STATE_KEY,
      JSON.stringify({
        projectExpandedById,
        projectOrder: state.projectOrder,
        threadLastVisitedAtById: state.threadLastVisitedAtById,
        defaultAdvertisedEndpointKey: state.defaultAdvertisedEndpointKey,
        threadChangedFilesExpansionVersion: THREAD_CHANGED_FILES_EXPANSION_VERSION,
        threadChangedFilesExpandedById: state.threadChangedFilesExpandedById,
        terminalCenterByProjectId: state.terminalCenterByProjectId,
        terminalWorkspacesByProjectId: state.terminalWorkspacesByProjectId,
      } satisfies PersistedUiState),
    );
    if (!legacyKeysCleanedUp) {
      legacyKeysCleanedUp = true;
      for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    }
  } catch {
    // Ignore quota/storage errors to avoid breaking chat UX.
  }
}

const debouncedPersistState = new Debouncer(persistState, { wait: 500 });

export function markThreadVisited(state: UiState, threadId: string, visitedAt: string): UiState {
  const visitedAtMs = Date.parse(visitedAt);
  if (!Number.isFinite(visitedAtMs)) {
    return state;
  }
  const previousVisitedAt = state.threadLastVisitedAtById[threadId];
  const previousVisitedAtMs = previousVisitedAt ? Date.parse(previousVisitedAt) : NaN;
  if (
    Number.isFinite(previousVisitedAtMs) &&
    Number.isFinite(visitedAtMs) &&
    previousVisitedAtMs >= visitedAtMs
  ) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: {
      ...state.threadLastVisitedAtById,
      [threadId]: visitedAt,
    },
  };
}

export function markThreadUnread(
  state: UiState,
  threadId: string,
  latestTurnCompletedAt: string | null | undefined,
): UiState {
  if (!latestTurnCompletedAt) {
    return state;
  }
  const latestTurnCompletedAtMs = Date.parse(latestTurnCompletedAt);
  if (Number.isNaN(latestTurnCompletedAtMs)) {
    return state;
  }
  const unreadVisitedAt = new Date(latestTurnCompletedAtMs - 1).toISOString();
  if (state.threadLastVisitedAtById[threadId] === unreadVisitedAt) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: {
      ...state.threadLastVisitedAtById,
      [threadId]: unreadVisitedAt,
    },
  };
}

export function setThreadChangedFilesExpanded(
  state: UiState,
  threadId: string,
  turnId: string,
  expanded: boolean,
): UiState {
  const currentThreadState = state.threadChangedFilesExpandedById[threadId] ?? {};
  if (currentThreadState[turnId] === expanded) {
    return state;
  }

  return {
    ...state,
    threadChangedFilesExpandedById: {
      ...state.threadChangedFilesExpandedById,
      [threadId]: {
        ...currentThreadState,
        [turnId]: expanded,
      },
    },
  };
}

export function setDefaultAdvertisedEndpointKey(state: UiState, key: string | null): UiState {
  const nextKey = key && key.length > 0 ? key : null;
  if (state.defaultAdvertisedEndpointKey === nextKey) {
    return state;
  }
  return {
    ...state,
    defaultAdvertisedEndpointKey: nextKey,
  };
}

export function resolveProjectExpanded(
  projectExpandedById: Readonly<Record<string, boolean>>,
  preferenceKeys: readonly string[],
): boolean {
  for (const key of preferenceKeys) {
    const expanded = projectExpandedById[key];
    if (expanded !== undefined) {
      return expanded;
    }
  }
  return projectExpandedById[LEGACY_PROJECT_EXPANSION_DEFAULT_KEY] ?? true;
}

export function setProjectExpanded(
  state: UiState,
  projectIds: string | readonly string[],
  expanded: boolean,
): UiState {
  const ids = typeof projectIds === "string" ? [projectIds] : projectIds;
  const nextEntries = ids.filter((projectId) => state.projectExpandedById[projectId] !== expanded);
  if (nextEntries.length === 0) {
    return state;
  }
  const projectExpandedById = { ...state.projectExpandedById };
  for (const projectId of nextEntries) {
    projectExpandedById[projectId] = expanded;
  }
  return {
    ...state,
    projectExpandedById,
  };
}

export function reorderProjects(
  state: UiState,
  currentProjectOrder: readonly string[],
  draggedProjectIds: readonly string[],
  targetProjectIds: readonly string[],
): UiState {
  if (draggedProjectIds.length === 0) {
    return state;
  }
  const draggedSet = new Set(draggedProjectIds);
  const targetSet = new Set(targetProjectIds);
  if (draggedProjectIds.every((id) => targetSet.has(id))) {
    return state;
  }

  const originalTargetIndex = currentProjectOrder.findIndex((id) => targetSet.has(id));
  if (originalTargetIndex < 0) {
    return state;
  }

  const projectOrder = [...currentProjectOrder];

  const removed: string[] = [];
  let draggedBeforeTarget = 0;
  for (let i = projectOrder.length - 1; i >= 0; i--) {
    if (draggedSet.has(projectOrder[i]!)) {
      removed.unshift(projectOrder.splice(i, 1)[0]!);
      if (i < originalTargetIndex) {
        draggedBeforeTarget++;
      }
    }
  }
  if (removed.length === 0) {
    return state;
  }

  const insertIndex = originalTargetIndex - Math.max(0, draggedBeforeTarget - 1);
  projectOrder.splice(insertIndex, 0, ...removed);
  return {
    ...state,
    projectOrder,
  };
}

interface UiStateStore extends UiState {
  markThreadVisited: (threadId: string, visitedAt: string) => void;
  markThreadUnread: (threadId: string, latestTurnCompletedAt: string | null | undefined) => void;
  setThreadChangedFilesExpanded: (threadId: string, turnId: string, expanded: boolean) => void;
  setDefaultAdvertisedEndpointKey: (key: string | null) => void;
  setProjectExpanded: (projectIds: string | readonly string[], expanded: boolean) => void;
  reorderProjects: (
    currentProjectOrder: readonly string[],
    draggedProjectIds: readonly string[],
    targetProjectIds: readonly string[],
  ) => void;
  setTerminalCenterState: (projectId: string, state: TerminalCenterProjectState) => void;
  showTerminalCenterThread: (projectId: string, threadId: string, point?: CanvasPoint) => void;
  hideTerminalCenterThread: (projectId: string, threadId: string) => void;
  setTerminalCenterNodePosition: (projectId: string, threadId: string, point: CanvasPoint) => void;
  setTerminalCenterLayout: (
    projectId: string,
    layout: TerminalCenterLayout,
    positions: Readonly<Record<string, CanvasPoint>>,
  ) => void;
  setTerminalCenterViewport: (projectId: string, viewport: CanvasViewport) => void;
  setTerminalCenterSelection: (projectId: string, threadId: string | null) => void;
  setTerminalCenterQuickLaunch: (
    projectId: string,
    profile: TerminalCenterQuickLaunchProfile,
  ) => void;
  setTerminalWorkspaceProjectState: (
    projectId: string,
    state: TerminalWorkspaceProjectState,
  ) => void;
}

function projectTerminalState(state: UiState, projectId: string): TerminalCenterProjectState {
  return state.terminalCenterByProjectId[projectId] ?? DEFAULT_TERMINAL_CENTER_STATE;
}

export const useUiStateStore = create<UiStateStore>((set) => ({
  ...readPersistedState(),
  markThreadVisited: (threadId, visitedAt) =>
    set((state) => markThreadVisited(state, threadId, visitedAt)),
  markThreadUnread: (threadId, latestTurnCompletedAt) =>
    set((state) => markThreadUnread(state, threadId, latestTurnCompletedAt)),
  setThreadChangedFilesExpanded: (threadId, turnId, expanded) =>
    set((state) => setThreadChangedFilesExpanded(state, threadId, turnId, expanded)),
  setDefaultAdvertisedEndpointKey: (key) =>
    set((state) => setDefaultAdvertisedEndpointKey(state, key)),
  setProjectExpanded: (projectIds, expanded) =>
    set((state) => setProjectExpanded(state, projectIds, expanded)),
  reorderProjects: (currentProjectOrder, draggedProjectIds, targetProjectIds) =>
    set((state) =>
      reorderProjects(state, currentProjectOrder, draggedProjectIds, targetProjectIds),
    ),
  setTerminalCenterState: (projectId, terminalState) =>
    set((state) => ({
      terminalCenterByProjectId: { ...state.terminalCenterByProjectId, [projectId]: terminalState },
    })),
  showTerminalCenterThread: (projectId, threadId, point) =>
    set((state) => {
      const current = projectTerminalState(state, projectId);
      if (current.visibleThreadIds.includes(threadId)) return state;
      return {
        terminalCenterByProjectId: {
          ...state.terminalCenterByProjectId,
          [projectId]: {
            ...current,
            membershipInitialized: true,
            visibleThreadIds: [...current.visibleThreadIds, threadId],
            selectedThreadId: threadId,
            positions: point ? { ...current.positions, [threadId]: point } : current.positions,
            freeformPositions: point
              ? { ...current.freeformPositions, [threadId]: point }
              : current.freeformPositions,
          },
        },
      };
    }),
  hideTerminalCenterThread: (projectId, threadId) =>
    set((state) => {
      const current = projectTerminalState(state, projectId);
      const { [threadId]: _removed, ...positions } = current.positions;
      const { [threadId]: _removedFreeform, ...freeformPositions } = current.freeformPositions;
      return {
        terminalCenterByProjectId: {
          ...state.terminalCenterByProjectId,
          [projectId]: {
            ...current,
            membershipInitialized: true,
            visibleThreadIds: current.visibleThreadIds.filter((id) => id !== threadId),
            selectedThreadId:
              current.selectedThreadId === threadId ? null : current.selectedThreadId,
            positions,
            freeformPositions,
          },
        },
      };
    }),
  setTerminalCenterNodePosition: (projectId, threadId, point) =>
    set((state) => {
      const current = projectTerminalState(state, projectId);
      return {
        terminalCenterByProjectId: {
          ...state.terminalCenterByProjectId,
          [projectId]: {
            ...current,
            positions: { ...current.positions, [threadId]: point },
            freeformPositions:
              current.layout === "freeform"
                ? { ...current.freeformPositions, [threadId]: point }
                : current.freeformPositions,
          },
        },
      };
    }),
  setTerminalCenterLayout: (projectId, layout, positions) =>
    set((state) => {
      const current = projectTerminalState(state, projectId);
      const freeformPositions =
        current.layout === "freeform" ? current.positions : current.freeformPositions;
      return {
        terminalCenterByProjectId: {
          ...state.terminalCenterByProjectId,
          [projectId]: {
            ...current,
            layout,
            positions: layout === "freeform" ? { ...freeformPositions } : { ...positions },
            freeformPositions: { ...freeformPositions },
          },
        },
      };
    }),
  setTerminalCenterViewport: (projectId, viewport) =>
    set((state) => {
      const current = projectTerminalState(state, projectId);
      return {
        terminalCenterByProjectId: {
          ...state.terminalCenterByProjectId,
          [projectId]: { ...current, viewport },
        },
      };
    }),
  setTerminalCenterSelection: (projectId, selectedThreadId) =>
    set((state) => {
      const current = projectTerminalState(state, projectId);
      return {
        terminalCenterByProjectId: {
          ...state.terminalCenterByProjectId,
          [projectId]: { ...current, selectedThreadId },
        },
      };
    }),
  setTerminalCenterQuickLaunch: (projectId, quickLaunch) =>
    set((state) => {
      const current = projectTerminalState(state, projectId);
      return {
        terminalCenterByProjectId: {
          ...state.terminalCenterByProjectId,
          [projectId]: { ...current, quickLaunch },
        },
      };
    }),
  setTerminalWorkspaceProjectState: (projectId, terminalWorkspaceState) =>
    set((state) => ({
      terminalWorkspacesByProjectId: {
        ...state.terminalWorkspacesByProjectId,
        [projectId]: terminalWorkspaceState,
      },
    })),
}));

useUiStateStore.subscribe((state) => debouncedPersistState.maybeExecute(state));

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => {
    debouncedPersistState.flush();
  });
}
