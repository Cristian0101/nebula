import { ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  legacyProjectCwdPreferenceKey,
  markThreadUnread,
  markThreadVisited,
  parsePersistedState,
  PERSISTED_STATE_KEY,
  type PersistedUiState,
  persistState,
  reorderProjects,
  resolveProjectExpanded,
  setDefaultAdvertisedEndpointKey,
  setProjectExpanded,
  setThreadChangedFilesExpanded,
  type UiState,
  useUiStateStore,
} from "./uiStateStore";
import { DEFAULT_TERMINAL_CENTER_STATE } from "./components/terminalCenter/terminalCenterLogic";
import {
  createDefaultTerminalWorkspaceProjectState,
  createTerminalWorkspacePane,
} from "./components/terminalCenter/terminalWorkspace";

function makeUiState(overrides: Partial<UiState> = {}): UiState {
  return {
    projectExpandedById: {},
    projectOrder: [],
    threadLastVisitedAtById: {},
    threadChangedFilesExpandedById: {},
    defaultAdvertisedEndpointKey: null,
    terminalCenterByProjectId: {},
    terminalWorkspacesByProjectId: {},
    ...overrides,
  };
}

describe("uiStateStore pure functions", () => {
  it("reconciles persisted Terminal Workspace collisions and invalid selection", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "project-one",
      workspacePath: "/repo",
      now: "2026-08-26T12:00:00.000Z",
    });
    const workspace = state.workspaces[0]!;
    const agent = createTerminalWorkspacePane({
      id: "agent",
      type: "thread",
      title: "Codex",
      workspacePath: "/repo",
      grid: workspace.panes[0]!.grid,
      now: "2026-08-26T12:00:00.000Z",
    });
    const parsed = parsePersistedState({
      terminalWorkspacesByProjectId: {
        "project-one": {
          ...state,
          workspaces: [
            {
              ...workspace,
              gridPreset: "2x2",
              panes: [...workspace.panes, agent],
              selectedPaneId: "missing",
              focusedPaneId: "missing",
            },
          ],
        },
      },
    });
    const restored = parsed.terminalWorkspacesByProjectId["project-one"]!.workspaces[0]!;

    expect(restored.selectedPaneId).toBeNull();
    expect(restored.focusedPaneId).toBeNull();
    expect(new Set(restored.panes.map((pane) => `${pane.grid.column}:${pane.grid.row}`)).size).toBe(
      2,
    );
  });

  it("persists a validated external server attachment and rejects invalid ports", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "project-one",
      workspacePath: "/repo",
      now: "2026-08-26T12:00:00.000Z",
    });
    const workspace = state.workspaces[0]!;
    const valid = createTerminalWorkspacePane({
      id: "external",
      type: "dev_server",
      title: "Next · :3002",
      workspacePath: "/repo",
      externalServer: {
        host: "localhost",
        port: 3002,
        url: "http://localhost:3002",
        pid: 42,
        processName: "next-server",
        attachedAt: "2026-08-26T12:00:00.000Z",
      },
    });
    const invalid = {
      ...valid,
      id: "invalid",
      externalServer: { ...valid.externalServer!, port: 70_000 },
    };
    const parsed = parsePersistedState({
      terminalWorkspacesByProjectId: {
        "project-one": {
          ...state,
          workspaces: [{ ...workspace, panes: [valid, invalid] }],
        },
      },
    });
    const panes = parsed.terminalWorkspacesByProjectId["project-one"]!.workspaces[0]!.panes;

    expect(panes.find((pane) => pane.id === valid.id)?.externalServer).toEqual(
      valid.externalServer,
    );
    expect(panes.find((pane) => pane.id === invalid.id)?.externalServer).toBeNull();
  });

  it("sanitizes workspace modes, resizable ratios, and role-based dock defaults", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "project-one",
      workspacePath: "/repo",
      now: "2026-08-26T12:00:00.000Z",
    });
    const preview = createTerminalWorkspacePane({
      id: "preview",
      type: "preview",
      title: "Preview",
      workspacePath: "/repo",
    });
    const { dock: _legacyDock, ...legacyPreview } = preview;
    const parsed = parsePersistedState({
      terminalWorkspacesByProjectId: {
        "project-one": {
          ...state,
          workspaces: [
            {
              ...state.workspaces[0]!,
              mode: "build_preview",
              previewPaneId: preview.id,
              workbenchColumnRatios: [10, 20, 70],
              workbenchCanvasHeight: 99_999,
              buildPreviewRatio: 99,
              buildPreviewRailRatio: 2,
              panes: [legacyPreview],
            },
          ],
        },
      },
    });
    const workspace = parsed.terminalWorkspacesByProjectId["project-one"]!.workspaces[0]!;

    expect(workspace.mode).toBe("build_preview");
    expect(workspace.previewPaneId).toBe(preview.id);
    expect(workspace.workbenchColumnRatios?.reduce((sum, ratio) => sum + ratio, 0)).toBeCloseTo(
      100,
    );
    expect(workspace.buildPreviewRatio).toBe(82);
    expect(workspace.buildPreviewRailRatio).toBe(28);
    expect(workspace.workbenchCanvasHeight).toBe(6_000);
    expect(workspace.panes[0]?.dock?.area).toBe("right");
  });

  it("restores canonical Task bindings and keeps legacy panes general", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "project-one",
      workspacePath: "/repo",
      now: "2026-08-26T12:00:00.000Z",
    });
    const workspace = state.workspaces[0]!;
    const taskPane = createTerminalWorkspacePane({
      id: "task-shell",
      type: "shell",
      title: "Task Shell",
      taskId: "task-one",
      workspacePath: "/repo/.nebula/task-one",
    });
    const legacyPane = { ...taskPane, id: "legacy-shell", taskId: undefined };
    const persisted: unknown = {
      terminalWorkspacesByProjectId: {
        "project-one": {
          ...state,
          workspaces: [{ ...workspace, panes: [taskPane, legacyPane] }],
        },
      },
    };
    const parsed = parsePersistedState(persisted as Parameters<typeof parsePersistedState>[0]);
    const panes = parsed.terminalWorkspacesByProjectId["project-one"]!.workspaces[0]!.panes;

    expect(panes.find((pane) => pane.id === "task-shell")?.taskId).toBe("task-one");
    expect(panes.find((pane) => pane.id === "legacy-shell")?.taskId).toBeNull();
  });

  it("persists linked agent surfaces and cross-Workspace service ownership", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "project-one",
      workspacePath: "/repo",
      now: "2026-08-26T12:00:00.000Z",
    });
    const chat = createTerminalWorkspacePane({
      id: "agent-chat",
      type: "provider",
      title: "Codex",
      providerInstanceId: "codex",
      agentSurface: "chat",
      linkedPaneId: "agent-terminal",
      workspacePath: "/repo",
    });
    const service = createTerminalWorkspacePane({
      id: "service-logs",
      type: "logs",
      title: "Web App Logs",
      terminalId: "dev-server",
      terminalThreadId: "workspace-origin-thread",
      sourceWorkspaceId: "workspace-origin",
      workspacePath: "/repo",
    });
    const parsed = parsePersistedState({
      terminalWorkspacesByProjectId: {
        "project-one": {
          ...state,
          workspaces: [{ ...state.workspaces[0]!, panes: [chat, service] }],
        },
      },
    });
    const panes = parsed.terminalWorkspacesByProjectId["project-one"]!.workspaces[0]!.panes;

    expect(panes.find((pane) => pane.id === chat.id)).toMatchObject({
      agentSurface: "chat",
      linkedPaneId: "agent-terminal",
    });
    expect(panes.find((pane) => pane.id === service.id)).toMatchObject({
      terminalThreadId: "workspace-origin-thread",
      sourceWorkspaceId: "workspace-origin",
    });
  });

  it("restores recursive splits, active tabs, file targets, and preset identity", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "project-one",
      workspacePath: "/repo",
      now: "2026-08-26T12:00:00.000Z",
    });
    const shell = state.workspaces[0]!.panes[0]!;
    const file = createTerminalWorkspacePane({
      id: "file-readme",
      type: "file",
      title: "README.md",
      filePath: "README.md",
      workspacePath: "/repo",
    });
    const parsed = parsePersistedState({
      terminalWorkspacesByProjectId: {
        "project-one": {
          ...state,
          workspaces: [
            {
              ...state.workspaces[0]!,
              panes: [shell, file],
              layoutPreset: "main_rail",
              layoutTree: {
                id: "root",
                kind: "split",
                direction: "horizontal",
                ratio: 99,
                first: {
                  id: "main",
                  kind: "stack",
                  paneIds: [shell.id],
                  activePaneId: shell.id,
                },
                second: {
                  id: "rail",
                  kind: "stack",
                  paneIds: [file.id, shell.id, "missing"],
                  activePaneId: file.id,
                },
              },
            },
          ],
        },
      },
    });
    const workspace = parsed.terminalWorkspacesByProjectId["project-one"]!.workspaces[0]!;

    expect(workspace.layoutPreset).toBe("main_rail");
    expect(workspace.layoutTree).toMatchObject({
      kind: "split",
      direction: "horizontal",
      ratio: 85,
      first: { kind: "stack", paneIds: [shell.id], activePaneId: shell.id },
      second: { kind: "stack", paneIds: [file.id], activePaneId: file.id },
    });
    expect(workspace.panes.find((pane) => pane.id === file.id)).toMatchObject({
      type: "file",
      filePath: "README.md",
    });
  });

  it("keeps global and project Terminal Center canvases independent", () => {
    const globalKey = "nebula:global-terminal-center";
    const projectKey = "project-one";
    useUiStateStore.getState().setTerminalCenterState(globalKey, {
      ...DEFAULT_TERMINAL_CENTER_STATE,
      visibleThreadIds: ["global-thread"],
      layout: "project-columns",
    });
    useUiStateStore.getState().setTerminalCenterState(projectKey, {
      ...DEFAULT_TERMINAL_CENTER_STATE,
      visibleThreadIds: ["project-thread"],
      layout: "grid",
    });

    expect(useUiStateStore.getState().terminalCenterByProjectId[globalKey]).toMatchObject({
      visibleThreadIds: ["global-thread"],
      layout: "project-columns",
    });
    expect(useUiStateStore.getState().terminalCenterByProjectId[projectKey]).toMatchObject({
      visibleThreadIds: ["project-thread"],
      layout: "grid",
    });
  });

  it("restores dragged Freeform positions after using an arranged layout", () => {
    const projectId = "terminal-project";
    const threadId = "terminal-thread";
    const initialPosition = { x: 36, y: 42 };
    const draggedPosition = { x: 180, y: 140 };
    useUiStateStore.getState().setTerminalCenterState(projectId, {
      ...DEFAULT_TERMINAL_CENTER_STATE,
      visibleThreadIds: [threadId],
      positions: { [threadId]: initialPosition },
      freeformPositions: { [threadId]: initialPosition },
    });

    useUiStateStore.getState().setTerminalCenterNodePosition(projectId, threadId, draggedPosition);
    useUiStateStore
      .getState()
      .setTerminalCenterLayout(projectId, "grid", { [threadId]: { x: 420, y: 270 } });
    useUiStateStore
      .getState()
      .setTerminalCenterLayout(projectId, "freeform", { [threadId]: { x: 420, y: 270 } });

    expect(useUiStateStore.getState().terminalCenterByProjectId[projectId]?.positions).toEqual({
      [threadId]: draggedPosition,
    });
  });

  it("stores server timestamps without moving visit state backwards", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState();
    const visited = markThreadVisited(initialState, threadId, "2026-02-25T12:30:00.700Z");

    expect(visited.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:30:00.700Z");
    expect(markThreadVisited(visited, threadId, "2026-02-25T12:30:00.000Z")).toBe(visited);
    expect(markThreadVisited(visited, threadId, "not-a-date")).toBe(visited);
  });

  it("marks a completed thread unread using the server completion timestamp", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [threadId]: "2026-02-25T12:35:00.000Z",
      },
    });

    const next = markThreadUnread(initialState, threadId, "2026-02-25T12:30:00.000Z");

    expect(next.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:29:59.999Z");
    expect(markThreadUnread(next, threadId, null)).toBe(next);
  });

  it("resolves project expansion from logical, physical, and legacy preference keys", () => {
    const physicalKey = "environment:/repo/project";
    const legacyKey = legacyProjectCwdPreferenceKey("/repo/project");

    expect(resolveProjectExpanded({ logical: false, [physicalKey]: true }, ["logical"])).toBe(
      false,
    );
    expect(resolveProjectExpanded({ [physicalKey]: false }, ["new-logical", physicalKey])).toBe(
      false,
    );
    expect(resolveProjectExpanded({ [legacyKey]: false }, ["new-logical", legacyKey])).toBe(false);
    expect(resolveProjectExpanded({}, ["new-logical"])).toBe(true);
  });

  it("sets expansion for every stable key belonging to a logical project", () => {
    const initialState = makeUiState();
    const keys = ["logical", "environment-a:/repo", "environment-b:/repo"];

    const next = setProjectExpanded(initialState, keys, false);

    expect(next.projectExpandedById).toEqual({
      logical: false,
      "environment-a:/repo": false,
      "environment-b:/repo": false,
    });
    expect(setProjectExpanded(next, keys, false)).toBe(next);
  });

  it("reorders from the current atom-derived project order", () => {
    const project1 = ProjectId.make("project-1");
    const project2 = ProjectId.make("project-2");
    const project3 = ProjectId.make("project-3");
    const currentOrder = [project1, project2, project3];

    const next = reorderProjects(makeUiState(), currentOrder, [project1], [project3]);

    expect(next.projectOrder).toEqual([project2, project3, project1]);
  });

  it("moves grouped project members together", () => {
    const keyALocal = "env-local:proj-a";
    const keyARemote = "env-remote:proj-a";
    const keyB = "env-local:proj-b";
    const keyC = "env-local:proj-c";
    const currentOrder = [keyALocal, keyARemote, keyB, keyC];

    const next = reorderProjects(makeUiState(), currentOrder, [keyALocal, keyARemote], [keyC]);

    expect(next.projectOrder).toEqual([keyB, keyC, keyALocal, keyARemote]);
  });

  it("does not reorder missing or identical groups", () => {
    const currentOrder = ["env-local:proj-a", "env-local:proj-b"];
    const state = makeUiState();

    expect(reorderProjects(state, currentOrder, ["env-local:missing"], ["env-local:proj-b"])).toBe(
      state,
    );
    expect(reorderProjects(state, currentOrder, ["env-local:proj-a"], ["env-local:proj-a"])).toBe(
      state,
    );
  });

  it("stores explicit changed-file expansion choices", () => {
    const threadId = ThreadId.make("thread-1");
    const collapsed = setThreadChangedFilesExpanded(makeUiState(), threadId, "turn-1", false);

    expect(collapsed.threadChangedFilesExpandedById).toEqual({
      [threadId]: {
        "turn-1": false,
      },
    });
    expect(
      setThreadChangedFilesExpanded(collapsed, threadId, "turn-1", true)
        .threadChangedFilesExpandedById,
    ).toEqual({
      [threadId]: {
        "turn-1": true,
      },
    });
  });

  it("stores the endpoint preference by stable key", () => {
    const next = setDefaultAdvertisedEndpointKey(makeUiState(), "desktop-core:lan:http");

    expect(next.defaultAdvertisedEndpointKey).toBe("desktop-core:lan:http");
    expect(setDefaultAdvertisedEndpointKey(next, "desktop-core:lan:http")).toBe(next);
    expect(setDefaultAdvertisedEndpointKey(next, "")).toMatchObject({
      defaultAdvertisedEndpointKey: null,
    });
  });
});

describe("parsePersistedState", () => {
  it("hydrates raw UI-owned state without server entities", () => {
    const parsed = parsePersistedState({
      projectExpandedById: {
        logical: false,
        invalid: "no" as unknown as boolean,
      },
      projectOrder: ["physical-b", "", "physical-a", "physical-b"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
        invalid: "not-a-date",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpansionVersion: 1,
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      terminalCenterByProjectId: {},
      terminalWorkspacesByProjectId: {},
    });

    expect(parsed).toEqual({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      terminalCenterByProjectId: {},
      terminalWorkspacesByProjectId: {},
    });
  });

  it("ignores changed-file expansion values saved with legacy folder semantics", () => {
    const parsed = parsePersistedState({
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
        },
      },
    });

    expect(parsed.threadChangedFilesExpandedById).toEqual({});
  });

  it("migrates legacy CWD project preferences into local alias keys", () => {
    const parsed = parsePersistedState({
      collapsedProjectCwds: ["/repo/b"],
      expandedProjectCwds: ["/repo/a"],
      projectOrderCwds: ["/repo/b", "/repo/a"],
    });
    const projectAKey = legacyProjectCwdPreferenceKey("/repo/a");
    const projectBKey = legacyProjectCwdPreferenceKey("/repo/b");

    expect(parsed.projectOrder).toEqual([projectBKey, projectAKey]);
    expect(resolveProjectExpanded(parsed.projectExpandedById, [projectAKey])).toBe(true);
    expect(resolveProjectExpanded(parsed.projectExpandedById, [projectBKey])).toBe(false);
    expect(resolveProjectExpanded(parsed.projectExpandedById, ["unknown"])).toBe(true);
  });

  it("preserves legacy expanded-only semantics for one-way migration", () => {
    const parsed = parsePersistedState({
      expandedProjectCwds: ["/repo/a"],
    });

    expect(
      resolveProjectExpanded(parsed.projectExpandedById, [
        legacyProjectCwdPreferenceKey("/repo/a"),
      ]),
    ).toBe(true);
    expect(
      resolveProjectExpanded(parsed.projectExpandedById, [
        legacyProjectCwdPreferenceKey("/repo/b"),
      ]),
    ).toBe(false);
  });
});

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("uiStateStore persistence", () => {
  let localStorageStub: Storage;

  beforeEach(() => {
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal("window", { localStorage: localStorageStub });
    vi.stubGlobal("localStorage", localStorageStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists raw UI preferences including thread visit markers", () => {
    const state = makeUiState({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
    });

    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(persisted).toEqual({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpansionVersion: 1,
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      terminalCenterByProjectId: {},
      terminalWorkspacesByProjectId: {},
    });
    expect(parsePersistedState(persisted)).toEqual({
      ...state,
    });
  });

  it("drops the temporary expanded-only migration fallback when rewriting state", () => {
    const migrated = parsePersistedState({
      expandedProjectCwds: ["/repo/a"],
    });

    persistState(migrated);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(resolveProjectExpanded(persisted.projectExpandedById ?? {}, ["unknown"])).toBe(true);
  });
});
