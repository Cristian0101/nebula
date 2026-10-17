import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, type ProjectInventory } from "@t3tools/contracts";
import { BranchInventory } from "./BranchInventory";
const f = vi.hoisted(() => ({
  connected: true,
  readable: true,
  supported: true,
  pages: [] as ProjectInventory[],
  navigate: vi.fn(),
  queries: [] as unknown[],
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: string) =>
    atom === "config"
      ? { environment: { capabilities: { projectInventory: f.supported } } }
      : { projects: [] },
}));
vi.mock("../../../state/server", () => ({
  serverEnvironment: { configValueAtom: () => "config" },
}));
vi.mock("../../../state/shell", () => ({ environmentSnapshotAtom: () => "snapshot" }));
vi.mock("../../../state/environments", () => ({
  useEnvironmentConnectionState: () => ({ data: { phase: f.connected ? "connected" : "offline" } }),
}));
vi.mock("../../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { authenticated: true, scopes: f.readable ? ["orchestration:read"] : [] },
  }),
}));
vi.mock("../projectNavigationContext", () => ({
  useProjectNavigationGroup: () => ({
    id: "project",
    environmentId: "host-a",
    displayName: "Fixture",
    workspaceRoot: "/fixture",
    memberProjects: [],
  }),
}));
vi.mock("../../../hooks/useProjectNavigate", () => ({ useProjectNavigate: () => f.navigate }));
vi.mock("../../../uiStateStore", () => ({
  useUiStateStore: (select: (state: unknown) => unknown) =>
    select({ terminalWorkspacesByProjectId: {} }),
}));
vi.mock("./useBranchInventory", () => ({
  useBranchInventory: (_project: unknown, enabled: boolean) => {
    f.queries.push(enabled);
    return {
      pages: f.pages,
      remote: false,
      notice: "",
      pending: false,
      error: false,
      refresh: vi.fn(),
      showRemote: vi.fn(),
      loadMore: vi.fn(),
      blocked: false,
    };
  },
}));
const page: ProjectInventory = {
  environmentId: EnvironmentId.make("host-a"),
  projectId: ProjectId.make("project"),
  identity: {
    environmentId: EnvironmentId.make("host-a"),
    projectId: ProjectId.make("project"),
    repositoryId: "repo",
    projectRoot: "/fixture",
  },
  state: "partial",
  refs: [
    {
      name: "no-checkout",
      fullRefName: "refs/heads/no-checkout",
      kind: "local",
      headSha: "a".repeat(40),
      committedAt: null,
      upstreamRef: null,
      workspaceKeys: [],
    },
  ],
  worktrees: [
    {
      workspaceKey: "b".repeat(64),
      path: "/fixture",
      realPath: "/fixture",
      isMain: true,
      headSha: "a".repeat(40),
      branchRef: "refs/heads/main",
      detached: false,
      bare: false,
      locked: true,
      prunable: true,
      availability: "present",
      headState: "resolved",
      membership: "registered",
    },
  ],
  totals: { refs: 1, worktrees: 1 },
  observations: [],
  issues: ["truncated"],
  nextCursor: { snapshotId: "f".repeat(64), refs: 1, worktrees: 1 },
  remoteFreshness: "not-verified",
  refresh: "not-requested",
};
describe("Branches read permission and presentation boundaries", () => {
  beforeEach(() => {
    f.connected = true;
    f.readable = true;
    f.supported = true;
    f.pages = [page];
    f.queries = [];
    f.navigate.mockClear();
  });
  it("renders two sections, current registration and partial search coverage without mutations", () => {
    const html = renderToStaticMarkup(<BranchInventory projectKey="fixture" />);
    for (const text of [
      "Registered checkouts",
      "Branches without checkouts",
      "Current checkout",
      "Locked",
      "Prunable",
      "Changes unknown",
      "No working-tree status",
      "load more to extend results",
      "at least 1",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("New Thread");
    expect(f.navigate).not.toHaveBeenCalled();
    expect(f.queries).toEqual([true]);
  });
  it("hides cached inventory and skips queries without orchestration read permission", () => {
    f.readable = false;
    const html = renderToStaticMarkup(<BranchInventory projectKey="fixture" />);
    expect(html).toContain("Orchestration read permission");
    expect(html).not.toContain("refs/heads/main");
    expect(f.queries).toEqual([false]);
  });
  it("labels offline cached facts and never queries another host", () => {
    f.connected = false;
    const html = renderToStaticMarkup(<BranchInventory projectKey="fixture" />);
    expect(html).toContain("Cached observations only");
    expect(html).toContain("Activity unknown · offline");
    expect(f.queries).toEqual([false]);
  });
  it("handles an older capability document without invoking inventory", () => {
    f.supported = false;
    expect(renderToStaticMarkup(<BranchInventory projectKey="fixture" />)).toContain(
      "does not advertise Project inventory support",
    );
    expect(f.queries).toEqual([false]);
  });
  it("renders missing Project without falling back to another repository", () => {
    f.pages = [
      {
        ...page,
        identity: null,
        state: "invalid",
        refs: [],
        worktrees: [],
        issues: ["project-unavailable"],
      },
    ];
    expect(renderToStaticMarkup(<BranchInventory projectKey="fixture" />)).toContain(
      "Project unavailable on the selected host",
    );
    expect(f.navigate).not.toHaveBeenCalled();
  });
});
