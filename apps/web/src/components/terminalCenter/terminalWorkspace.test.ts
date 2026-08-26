import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_TERMINAL_CENTER_STATE } from "./terminalCenterLogic";
import {
  createDefaultTerminalWorkspaceProjectState,
  createTerminalWorkspacePane,
  firstAvailableGridPlacement,
  hideWorkspacePane,
  migrateTerminalCanvasToWorkspace,
  movePaneToGrid,
  restoreWorkspacePane,
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
        workspacePath: "/projects/160",
        visible: true,
      }),
    ]);
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
});
