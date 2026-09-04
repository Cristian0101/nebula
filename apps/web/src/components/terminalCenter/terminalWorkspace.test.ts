import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";

import { DEFAULT_TERMINAL_CENTER_STATE } from "./terminalCenterLogic";
import {
  activateAgentSurfaceView,
  activateWorkspaceLayoutPane,
  applyWorkspaceLayoutPreset,
  createDefaultTerminalWorkspaceProjectState,
  createTerminalWorkspacePane,
  firstAvailableGridPlacement,
  hideWorkspacePane,
  isWorkspacePaneOnBottomEdge,
  linkAgentPaneViews,
  migrateTerminalCanvasToWorkspace,
  movePaneInWorkspaceLayout,
  movePaneToDock,
  movePaneToGrid,
  providerTerminalLaunchSpec,
  removeEmptyWorkspaceLayoutSlot,
  removeWorkspacePane,
  reflowWorkspaceGrid,
  resolveTerminalWorkspaceProjectServices,
  resolveWorkspacePaneResizeBindings,
  restoreWorkspacePane,
  resizeWorkspaceFloor,
  resizeWorkspaceLayoutSplit,
  setWorkspacePaneFormat,
  TERMINAL_WORKSPACE_LAYOUT_PRESET_DEFINITIONS,
  TERMINAL_WORKSPACE_LAYOUT_PRESETS,
  normalizeWorkspaceLayoutTree,
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
      mode: "workbench",
      workbenchColumnRatios: [32, 28, 40],
      selectedPaneId: "project-160:terminal-workspace:default:shell",
    });
    expect(state.workspaces[0]?.panes).toEqual([
      expect.objectContaining({
        type: "shell",
        terminalId: "workspace-shell-1",
        taskId: null,
        workspacePath: "/projects/160",
        dock: { area: "center", order: 0, stackId: null },
        visible: true,
      }),
    ]);
  });

  it("builds an approval-aware provider terminal command from configured instance settings", () => {
    expect(
      providerTerminalLaunchSpec({
        driverKind: "codex",
        legacyBinaryPath: "codex",
        instanceConfig: {
          binaryPath: "/Applications/Codex Tools/codex",
          homePath: "/tmp/codex-home",
        },
        instanceEnvironment: [
          { name: "VISIBLE_FLAG", value: "enabled" },
          { name: "SECRET_TOKEN", value: "hidden", sensitive: true },
        ],
      }),
    ).toEqual({
      command: "'/Applications/Codex Tools/codex'",
      binaryPath: "/Applications/Codex Tools/codex",
      env: {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "Nebula",
        FORCE_COLOR: "1",
        VISIBLE_FLAG: "enabled",
        CODEX_HOME: "/tmp/codex-home",
      },
    });
    expect(
      providerTerminalLaunchSpec({
        driverKind: "claudeAgent",
        instanceConfig: { homePath: "~/.claude-work" },
      }),
    ).toMatchObject({
      command: 'env CLAUDE_CONFIG_DIR="$HOME"/.claude-work claude',
      env: {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "Nebula",
        FORCE_COLOR: "1",
      },
    });
    expect(providerTerminalLaunchSpec({ driverKind: "fork-only-provider" })).toBeNull();
  });

  it("resolves a running service back to its project Workspace owner", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "nebula",
      workspacePath: "/repo/nebula",
      now,
    });
    const source = state.workspaces[0]!;
    const devPane = createTerminalWorkspacePane({
      id: "dev-pane",
      type: "dev_server",
      title: "Web App",
      workspacePath: "/repo/nebula",
      terminalId: "dev-terminal",
      devServerProfileId: "vite",
      previewUrl: "http://localhost:5174/",
      now,
    });
    const sourceWithServer = { ...source, panes: [...source.panes, devPane] };
    const authWorkspace = {
      ...source,
      id: "nebula:terminal-workspace:auth",
      name: "auth",
      panes: [],
      selectedPaneId: null,
    };
    const terminalThreadId = terminalWorkspaceHostThreadId("nebula", source.id);

    const services = resolveTerminalWorkspaceProjectServices({
      projectId: "nebula",
      workspacePath: "/repo/nebula",
      workspaces: [sourceWithServer, authWorkspace],
      servers: [
        {
          host: "localhost",
          port: 5174,
          url: "http://localhost:5174/",
          processName: "node",
          pid: 42,
          terminal: {
            threadId: ThreadId.make(terminalThreadId),
            terminalId: "dev-terminal",
          },
        },
        {
          host: "localhost",
          port: 13774,
          url: "http://localhost:13774/",
          processName: "node",
          pid: 43,
          terminal: {
            threadId: ThreadId.make(terminalThreadId),
            terminalId: "dev-terminal",
          },
        },
        {
          host: "localhost",
          port: 4321,
          url: "http://localhost:4321/",
          processName: "external",
          pid: 99,
          terminal: null,
        },
      ],
    });

    expect(services).toEqual([
      expect.objectContaining({
        sourceWorkspaceId: source.id,
        sourceWorkspaceName: "Default",
        sourcePaneId: "dev-pane",
        terminalThreadId,
        terminalId: "dev-terminal",
        devServerProfileId: "vite",
        server: expect.objectContaining({ port: 5174 }),
        servers: [
          expect.objectContaining({ port: 5174 }),
          expect.objectContaining({ port: 13774 }),
        ],
      }),
    ]);
  });

  it("links Chat and Terminal surfaces into one persistent tab stack", () => {
    const state = createDefaultTerminalWorkspaceProjectState({
      projectId: "nebula",
      workspacePath: "/repo/nebula",
      now,
    });
    const chat = createTerminalWorkspacePane({
      id: "codex-chat",
      type: "provider",
      title: "Codex Chat",
      workspacePath: "/repo/nebula",
      providerInstanceId: "codex",
      agentSurface: "chat",
      now,
    });
    const terminal = createTerminalWorkspacePane({
      id: "codex-terminal",
      type: "shell",
      title: "Codex Terminal",
      workspacePath: "/repo/nebula",
      providerInstanceId: "codex",
      agentSurface: "terminal",
      now,
    });
    const linked = linkAgentPaneViews(
      { ...state.workspaces[0]!, panes: [chat, terminal] },
      chat.id,
      terminal.id,
      now,
    );

    expect(linked.selectedPaneId).toBe(terminal.id);
    expect(linked.panes).toEqual([
      expect.objectContaining({
        id: chat.id,
        linkedPaneId: terminal.id,
        dock: { area: "left", order: 0, stackId: `agent:${chat.id}` },
      }),
      expect.objectContaining({
        id: terminal.id,
        linkedPaneId: chat.id,
        dock: { area: "left", order: 0, stackId: `agent:${chat.id}` },
      }),
    ]);
    expect(
      removeWorkspacePane(linked, terminal.id, now).panes.find((pane) => pane.id === chat.id)
        ?.linkedPaneId,
    ).toBeNull();

    const chatSelected = activateAgentSurfaceView(linked, terminal.id, "chat", now);
    expect(chatSelected.selectedPaneId).toBe(chat.id);
    expect(chatSelected.layoutTree).toMatchObject({
      kind: "stack",
      paneIds: [chat.id, terminal.id],
      activePaneId: chat.id,
    });

    const preset = applyWorkspaceLayoutPreset(
      linked,
      "2x2",
      { primaryPaneId: chat.id, fillEmpty: true, nodeId: "linked-grid" },
      now,
    );
    const linkedStack = preset.layoutTree?.kind === "split" ? preset.layoutTree.first : null;
    expect(linkedStack).toMatchObject({
      kind: "split",
      first: { kind: "stack", paneIds: [chat.id, terminal.id], activePaneId: chat.id },
    });
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
    expect(visible).toHaveLength(18);
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

  it("docks panes into predictable columns, orders them, and supports tab stacks", () => {
    const agent = createTerminalWorkspacePane({
      id: "agent",
      type: "provider",
      title: "Codex",
      workspacePath: "/repo",
      now,
    });
    const terminal = createTerminalWorkspacePane({
      id: "terminal",
      type: "dev_server",
      title: "Dev Server",
      workspacePath: "/repo",
      now,
    });
    const preview = createTerminalWorkspacePane({
      id: "preview",
      type: "preview",
      title: "Preview",
      workspacePath: "/repo",
      now,
    });
    const workspace = {
      ...createDefaultTerminalWorkspaceProjectState({
        projectId: "project-one",
        workspacePath: "/repo",
        now,
      }).workspaces[0]!,
      panes: [agent, terminal, preview],
    };

    expect(agent.dock?.area).toBe("left");
    expect(terminal.dock?.area).toBe("center");
    expect(preview.dock?.area).toBe("right");

    const moved = movePaneToDock(workspace, terminal.id, {
      area: "left",
      beforePaneId: agent.id,
    });
    expect(moved.panes.find((pane) => pane.id === terminal.id)?.dock).toMatchObject({
      area: "left",
      order: 0,
      stackId: null,
    });
    expect(moved.panes.find((pane) => pane.id === agent.id)?.dock?.order).toBe(1);

    const stacked = movePaneToDock(moved, preview.id, {
      area: "left",
      stackWithPaneId: agent.id,
    });
    const agentStack = stacked.panes.find((pane) => pane.id === agent.id)?.dock?.stackId;
    expect(agentStack).toBe(agent.id);
    expect(stacked.panes.find((pane) => pane.id === preview.id)?.dock?.stackId).toBe(agentStack);
  });

  it("migrates docked panes into a recursive split tree without losing pane identity", () => {
    const shell = createTerminalWorkspacePane({
      id: "shell",
      type: "shell",
      title: "Shell",
      workspacePath: "/repo",
      now,
    });
    const preview = createTerminalWorkspacePane({
      id: "preview",
      type: "preview",
      title: "Preview",
      workspacePath: "/repo",
      now,
    });
    const tree = normalizeWorkspaceLayoutTree(undefined, [shell, preview], [32, 28, 40]);
    const paneIds: string[] = [];
    const visit = (node: typeof tree) => {
      if (node.kind === "stack") {
        paneIds.push(...node.paneIds);
        return;
      }
      visit(node.first);
      visit(node.second);
    };
    visit(tree);
    expect(tree.kind).toBe("split");
    expect(paneIds.toSorted()).toEqual(["preview", "shell"]);
  });

  it("supports nested splits, tab stacks, active tabs, and persisted split ratios", () => {
    const panes = [
      createTerminalWorkspacePane({
        id: "agent",
        type: "thread",
        title: "Agent",
        workspacePath: "/repo",
        now,
      }),
      createTerminalWorkspacePane({
        id: "shell",
        type: "shell",
        title: "Shell",
        workspacePath: "/repo",
        now,
      }),
      createTerminalWorkspacePane({
        id: "preview",
        type: "preview",
        title: "Preview",
        workspacePath: "/repo",
        now,
      }),
    ];
    const workspace = {
      ...createDefaultTerminalWorkspaceProjectState({
        projectId: "project",
        workspacePath: "/repo",
        now,
      }).workspaces[0]!,
      panes,
      selectedPaneId: "agent",
    };
    const split = movePaneInWorkspaceLayout(
      workspace,
      "preview",
      { targetPaneId: "agent", placement: "right", nodeId: "split-preview" },
      now,
    );
    const tabbed = movePaneInWorkspaceLayout(
      split,
      "shell",
      { targetPaneId: "agent", placement: "tab", nodeId: "stack-shell" },
      now,
    );
    const activated = activateWorkspaceLayoutPane(tabbed, "agent");
    const resized = resizeWorkspaceLayoutSplit(activated, "split-preview", 72, now);
    expect(resized.layoutTree).toMatchObject({
      kind: "split",
      id: "split-preview",
      ratio: 72,
      first: { kind: "stack", paneIds: ["agent", "shell"], activePaneId: "agent" },
      second: { kind: "stack", paneIds: ["preview"] },
    });
  });

  it("applies Main + rail and 4 x 4 presets with reusable empty slots", () => {
    const base = createDefaultTerminalWorkspaceProjectState({
      projectId: "project",
      workspacePath: "/repo",
      now,
    }).workspaces[0]!;
    const preview = createTerminalWorkspacePane({
      id: "preview",
      type: "preview",
      title: "Preview",
      workspacePath: "/repo",
      now,
    });
    const workspace = { ...base, panes: [...base.panes, preview], selectedPaneId: preview.id };
    const mainRail = applyWorkspaceLayoutPreset(
      workspace,
      "main_rail",
      { primaryPaneId: preview.id, mainRatio: 70, fillEmpty: true, nodeId: "main-rail" },
      now,
    );
    expect(mainRail.layoutTree).toMatchObject({
      kind: "split",
      direction: "horizontal",
      ratio: 70,
      first: { kind: "stack", paneIds: ["preview"] },
    });

    const grid = applyWorkspaceLayoutPreset(
      workspace,
      "4x4",
      { fillEmpty: true, nodeId: "grid" },
      now,
    );
    let stackCount = 0;
    let emptyCount = 0;
    const visit = (node: NonNullable<typeof grid.layoutTree>) => {
      if (node.kind === "stack") {
        stackCount += 1;
        if (node.paneIds.length === 0) emptyCount += 1;
        return;
      }
      visit(node.first);
      visit(node.second);
    };
    visit(grid.layoutTree!);
    expect(stackCount).toBe(16);
    expect(emptyCount).toBe(14);
  });

  it("collapses a chosen empty slot and renormalizes the remaining visual weights", () => {
    const base = createDefaultTerminalWorkspaceProjectState({
      projectId: "project",
      workspacePath: "/repo",
      now,
    }).workspaces[0]!;
    const shellId = base.panes[0]!.id;
    const workspace = {
      ...base,
      layoutTree: {
        id: "row",
        kind: "split",
        direction: "horizontal",
        ratio: 100 / 3,
        first: { id: "filled", kind: "stack", paneIds: [shellId], activePaneId: shellId },
        second: {
          id: "row:rest",
          kind: "split",
          direction: "horizontal",
          ratio: 50,
          first: { id: "empty-middle", kind: "stack", paneIds: [], activePaneId: null },
          second: { id: "empty-right", kind: "stack", paneIds: [], activePaneId: null },
        },
      } as const,
    };

    const collapsed = removeEmptyWorkspaceLayoutSlot(
      workspace,
      "empty-middle",
      "2026-08-26T12:01:00.000Z",
    );
    expect(collapsed.layoutTree).toMatchObject({
      id: "row",
      kind: "split",
      direction: "horizontal",
      first: { id: "filled", paneIds: [shellId] },
      second: { id: "empty-right", paneIds: [] },
    });
    expect(collapsed.layoutTree?.kind).toBe("split");
    if (collapsed.layoutTree?.kind === "split") {
      expect(collapsed.layoutTree.ratio).toBeCloseTo(50, 4);
    }
    expect(collapsed.updatedAt).toBe("2026-08-26T12:01:00.000Z");
    expect(removeEmptyWorkspaceLayoutSlot(workspace, "filled", now)).toBe(workspace);
  });

  it("adds a pane to the empty slot the user chose", () => {
    const base = createDefaultTerminalWorkspaceProjectState({
      projectId: "project",
      workspacePath: "/repo",
      now,
    }).workspaces[0]!;
    const pane = createTerminalWorkspacePane({
      id: "new-pane",
      type: "shell",
      title: "New pane",
      workspacePath: "/repo",
      now,
    });
    const workspace = applyWorkspaceLayoutPreset(
      { ...base, panes: [...base.panes, pane] },
      "three_columns",
      { fillEmpty: true, nodeId: "columns" },
      now,
    );
    const moved = movePaneInWorkspaceLayout(
      workspace,
      pane.id,
      { targetPaneId: null, targetStackId: "columns:cell:2", placement: "tab" },
      now,
    );

    const target = moved.layoutTree?.kind === "split" ? moved.layoutTree.second : null;
    expect(target?.kind).toBe("split");
    if (target?.kind === "split") {
      expect(target.second).toMatchObject({ id: "columns:cell:2", paneIds: [pane.id] });
    }
  });

  it("offers twenty grouped presets and retains every visible pane in each one", () => {
    expect(TERMINAL_WORKSPACE_LAYOUT_PRESETS).toHaveLength(20);
    expect(TERMINAL_WORKSPACE_LAYOUT_PRESET_DEFINITIONS).toHaveLength(20);
    expect(
      Object.fromEntries(
        ["essentials", "focus", "build", "review", "dense"].map((group) => [
          group,
          TERMINAL_WORKSPACE_LAYOUT_PRESET_DEFINITIONS.filter((preset) => preset.group === group)
            .length,
        ]),
      ),
    ).toEqual({ essentials: 4, focus: 4, build: 4, review: 4, dense: 4 });

    const panes = [
      createTerminalWorkspacePane({
        id: "agent",
        type: "provider",
        title: "Agent",
        providerInstanceId: "codex",
        agentSurface: "chat",
        workspacePath: "/repo",
        now,
      }),
      createTerminalWorkspacePane({
        id: "preview",
        type: "preview",
        title: "Preview",
        workspacePath: "/repo",
        now,
      }),
      createTerminalWorkspacePane({
        id: "logs",
        type: "logs",
        title: "Logs",
        workspacePath: "/repo",
        now,
      }),
    ];
    const base = {
      ...createDefaultTerminalWorkspaceProjectState({
        projectId: "project",
        workspacePath: "/repo",
        now,
      }).workspaces[0]!,
      panes,
      selectedPaneId: "agent",
    };
    for (const preset of TERMINAL_WORKSPACE_LAYOUT_PRESETS) {
      const result = applyWorkspaceLayoutPreset(
        base,
        preset,
        { fillEmpty: true, nodeId: `preset:${preset}` },
        now,
      );
      const paneIds: string[] = [];
      const visit = (node: NonNullable<typeof result.layoutTree>) => {
        if (node.kind === "stack") {
          paneIds.push(...node.paneIds);
          return;
        }
        visit(node.first);
        visit(node.second);
      };
      visit(result.layoutTree!);
      expect(paneIds.sort(), preset).toEqual(["agent", "logs", "preview"]);
    }
  });

  it("resolves all shared pane edges from nested split ancestry", () => {
    const panes = ["main", "rail-top", "rail-bottom"].map((id) =>
      createTerminalWorkspacePane({
        id,
        type: "shell",
        title: id,
        workspacePath: "/repo",
        now,
      }),
    );
    const base = {
      ...createDefaultTerminalWorkspaceProjectState({
        projectId: "project",
        workspacePath: "/repo",
        now,
      }).workspaces[0]!,
      panes,
      selectedPaneId: "main",
    };
    const workspace = applyWorkspaceLayoutPreset(
      base,
      "main_rail",
      { fillEmpty: true, nodeId: "main-rail" },
      now,
    );

    expect(resolveWorkspacePaneResizeBindings(workspace.layoutTree!, "main")).toMatchObject([
      { edge: "right", nodeId: "main-rail", direction: "horizontal" },
    ]);
    expect(resolveWorkspacePaneResizeBindings(workspace.layoutTree!, "rail-top")).toMatchObject([
      { edge: "bottom", direction: "vertical" },
      { edge: "left", nodeId: "main-rail", direction: "horizontal" },
    ]);
    expect(resolveWorkspacePaneResizeBindings(workspace.layoutTree!, "rail-bottom")).toMatchObject([
      { edge: "top", direction: "vertical" },
      { edge: "left", nodeId: "main-rail", direction: "horizontal" },
    ]);
  });

  it("extends the Workbench below bottom panes without changing pane identity", () => {
    const panes = ["top", "bottom"].map((id) =>
      createTerminalWorkspacePane({
        id,
        type: "shell",
        title: id,
        workspacePath: "/repo",
        now,
      }),
    );
    const workspace = {
      ...createDefaultTerminalWorkspaceProjectState({
        projectId: "project",
        workspacePath: "/repo",
        now,
      }).workspaces[0]!,
      panes,
      layoutTree: {
        id: "floor-split",
        kind: "split" as const,
        direction: "vertical" as const,
        ratio: 60,
        first: {
          id: "top-stack",
          kind: "stack" as const,
          paneIds: ["top"],
          activePaneId: "top",
        },
        second: {
          id: "bottom-stack",
          kind: "stack" as const,
          paneIds: ["bottom"],
          activePaneId: "bottom",
        },
      },
    };

    expect(isWorkspacePaneOnBottomEdge(workspace.layoutTree, "top")).toBe(false);
    expect(isWorkspacePaneOnBottomEdge(workspace.layoutTree, "bottom")).toBe(true);

    const resized = resizeWorkspaceFloor(
      workspace,
      1_240,
      [{ nodeId: "floor-split", ratio: 41 }],
      now,
    );
    expect(resized.workbenchCanvasHeight).toBe(1_240);
    expect(resized.layoutTree).toMatchObject({ id: "floor-split", ratio: 41 });
    expect(resized.panes).toEqual(panes);
    expect(resizeWorkspaceFloor(workspace, 99_999, [], now).workbenchCanvasHeight).toBe(6_000);
  });

  it("resolves both sides of each axis for middle cells in dense grids", () => {
    const panes = Array.from({ length: 9 }, (_, index) =>
      createTerminalWorkspacePane({
        id: `pane-${index + 1}`,
        type: "shell",
        title: `Pane ${index + 1}`,
        workspacePath: "/repo",
        now,
      }),
    );
    const base = {
      ...createDefaultTerminalWorkspaceProjectState({
        projectId: "project",
        workspacePath: "/repo",
        now,
      }).workspaces[0]!,
      panes,
      selectedPaneId: "pane-1",
    };
    const workspace = applyWorkspaceLayoutPreset(
      base,
      "3x3",
      { fillEmpty: true, nodeId: "dense-grid" },
      now,
    );

    expect(
      resolveWorkspacePaneResizeBindings(workspace.layoutTree!, "pane-5")
        .map((binding) => binding.edge)
        .toSorted(),
    ).toEqual(["bottom", "left", "right", "top"]);
  });

  it("changes a pane format without changing canonical identity or geometry", () => {
    const pane = createTerminalWorkspacePane({
      id: "codex",
      type: "provider",
      title: "Codex",
      taskId: "task",
      threadId: "thread",
      providerInstanceId: "codex",
      agentSurface: "chat",
      workspacePath: "/repo",
      now,
    });
    const base = {
      ...createDefaultTerminalWorkspaceProjectState({
        projectId: "project",
        workspacePath: "/repo",
        now,
      }).workspaces[0]!,
      panes: [pane],
      selectedPaneId: pane.id,
    };
    const changed = setWorkspacePaneFormat(
      base,
      pane.id,
      { type: "diff", title: "Working Diff" },
      now,
    );

    expect(changed.layoutTree).toBe(base.layoutTree);
    expect(changed.panes[0]).toMatchObject({
      id: pane.id,
      type: "diff",
      title: "Working Diff",
      taskId: "task",
      threadId: "thread",
      providerInstanceId: "codex",
      agentSurface: "chat",
    });
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
