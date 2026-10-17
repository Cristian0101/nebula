import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import { encodeProjectCheckout } from "../../projectNavigation";
import { useProviderConnectionsEnvironment } from "./useProviderConnectionsEnvironment";

const f = vi.hoisted(() => ({
  projectKey: undefined as string | undefined,
  checkout: undefined as string | undefined,
  remembered: undefined as { checkout: string } | undefined,
  known: true,
  groups: [] as ReturnType<typeof buildSidebarProjectSnapshots>,
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => f.known }));
vi.mock("../../state/shell", () => ({ allEnvironmentProjectIdentitiesKnownAtom: "known" }));
vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectKey: f.projectKey }),
  useLocation: ({ select }: { select: (location: unknown) => unknown }) =>
    select({ search: { checkout: f.checkout } }),
}));
vi.mock("../../state/entities", () => ({ useActiveEnvironmentId: () => "unrelated-host" }));
vi.mock("../../state/environments", () => ({ usePrimaryEnvironmentId: () => "local" }));
vi.mock("../../uiStateStore", () => ({
  useUiStateStore: (select: (state: unknown) => unknown) =>
    select({ projectNavigationByKey: { project: f.remembered } }),
}));
vi.mock("../settings/ProjectSettingsPanel", () => ({ useSettingsProjectGroups: () => f.groups }));

const projects = ["local", "remote"].map((host) => ({
  environmentId: EnvironmentId.make(host),
  id: ProjectId.make("same-project"),
  title: "Same repository and branch",
  workspaceRoot: "/synthetic/repo",
  repositoryIdentity: null,
  scripts: [],
  defaultModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "synthetic" },
  createdAt: "2026-10-17T00:00:00Z",
  updatedAt: "2026-10-17T00:00:00Z",
}));
const groups = buildSidebarProjectSnapshots({
  projects,
  primaryEnvironmentId: EnvironmentId.make("local"),
  settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
  resolveEnvironmentLabel: (id) => id,
});
const group = {
  ...groups[0]!,
  projectKey: "project",
  memberProjects: groups.flatMap((g) => g.memberProjects),
};
const remote = encodeProjectCheckout({
  environmentId: EnvironmentId.make("remote"),
  projectId: ProjectId.make("same-project"),
});

describe("Provider Connections in the integrated Project shell", () => {
  beforeEach(() => {
    f.projectKey = "project";
    f.checkout = remote;
    f.remembered = undefined;
    f.known = true;
    f.groups = [group];
  });
  it("uses the physical Project host instead of the unrelated active connection", () => {
    expect(useProviderConnectionsEnvironment()).toBe("remote");
  });
  it.each([
    "",
    "invalid",
    encodeProjectCheckout({
      environmentId: EnvironmentId.make("missing"),
      projectId: ProjectId.make("same-project"),
    }),
  ])("does not substitute a host for unavailable checkout %s", (checkout) => {
    f.checkout = checkout;
    f.remembered = { checkout: remote };
    expect(useProviderConnectionsEnvironment()).toBeNull();
  });
  it("retains the remembered physical Project and refuses ambiguous selection", () => {
    f.checkout = undefined;
    f.remembered = { checkout: remote };
    expect(useProviderConnectionsEnvironment()).toBe("remote");
    f.remembered = undefined;
    expect(useProviderConnectionsEnvironment()).toBeNull();
  });
  it("retains global connection behavior outside a Project", () => {
    f.projectKey = undefined;
    expect(useProviderConnectionsEnvironment()).toBe("unrelated-host");
  });
});
