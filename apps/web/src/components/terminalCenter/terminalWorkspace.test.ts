import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_TERMINAL_CENTER_STATE } from "./terminalCenterLogic";
import {
  createDefaultTerminalWorkspaceProjectState,
  createTerminalWorkspacePane,
  firstAvailableGridPlacement,
  hideWorkspacePane,
  migrateTerminalCanvasToWorkspace,
  movePaneToGrid,
  removeWorkspacePane,
  reflowWorkspaceGrid,
  restoreWorkspacePane,
  terminalWorkspaceGridDimensions,
  terminalWorkspaceHostThreadId,
} from "./terminalWorkspace";

const now = "2026-08-26T12:00:00.000Z";

describe("Terminal Workspace composition", () => {
  it("uses a stable short terminal host id so persisted log paths remain portable", () => {
    const id = terminalWorkspaceHostThreadId("project-with-a-long-id", "workspace-with-a-long-id");
    expect(id).toBe(
      terminalWorkspaceHostThreadId("project-with-a-long-id", "workspace-with-a-long-id"),
    );
    expect(id.length).toBeLessThanOrEqual(40);
    expect(id).not.toBe(
      terminalWorkspaceHostThreadId("project-with-a-long-id", "another-workspace"),
    );
  });

  it("creates a Default workspace with one real Shell reference", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "project-160",
      workspacePath: "/projects/160",
      now,
    });

    expect(state.activeWorkspaceId).toBe("project-160:terminal-workspace:default");
    expect(state.workspaces[0]).toMatchObject({
      name: "Default",
      layout: "grid",
      selectedPaneId: "project-160:terminal-workspace:default:shell",
    });
    expect(state.workspaces[0]?.panes).toEqual([
      expect.objectContaining({
        type: "shell",
        terminalId: "workspace-shell-1",
        taskId: null,
        workspacePath: "/projects/160",
        visible: true,
      }),
    ]);
  });

  it("persists an optional canonical Task binding without changing pane identity", () => {
    const pane = createTerminalWorkspacePane({
      id: "task-shell",
      type: "shell",
      title: "Task Shell",
      taskId: "task-campaign-ui",
      workspacePath: "/repo/.nebula/task-campaign-ui",
      now,
    });

    expect(pane).toMatchObject({
      id: "task-shell",
      taskId: "task-campaign-ui",
      workspacePath: "/repo/.nebula/task-campaign-ui",
    });
  });

  it("migrates only persisted legacy canvas membership", () => {
    const state = migrateTerminalCanvasToWorkspace({
      projectId: "project-160",
      workspacePath: "/projects/160",
      legacy: {
        ...DEFAULT_TERMINAL_CENTER_STATE,
        visibleThreadIds: ["thread-a", "thread-c"],
      },
      now,
    });

    expect(state.workspaces[0]?.panes.map((pane) => pane.threadId)).toEqual([
      "thread-a",
      "thread-c",
    ]);
  });

  it("migrates at most sixteen legacy panes visibly without overlapping", () => {
    const threadIds = Array.from({ length: 18 }, (_, index) => `thread-${index}`);
    const state = migrateTerminalCanvasToWorkspace({
      projectId: "project-160",
      workspacePath: "/projects/160",
      legacy: { ...DEFAULT_TERMINAL_CENTER_STATE, visibleThreadIds: threadIds },
      now,
    });
    const panes = state.workspaces[0]!.panes;
    const visible = panes.filter((pane) => pane.visible);

    expect(panes).toHaveLength(18);
    expect(visible).toHaveLength(16);
    expect(new Set(visible.map((pane) => `${pane.grid.column}:${pane.grid.row}`)).size).toBe(16);
  });

  it("keeps hidden membership hidden and restores it intentionally", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "project-160",
      workspacePath: "/projects/160",
      now,
    });
    const workspace = state.workspaces[0]!;
    const paneId = workspace.panes[0]!.id;
    const hidden = hideWorkspacePane(workspace, paneId, now);

    expect(hidden.panes[0]?.visible).toBe(false);
    expect(hidden.selectedPaneId).toBeNull();
    expect(restoreWorkspacePane(hidden, paneId, now).panes[0]?.visible).toBe(true);
  });

  it("detaches an external server view and its attached Preview without touching other panes", () => {
    const server = createTerminalWorkspacePane({
      id: "external-server",
      type: "dev_server",
      title: "Next · :3002",
      workspacePath: "/repo",
      previewUrl: "http://localhost:3002",
      externalServer: {
        host: "localhost",
        port: 3002,
        url: "http://localhost:3002",
        pid: 42,
        processName: "next-server",
        attachedAt: now,
      },
      now,
    });
    const preview = createTerminalWorkspacePane({
      id: "external-preview",
      type: "preview",
      title: "Next Preview",
      workspacePath: "/repo",
      attachedPaneId: server.id,
      previewUrl: server.previewUrl,
      now,
    });
    const shell = createTerminalWorkspacePane({
      id: "shell",
      type: "shell",
      title: "Shell",
      workspacePath: "/repo",
      now,
    });
    const workspace = {
      id: "workspace",
      name: "Default",
      layout: "grid" as const,
      gridPreset: "auto" as const,
      splitDirection: "horizontal" as const,
      panes: [server, preview, shell],
      selectedPaneId: preview.id,
      focusedPaneId: server.id,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    };

    const detached = removeWorkspacePane(workspace, server.id, now);

    expect(detached.panes.map((pane) => pane.id)).toEqual([shell.id]);
    expect(detached.selectedPaneId).toBeNull();
    expect(detached.focusedPaneId).toBeNull();
  });

  it("finds open cells and rejects overlapping moves on the 4 by 4 grid", () => {
    const first = createTerminalWorkspacePane({
      id: "first",
      type: "shell",
      title: "Shell",
      workspacePath: "/repo",
      grid: { column: 1, row: 1, columnSpan: 2, rowSpan: 2 },
      now,
    });
    const second = createTerminalWorkspacePane({
      id: "second",
      type: "tests",
      title: "Tests",
      workspacePath: "/repo",
      grid: { column: 3, row: 1, columnSpan: 1, rowSpan: 1 },
      now,
    });
    expect(firstAvailableGridPlacement([first, second])).toEqual({
      column: 4,
      row: 1,
      columnSpan: 1,
      rowSpan: 1,
    });

    const workspace = {
      id: "workspace",
      name: "Default",
      layout: "grid" as const,
      splitDirection: "horizontal" as const,
      gridPreset: "auto" as const,
      panes: [first, second],
      selectedPaneId: first.id,
      focusedPaneId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    };
    expect(
      movePaneToGrid(workspace, second.id, {
        column: 2,
        row: 2,
        columnSpan: 1,
        rowSpan: 1,
      }),
    ).toBe(workspace);
  });

  it("fills all sixteen snap cells without overlap", () => {
    const panes = [];
    for (let index = 0; index < 16; index += 1) {
      const grid = firstAvailableGridPlacement(panes);
      expect(grid).not.toBeNull();
      panes.push(
        createTerminalWorkspacePane({
          id: `pane-${index}`,
          type: "shell",
          title: `Shell ${index + 1}`,
          workspacePath: "/repo",
          grid: grid!,
          now,
        }),
      );
    }

    expect(new Set(panes.map((pane) => `${pane.grid.column}:${pane.grid.row}`)).size).toBe(16);
    expect(firstAvailableGridPlacement(panes)).toBeNull();
  });

  it("leaves a hidden pane hidden when the grid has no open cell", () => {
    const panes = Array.from({ length: 16 }, (_, index) =>
      createTerminalWorkspacePane({
        id: `pane-${index}`,
        type: "shell",
        title: `Shell ${index + 1}`,
        workspacePath: "/repo",
        grid: {
          column: (index % 4) + 1,
          row: Math.floor(index / 4) + 1,
          columnSpan: 1,
          rowSpan: 1,
        },
        now,
      }),
    );
    const hidden = {
      ...createTerminalWorkspacePane({
        id: "hidden",
        type: "thread",
        title: "Hidden",
        workspacePath: "/repo",
        now,
      }),
      visible: false,
    };
    const workspace = {
      id: "workspace",
      name: "Default",
      layout: "grid" as const,
      splitDirection: "horizontal" as const,
      gridPreset: "auto" as const,
      panes: [...panes, hidden],
      selectedPaneId: panes[0]!.id,
      focusedPaneId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    };

    expect(restoreWorkspacePane(workspace, hidden.id, now)).toBe(workspace);
  });

  it("restores a hidden pane to its exact saved geometry when the cells remain free", () => {
    const pane = createTerminalWorkspacePane({
      id: "preview",
      type: "preview",
      title: "Preview",
      workspacePath: "/repo",
      grid: { column: 2, row: 2, columnSpan: 2, rowSpan: 2 },
      now,
    });
    const workspace = {
      id: "workspace",
      name: "Default",
      layout: "grid" as const,
      gridPreset: "auto" as const,
      splitDirection: "horizontal" as const,
      panes: [pane],
      selectedPaneId: pane.id,
      focusedPaneId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    };

    const restored = restoreWorkspacePane(hideWorkspacePane(workspace, pane.id, now), pane.id, now);
    expect(restored.panes[0]?.grid).toEqual(pane.grid);
  });

  it("reflows into the selected density while retaining a multi-span preview when it fits", () => {
    const preview = createTerminalWorkspacePane({
      id: "preview",
      type: "preview",
      title: "Preview",
      workspacePath: "/repo",
      grid: { column: 1, row: 1, columnSpan: 2, rowSpan: 2 },
      now,
    });
    const agent = createTerminalWorkspacePane({
      id: "agent",
      type: "thread",
      title: "Codex",
      workspacePath: "/repo",
      grid: { column: 4, row: 4, columnSpan: 1, rowSpan: 1 },
      now,
    });
    const workspace = {
      id: "workspace",
      name: "Default",
      layout: "grid" as const,
      gridPreset: "auto" as const,
      splitDirection: "horizontal" as const,
      panes: [preview, agent],
      selectedPaneId: preview.id,
      focusedPaneId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    };

    const reflowed = reflowWorkspaceGrid(workspace, "3x2", now);
    expect(reflowed.gridPreset).toBe("3x2");
    expect(reflowed.panes[0]?.grid).toEqual({
      column: 1,
      row: 1,
      columnSpan: 2,
      rowSpan: 2,
    });
    expect(reflowed.panes[1]?.grid).toEqual({
      column: 3,
      row: 2,
      columnSpan: 1,
      rowSpan: 1,
    });
    expect(terminalWorkspaceGridDimensions(reflowed)).toEqual({ columns: 3, rows: 2 });
  });

  it("refuses a density that cannot contain every visible pane", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "project-160",
      workspacePath: "/projects/160",
      now,
    });
    const workspace = {
      ...state.workspaces[0]!,
      panes: [
        ...state.workspaces[0]!.panes,
        createTerminalWorkspacePane({
          id: "agent",
          type: "thread",
          title: "Codex",
          workspacePath: "/projects/160",
          grid: { column: 3, row: 1, columnSpan: 1, rowSpan: 1 },
          now,
        }),
      ],
    };
    expect(reflowWorkspaceGrid(workspace, "1x1", now)).toBe(workspace);
  });
});
