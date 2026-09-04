import source from "./ProjectTerminalWorkspace.tsx?raw";
import { describe, expect, it, vi } from "vite-plus/test";
import { resolveAgentWorkspace } from "./agentWorkspace";

// Execute the production callback with synthetic RPCs, without mounting the workspace UI.
const callback = source
  .split("const launchProviderTerminal = useCallback(")[1]!
  .split("    ) => {")[1]!
  .split("\n    },\n    [")[0]!;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function harness(workspacePath: string, failOpen = false) {
  const panes: unknown[] = [];
  const openTerminal = vi.fn(async () => (failOpen ? { failed: true } : {}));
  const writeTerminal = vi.fn(async () => ({}));
  const reportError = vi.fn();
  const removeWorkspacePane = vi.fn((workspace) => workspace);
  const values = {
    entry: { instanceId: "codex", displayName: "Codex" },
    task: null,
    linkedPaneId: "chat-pane",
    originWorkspace: { cwd: workspacePath, worktreePath: workspacePath },
    providerTerminalLaunches: new Map([["codex", { command: "codex", env: {} }]]),
    isProviderInstancePickerReady: () => true,
    reportError,
    randomUUID: () => "id",
    project: { id: "project", environmentId: "environment", workspaceRoot: "/source" },
    addPane: (pane: object) => {
      panes.push(pane);
      return { ...pane, id: "terminal" };
    },
    hostThreadId: "terminal-host",
    updateActiveWorkspace: (update: (workspace: object) => object) => update({}),
    removeWorkspacePane,
    activateWorkspaceLayoutPane: (workspace: object) => workspace,
    linkAgentPaneViews: () => {},
    openTerminal,
    writeTerminal,
    commandFailure: (result: { failed?: boolean }) => result.failed,
    resolveAgentWorkspace,
  };
  return {
    openTerminal,
    writeTerminal,
    reportError,
    removeWorkspacePane,
    panes,
    run: () => new AsyncFunction(...Object.keys(values), callback)(...Object.values(values)),
  };
}

describe("Chat to Terminal production launch", () => {
  it("opens and starts the agent in the originating Chat worktree", async () => {
    const h = harness("/chat-worktree");
    await h.run();
    expect(h.openTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ cwd: "/chat-worktree", worktreePath: "/chat-worktree" }),
      }),
    );
    expect(h.panes[0]).toMatchObject({ workspacePath: "/chat-worktree" });
    expect(h.writeTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ data: "codex\r" }) }),
    );
  });
  it("never writes an agent command when the worktree cannot be opened", async () => {
    const h = harness("/missing", true);
    expect(await h.run()).toBeNull();
    expect(h.removeWorkspacePane).toHaveBeenCalledWith({}, "terminal");
    expect(h.writeTerminal).not.toHaveBeenCalled();
    expect(h.reportError).toHaveBeenCalled();
  });
});

it.each(["terminal", "chat"])(
  "switching to %s passes each canonical workspace to launch",
  async (surface) => {
    const body = source
      .split("const switchAgentSurface = useCallback(")[1]!
      .split('surface: "chat" | "terminal") => {')[1]!
      .split("\n    },\n    [")[0]!;
    const launchProviderTerminal = vi.fn();
    const panes = ["a", "b"].map((id) => ({
      id,
      threadId: id,
      agentSurface: surface === "terminal" ? "chat" : "terminal",
      workspacePath: `/pane-${id}`,
    }));
    for (const pane of panes) {
      const values = {
        pane,
        surface,
        project: { id: "project", workspaceRoot: "/source" },
        activeWorkspace: { id: "workspace" },
        useUiStateStore: {
          getState: () => ({
            terminalWorkspacesByProjectId: {
              project: { workspaces: [{ id: "workspace", panes }] },
            },
          }),
        },
        threadById: new Map(
          panes.map((p) => [
            p.id,
            { worktreePath: `/chat-${p.id}`, modelSelection: { instanceId: "codex" } },
          ]),
        ),
        ThreadId: { make: (id: string) => id },
        TaskId: { make: (id: string) => id },
        taskById: new Map(),
        providerEntries: [{ instanceId: "codex" }],
        agentSurfaceLaunchesRef: { current: new Set() },
        launchProviderTerminal,
        launchProvider: launchProviderTerminal,
        reportError: vi.fn(),
        resolveAgentWorkspace,
      };
      await new AsyncFunction(...Object.keys(values), body)(...Object.values(values));
    }
    expect(
      launchProviderTerminal.mock.calls.map((call) => call[surface === "terminal" ? 3 : 4]),
    ).toEqual([
      { cwd: "/chat-a", worktreePath: "/chat-a" },
      { cwd: "/chat-b", worktreePath: "/chat-b" },
    ]);
  },
);

it("publishes an added pane before returning it to a surface launcher", () => {
  const body = source
    .split("const addPane = useCallback(")[1]!
    .split("    ) => {")[1]!
    .split("\n    },\n    [")[0]!;
  let state = { workspaces: [{ id: "workspace", panes: [] as object[], gridPreset: "auto" }] };
  const deferredTransitions: Array<() => void> = [];
  const values = {
    input: { type: "shell", workspacePath: "/chat-worktree" },
    activeWorkspace: state.workspaces[0],
    useUiStateStore: { getState: () => ({ terminalWorkspacesByProjectId: { project: state } }) },
    project: { id: "project", workspaceRoot: "/source" },
    taskById: new Map(),
    TaskId: { make: (id: string) => id },
    reportError: vi.fn(),
    firstAvailableGridPlacement: () => null,
    terminalWorkspaceGridDimensions: () => ({ columns: 4, rows: 4 }),
    addAt: null,
    createTerminalWorkspacePane: (pane: object) => pane,
    randomUUID: () => "terminal",
    runTerminalWorkspaceLayoutTransition: (update: () => void) => deferredTransitions.push(update),
    persistProjectState: (next: typeof state) => {
      state = next;
    },
    updateWorkspace: (
      current: typeof state,
      id: string,
      update: (workspace: object) => object,
    ) => ({
      ...current,
      workspaces: current.workspaces.map((workspace) =>
        workspace.id === id ? update(workspace) : workspace,
      ),
    }),
    movePaneInWorkspaceLayout: (workspace: object) => workspace,
    quickAddTargetStackId: null,
    setAddPaneOpen: vi.fn(),
    setAddAt: vi.fn(),
    setQuickAddTargetStackId: vi.fn(),
  };
  const pane = new Function(...Object.keys(values), body)(...Object.values(values));
  expect(state.workspaces[0]?.panes).toContainEqual(pane);
  expect(pane).toMatchObject({ id: "terminal", workspacePath: "/chat-worktree" });
});

it("keeps Design capture text after React releases the change event", () => {
  const handler = source
    .split('aria-label="Design capture note"')[1]!
    .split("onChange={(event) =>")[1]!
    .split("className=")[0]!
    .trim()
    .slice(0, -1);
  type Capture = { comment: string; id: string } | null;
  let deferred: ((current: Capture) => Capture) | undefined;
  const onChange = new Function("setDesignCapture", `return (event) => ${handler}`)(
    (update: (current: Capture) => Capture) => {
      deferred = update;
    },
  );
  const event = { currentTarget: { value: "Scoped fixture note" } as { value: string } | null };
  onChange(event);
  event.currentTarget = null;
  expect(deferred?.({ id: "capture", comment: "" })).toEqual({
    id: "capture",
    comment: "Scoped fixture note",
  });
  expect(deferred?.(null)).toBeNull();
});

it("routes agent menu choices through format restoration before surface reuse", () => {
  const body = source
    .split("{configurablePaneFormats.map")[1]!
    .split("onClick={() => {")[1]!
    .split("}} ")[0]!
    .split("}}\n")[0]!;
  const onChangePaneFormat = vi.fn();
  const onSwitchAgentSurface = vi.fn();
  new Function("onChangePaneFormat", "onSwitchAgentSurface", "surface", "type", body)(
    onChangePaneFormat,
    onSwitchAgentSurface,
    "terminal",
    "shell",
  );
  expect(onChangePaneFormat).toHaveBeenCalledWith("shell");
  expect(onSwitchAgentSurface).not.toHaveBeenCalled();
});
