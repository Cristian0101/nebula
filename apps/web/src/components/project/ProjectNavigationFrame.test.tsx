import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import { encodeProjectCheckout } from "../../projectNavigation";
import { ProjectNavigationFrame } from "./ProjectNavigationFrame";

const fixture = vi.hoisted(() => ({
  groups: [] as unknown[],
  phase: "connected",
  search: {} as Record<string, unknown>,
  remembered: {} as Record<string, unknown>,
  remember: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => true }));
vi.mock("../../state/shell", () => ({
  allEnvironmentProjectIdentitiesKnownAtom: "known-identities",
}));
vi.mock("../settings/ProjectSettingsPanel", () => ({
  useSettingsProjectGroups: () => fixture.groups,
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({
    isReady: true,
    environments: [
      { environmentId: "remote", label: "Remote host", connection: { phase: fixture.phase } },
    ],
  }),
  usePrimaryEnvironmentId: () => "local",
}));
vi.mock("../../uiStateStore", () => ({
  useUiStateStore: (select: (state: unknown) => unknown) =>
    select({
      projectNavigationByKey: fixture.remembered,
      rememberProjectNavigation: fixture.remember,
    }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => fixture.navigate,
  useLocation: () => ({ search: fixture.search }),
}));

const remote = {
  environmentId: EnvironmentId.make("remote"),
  projectId: ProjectId.make("same-project-id"),
};
const checkout = encodeProjectCheckout(remote);
const project = {
  ...remote,
  id: remote.projectId,
  title: "Same name",
  workspaceRoot: "/synthetic/repo",
  scripts: [],
  repositoryIdentity: null,
  defaultModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "synthetic" },
  createdAt: "2026-10-17T00:00:00Z",
  updatedAt: "2026-10-17T00:00:00Z",
};
const group = buildSidebarProjectSnapshots({
  projects: [project],
  primaryEnvironmentId: EnvironmentId.make("local"),
  settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
  resolveEnvironmentLabel: () => "Remote host",
})[0]!;

describe("project navigation execution boundary", () => {
  beforeEach(() => {
    fixture.groups = [group];
    fixture.phase = "connected";
    fixture.search = {};
    fixture.remembered = {};
    fixture.navigate.mockClear();
    fixture.remember.mockClear();
  });
  it.each(["bad", "", encodeProjectCheckout({ ...remote, projectId: ProjectId.make("removed") })])(
    "does not mount execution surfaces for invalid explicit identity %s",
    (invalid) => {
      const child = vi.fn(() => <div>Execution surface</div>);
      const html = renderToStaticMarkup(
        <ProjectNavigationFrame
          projectKey={group.projectKey}
          checkout={invalid}
          destination="workbench"
        >
          {child}
        </ProjectNavigationFrame>,
      );
      expect(html).toContain("Checkout unavailable");
      expect(child).not.toHaveBeenCalled();
      expect(fixture.navigate).not.toHaveBeenCalled();
    },
  );
  it.each(["offline", "reconnecting", "error"])(
    "does not mount execution surfaces on a %s remote host",
    (phase) => {
      fixture.phase = phase;
      const child = vi.fn(() => <div>Execution surface</div>);
      const html = renderToStaticMarkup(
        <ProjectNavigationFrame
          projectKey={group.projectKey}
          checkout={checkout}
          destination="tasks"
        >
          {child}
        </ProjectNavigationFrame>,
      );
      expect(html).toContain("Live status unavailable");
      expect(html).toContain("Remote host");
      expect(child).not.toHaveBeenCalled();
    },
  );
  it("follows a previously displayed checkout after its original group splits", () => {
    const old = {
      ...group,
      projectKey: "old-group",
      memberProjects: [{ ...group.memberProjects[0]!, id: ProjectId.make("another-project") }],
    };
    fixture.groups = [old, { ...group, projectKey: "successor-group" }];
    fixture.remembered = {
      "old-group": {
        projectKey: "old-group",
        checkout,
        destination: "workbench",
        lastResolvedCheckout: checkout,
      },
    };
    const child = vi.fn(() => <div>Recovered destination</div>);
    expect(
      renderToStaticMarkup(
        <ProjectNavigationFrame projectKey="old-group" checkout={checkout} destination="workbench">
          {child}
        </ProjectNavigationFrame>,
      ),
    ).toContain("Recovered destination");
    expect(child).toHaveBeenCalledWith("successor-group");
  });
  it("does not follow an arbitrary wrong-group URL without a previous membership hint", () => {
    fixture.groups = [
      { ...group, projectKey: "old-group", memberProjects: [] },
      { ...group, projectKey: "other-group" },
    ];
    const child = vi.fn(() => <div>Wrong destination</div>);
    expect(
      renderToStaticMarkup(
        <ProjectNavigationFrame projectKey="old-group" checkout={checkout} destination="workbench">
          {child}
        </ProjectNavigationFrame>,
      ),
    ).toContain("Checkout unavailable");
    expect(child).not.toHaveBeenCalled();
  });
  it("mounts the existing destination only for its exact canonical checkout", () => {
    const child = vi.fn(() => <div>Existing destination</div>);
    expect(
      renderToStaticMarkup(
        <ProjectNavigationFrame
          projectKey={group.projectKey}
          checkout={checkout}
          destination="overview"
        >
          {child}
        </ProjectNavigationFrame>,
      ),
    ).toContain("Existing destination");
    expect(child).toHaveBeenCalledWith(group.projectKey);
    expect(fixture.navigate).not.toHaveBeenCalled();
  });
});
