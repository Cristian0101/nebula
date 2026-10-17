import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  TaskId,
  ThreadId,
  IntegrationBatchId,
  type ProjectInventory,
  type ProjectInventoryWorktree,
  type ProjectWorkspaceContext,
} from "@t3tools/contracts";
import {
  appendInventoryPage,
  belongsToProject,
  changesLabel,
  existingPresentations,
  filterWorktree,
  inventoryRecords,
  providerActivity,
  searchWorktree,
  verifiedContext,
  workspaceTerminals,
} from "./branchInventoryModel";
import {
  createDefaultTerminalWorkspaceProjectState,
  createTerminalWorkspacePane,
} from "../../terminalCenter/terminalWorkspace";
const project = {
  environmentId: EnvironmentId.make("host-a"),
  projectId: ProjectId.make("same-id"),
};
const at = "2026-10-17T12:00:00Z";
const workspace: ProjectInventoryWorktree = {
  workspaceKey: "a".repeat(64),
  path: "/fixture/main",
  realPath: "/fixture/main",
  isMain: true,
  headSha: "f".repeat(40),
  branchRef: "refs/heads/main",
  detached: false,
  bare: false,
  locked: false,
  prunable: false,
  headState: "resolved",
  availability: "present",
  membership: "registered",
};
const context: ProjectWorkspaceContext = {
  ...project,
  identity: { ...project, repositoryId: "repo-a", projectRoot: workspace.path },
  workspace,
  state: "available",
  git: {
    headSha: workspace.headSha,
    branchRef: workspace.branchRef,
    detached: false,
    trackedChanges: 2,
    untrackedCount: 1,
  },
  taskIds: [TaskId.make("task-a")],
  missionIds: [],
  integrationBatchIds: [IntegrationBatchId.make("batch-a")],
  threadIds: [ThreadId.make("thread-a"), ThreadId.make("thread-b")],
  providerSessions: [],
  terminalActivity: "requires-terminal-api",
  processActivity: "not-observed",
  externalServices: "not-observed",
  observations: [
    {
      subject: "associations",
      source: "projection",
      observedAt: at,
      cache: "live",
      ageMs: 0,
      completeness: "complete",
    },
  ],
  issues: [],
};
const page: ProjectInventory = {
  ...project,
  identity: context.identity,
  state: "available",
  worktrees: [workspace],
  refs: [
    {
      name: "unattached",
      fullRefName: "refs/heads/unattached",
      kind: "local",
      headSha: "e".repeat(40),
      committedAt: at,
      upstreamRef: null,
      workspaceKeys: [],
    },
  ],
  nextCursor: { snapshotId: "1".repeat(64), refs: 100, worktrees: 1 },
  totals: { refs: 101, worktrees: 1 },
  observations: [],
  issues: [],
  remoteFreshness: "not-verified",
  refresh: "not-requested",
};
describe("read-only Branches inventory", () => {
  it("keeps main first and stable keys for missing, detached, locked, prunable and linked registrations", () => {
    const linked = {
      ...workspace,
      workspaceKey: "b".repeat(64),
      isMain: false,
      path: "/fixture/linked",
      realPath: null,
      detached: true,
      branchRef: null,
      availability: "missing" as const,
      locked: true,
      prunable: true,
    };
    const records = inventoryRecords([
      { ...page, worktrees: [linked, workspace] },
      { ...page, worktrees: [linked] },
    ]);
    expect(records.worktrees).toEqual([workspace, linked]);
    expect(searchWorktree(linked, "detached")).toBe(true);
    expect(searchWorktree(linked, "LINKED")).toBe(true);
  });
  it("retains full local/remote identity and excludes refs checked out anywhere", () => {
    const remote = {
      ...page.refs[0]!,
      fullRefName: "refs/remotes/origin/unattached",
      kind: "remote-tracking" as const,
    };
    const records = inventoryRecords([
      {
        ...page,
        refs: [
          remote,
          {
            ...page.refs[0]!,
            fullRefName: "refs/heads/main",
            workspaceKeys: [workspace.workspaceKey],
          },
          ...page.refs,
        ],
      },
    ]);
    expect(records.refs.map((ref) => ref.fullRefName)).toEqual([
      "refs/heads/unattached",
      "refs/remotes/origin/unattached",
    ]);
    expect(records.refs[0]).not.toHaveProperty("dirty");
  });
  it("does not mix environments or generations, including stale pagination", () => {
    expect(
      belongsToProject({ ...project, environmentId: EnvironmentId.make("host-b") }, project),
    ).toBe(false);
    expect(appendInventoryPage([page], { ...page, issues: ["stale-cursor"] })).toBeNull();
    expect(
      appendInventoryPage([page], {
        ...page,
        nextCursor: { ...page.nextCursor!, snapshotId: "2".repeat(64) },
      }),
    ).toBeNull();
    expect(
      appendInventoryPage([page], { ...page, environmentId: EnvironmentId.make("host-b") }),
    ).toBeNull();
    expect(appendInventoryPage([page], { ...page, nextCursor: null })?.length).toBe(2);
  });
  it("rejects a changed observation on a final page even without a next cursor", () => {
    const observation = {
      subject: "refs" as const,
      source: "local-git" as const,
      observedAt: at,
      cache: "cached" as const,
      ageMs: 0,
      completeness: "complete" as const,
    };
    const first = { ...page, observations: [observation] };
    expect(
      appendInventoryPage([first], {
        ...page,
        nextCursor: null,
        observations: [{ ...observation, observedAt: "2026-10-17T13:00:00Z" }],
      }),
    ).toBeNull();
  });
  it("does not substitute context for identical branches on another host or workspace", () => {
    expect(
      verifiedContext(
        context,
        { ...project, environmentId: EnvironmentId.make("host-b") },
        workspace,
      ),
    ).toBeNull();
    expect(verifiedContext(context, project, { ...workspace, workspaceKey: "wrong" })).toBeNull();
    expect(verifiedContext(context, project, workspace)?.threadIds).toHaveLength(2);
  });
  it("shows unknown instead of clean until tracked and untracked state are observed", () => {
    expect(changesLabel(null)).toBe("Changes unknown");
    expect(changesLabel({ ...context, git: null })).toBe("Changes unknown");
    expect(changesLabel(context)).toBe("2 tracked · 1 untracked");
    expect(
      changesLabel({ ...context, git: { ...context.git!, trackedChanges: 0, untrackedCount: 0 } }),
    ).toMatch(/^Clean/);
  });
  it("filters only observed facts and preserves unknown coverage offline or incomplete", () => {
    expect(filterWorktree(workspace, undefined, "Task-owned", true)).toBe("unknown");
    expect(filterWorktree(workspace, context, "Has changes", true)).toBe("match");
    expect(filterWorktree(workspace, context, "Task-owned", true)).toBe("match");
    expect(filterWorktree(workspace, context, "Has changes", false)).toBe("unknown");
    expect(filterWorktree(workspace, { ...context, taskIds: [] }, "Task-owned", true)).toBe(
      "exclude",
    );
    expect(
      filterWorktree(workspace, { ...context, taskIds: [], observations: [] }, "Task-owned", true),
    ).toBe("unknown");
    expect(filterWorktree(workspace, context, "Active", true)).toBe("unknown");
  });
  it("does not reinterpret ambiguous ownership as an exclusive owner", () => {
    const ambiguous = {
      ...context,
      state: "partial" as const,
      issues: ["ambiguous-ownership" as const],
      taskIds: [TaskId.make("task-a"), TaskId.make("task-b")],
    };
    expect(verifiedContext(ambiguous, project, workspace)?.taskIds).toHaveLength(2);
    expect(verifiedContext(ambiguous, project, workspace)?.integrationBatchIds).toEqual(
      context.integrationBatchIds,
    );
  });
  it("maps only supported provider record vocabulary without inferring process liveness", () => {
    expect(
      ["connecting", "ready", "running", "error", "closed"].map((status) =>
        providerActivity(status as never),
      ),
    ).toEqual(["Unknown", "Ready", "Running", "Unavailable", "Stopped"]);
  });
  it("opens only existing presentations with exact paths and compatible canonical associations", () => {
    const layout = createDefaultTerminalWorkspaceProjectState({
      projectId: "project",
      workspacePath: workspace.path,
      now: at,
    }).workspaces[0]!;
    const pane = createTerminalWorkspacePane({
      id: "pane",
      type: "shell",
      title: "Shell",
      workspacePath: workspace.path,
      threadId: "thread-a",
      terminalId: "existing",
      now: at,
    });
    const saved = { ...layout, panes: [pane] };
    expect(existingPresentations(context, [saved])).toHaveLength(1);
    expect(
      existingPresentations(context, [{ ...saved, panes: [{ ...pane, threadId: "foreign" }] }]),
    ).toEqual([]);
    expect(existingPresentations({ ...context, issues: ["repository-mismatch"] }, [saved])).toEqual(
      [],
    );
    expect(
      existingPresentations({ ...context, workspace: { ...workspace, realPath: null } }, [saved]),
    ).toEqual([]);
    expect(existingPresentations(context, [])).toEqual([]);
    expect(
      existingPresentations(context, [
        { ...saved, panes: [{ ...pane, workspacePath: "/renderer-alias" }] },
      ]),
    ).toEqual([]);
  });
  it("never assigns a terminal from a matching port/path or unknown Thread", () => {
    const terminal = {
      threadId: "thread-a",
      terminalId: "existing",
      cwd: workspace.path,
      worktreePath: null,
      status: "running" as const,
      pid: 999,
      exitCode: null,
      exitSignal: null,
      hasRunningSubprocess: true,
      label: "fixture",
      updatedAt: at,
    };
    expect(workspaceTerminals(context, [], [terminal], project.projectId)).toEqual([terminal]);
    expect(
      workspaceTerminals(context, [], [{ ...terminal, threadId: "foreign" }], project.projectId),
    ).toEqual([]);
    expect(
      workspaceTerminals(context, [], [{ ...terminal, cwd: "/different" }], project.projectId),
    ).toEqual([]);
  });
});
