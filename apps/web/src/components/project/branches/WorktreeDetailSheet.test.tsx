import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  TaskId,
  ThreadId,
  ProviderInstanceId,
  ProviderDriverKind,
  type ProjectWorkspaceContext,
  type ProjectInventoryWorktree,
} from "@t3tools/contracts";
import { WorktreeDetailSheet } from "./WorktreeDetailSheet";
const f = vi.hoisted(() => ({
  context: null as ProjectWorkspaceContext | null,
  query: vi.fn(),
  metadata: vi.fn(() => "metadata"),
  contextAtom: vi.fn(() => "context"),
  error: null as string | null,
}));
vi.mock("../../../state/projects", () => ({
  projectEnvironment: { workspaceContext: f.contextAtom },
}));
vi.mock("../../../state/terminal", () => ({ terminalEnvironment: { metadata: f.metadata } }));
vi.mock("../../../state/query", () => ({
  useEnvironmentQuery: (atom: string | null) => {
    f.query(atom);
    return {
      data:
        atom === "context"
          ? f.context
          : atom === "metadata"
            ? [
                {
                  threadId: "thread-a",
                  terminalId: "existing",
                  cwd: "/fixture",
                  worktreePath: null,
                  status: "running",
                  hasRunningSubprocess: true,
                  updatedAt: "2026-10-17T12:00:00Z",
                },
              ]
            : null,
      isPending: atom === "metadata",
      error: atom === "context" ? f.error : null,
      refresh: vi.fn(),
    };
  },
}));
vi.mock("../../ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetPopup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
const project = { environmentId: EnvironmentId.make("host"), projectId: ProjectId.make("project") };
const workspace: ProjectInventoryWorktree = {
  workspaceKey: "a".repeat(64),
  path: "/fixture",
  realPath: "/fixture",
  isMain: true,
  branchRef: "refs/heads/main",
  headSha: "b".repeat(40),
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
  identity: { ...project, repositoryId: "repo", projectRoot: "/fixture" },
  workspace,
  state: "partial",
  git: {
    branchRef: "refs/heads/main",
    headSha: workspace.headSha,
    detached: false,
    trackedChanges: 2,
    untrackedCount: 1,
  },
  taskIds: [TaskId.make("task-a"), TaskId.make("task-b")],
  missionIds: [],
  integrationBatchIds: [],
  threadIds: [ThreadId.make("thread-a"), ThreadId.make("thread-b")],
  providerSessions: [
    {
      threadId: ThreadId.make("thread-a"),
      instanceId: ProviderInstanceId.make("codex"),
      driver: ProviderDriverKind.make("codex"),
      status: "running",
      updatedAt: "2026-10-17T12:00:00Z",
    },
  ],
  terminalActivity: "requires-terminal-api",
  processActivity: "not-observed",
  externalServices: "not-observed",
  observations: [
    {
      subject: "sessions",
      source: "provider-runtime",
      cache: "live",
      observedAt: null,
      ageMs: 0,
      completeness: "partial",
    },
  ],
  issues: ["ambiguous-ownership"],
};
function render(terminalAllowed = false, connected = true) {
  return renderToStaticMarkup(
    <WorktreeDetailSheet
      selection={{ kind: "worktree", workspace }}
      project={project}
      host="Fixture host"
      connected={connected}
      readable
      terminalAllowed={terminalAllowed}
      workspaces={[]}
      cachedContext={context}
      onContext={vi.fn()}
      onClose={vi.fn()}
      open={vi.fn()}
      titleFor={(_kind, id) => id}
    />,
  );
}
describe("selected checkout inspection", () => {
  beforeEach(() => {
    f.context = context;
    f.error = null;
    f.query.mockClear();
    f.metadata.mockClear();
    f.contextAtom.mockClear();
  });
  it("preserves ambiguous claims and many Threads while restricting terminal metadata", () => {
    const html = render();
    for (const text of [
      "Ambiguous ownership",
      "Open task-a",
      "Open task-b",
      "Open thread-a",
      "Open thread-b",
      "2 tracked · 1 untracked",
      "Running",
      "Session records do not prove OS process liveness",
      "No existing workspace presentation",
    ])
      expect(html).toContain(text);
    expect(f.contextAtom).toHaveBeenCalledWith({
      environmentId: project.environmentId,
      input: { projectId: project.projectId, workspaceKey: workspace.workspaceKey },
    });
    expect(f.metadata).not.toHaveBeenCalled();
  });
  it("renders available terminal samples while a subscription is waiting for further updates", () => {
    expect(render(true)).toContain("Running · terminal");
    expect(f.metadata).toHaveBeenCalledOnce();
  });
  it("does not expose actions for an invalid/replaced repository", () => {
    f.context = {
      ...context,
      state: "invalid",
      issues: ["repository-mismatch"],
      git: null,
      taskIds: [],
      threadIds: [],
    };
    const html = render();
    expect(html).toContain("Verified checkout context unavailable");
    expect(html).not.toContain("Open task-a");
    expect(html).not.toContain("Open thread-a");
  });
  it("keeps offline activity unknown without issuing a selected-context query", () => {
    const html = render(false, false);
    expect(html).toContain("Host offline");
    expect(html).toContain("current activity unknown");
    expect(html).not.toContain("Running ·");
    expect(f.contextAtom).not.toHaveBeenCalled();
    expect(f.metadata).not.toHaveBeenCalled();
  });
  it("keeps unavailable runtime observation distinct from an empty complete sample", () => {
    f.context = {
      ...context,
      providerSessions: [],
      observations: [{ ...context.observations[0]!, completeness: "unavailable" }],
    };
    expect(render()).toContain("Provider activity unavailable or partial");
  });
});
