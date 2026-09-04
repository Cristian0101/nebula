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
    updateActiveWorkspace: () => {},
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
    await h.run();
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
