import { describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { buildSidebarProjectSnapshots } from "./sidebarProjectGrouping";
import type { Project } from "./types";
import {
  decodeProjectCheckout,
  encodeProjectCheckout,
  findProjectSuccessor,
  parseProjectNavigationSearch,
  resolveProjectCheckout,
} from "./projectNavigation";
import { parsePersistedState, persistState, PERSISTED_STATE_KEY } from "./uiStateStore";
import { migrateTerminalWorkspaceScope } from "./components/terminalCenter/terminalWorkspaceScope";
import {
  createDefaultTerminalWorkspaceProjectState,
  hideWorkspacePane,
} from "./components/terminalCenter/terminalWorkspace";
import { buildProjectNavigationGroups } from "./components/CommandPalette.logic";
import { parseTerminalCenterSearch } from "./components/terminalCenter/terminalCenterNavigation";

const ref = (environmentId: string, projectId = "same-project-id") => ({
  environmentId: EnvironmentId.make(environmentId),
  projectId: ProjectId.make(projectId),
});
function project(environmentId: string, id = "same-project-id"): Project {
  return {
    ...ref(environmentId, id),
    id: ProjectId.make(id),
    title: "Same display name",
    workspaceRoot: "/synthetic/repo",
    repositoryIdentity: null,
    scripts: [],
    defaultModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "synthetic" },
    createdAt: "2026-10-17T00:00:00Z",
    updatedAt: "2026-10-17T00:00:00Z",
  };
}
const local = ref("local");
const remote = ref("remote");
const groups = buildSidebarProjectSnapshots({
  projects: [project("local"), project("remote")],
  settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
  primaryEnvironmentId: local.environmentId,
  resolveEnvironmentLabel: (id) => id,
});
const group = {
  ...groups[0]!,
  memberProjects: groups.flatMap((group) => group.memberProjects),
  memberProjectRefs: [local, remote],
};
const key = encodeProjectCheckout(local);
const remoteKey = encodeProjectCheckout(remote);

describe("environment-scoped project navigation", () => {
  it("round-trips URL-safe canonical IDs without paths or executable selectors", () => {
    for (const selection of [
      local,
      remote,
      ref("host:with.punctuation/and unicode é", "project.with:punctuation"),
    ]) {
      const encoded = encodeProjectCheckout(selection);
      expect(encoded).toMatch(/^v1\.[a-zA-Z0-9_-]+$/);
      expect(decodeProjectCheckout(encoded)).toEqual(selection);
    }
    for (const value of ["", "/repo", "main", "workspaceKey", "v1.e30", "v1." + "x".repeat(3000)])
      expect(decodeProjectCheckout(value)).toBeNull();
  });
  it.each([
    { explicitCheckout: key, rememberedCheckout: remoteKey, expected: "local" },
    { explicitCheckout: remoteKey, rememberedCheckout: key, expected: "remote" },
    { rememberedCheckout: remoteKey, expected: "remote" },
    { explicitCheckout: "bad", rememberedCheckout: key, expected: undefined },
    { explicitCheckout: "", rememberedCheckout: key, expected: undefined },
    { rememberedCheckout: "removed", expected: undefined },
    { explicitCheckout: encodeProjectCheckout(ref("missing")), expected: undefined },
    { expected: undefined },
  ])("resolves selection without host substitution: %j", ({ expected, ...selection }) => {
    expect(resolveProjectCheckout({ group, ...selection }).member?.environmentId).toBe(expected);
  });
  it("waits for known environment snapshots before inferring a representative", () => {
    expect(
      resolveProjectCheckout({ group: groups[0]!, allowRepresentative: false }).member,
    ).toBeNull();
    expect(
      resolveProjectCheckout({
        group: groups[0]!,
        allowRepresentative: false,
        explicitCheckout: key,
      }).member?.environmentId,
    ).toBe("local");
  });
  it("does not substitute an unrelated group with the same name or a missing Project", () => {
    expect(
      resolveProjectCheckout({ group: groups[0]!, explicitCheckout: remoteKey }).member,
    ).toBeNull();
    expect(resolveProjectCheckout({ group: null, explicitCheckout: key }).checkout).toBe(key);
  });
  it("uses a single unambiguous physical representative only when no selection exists", () => {
    expect(resolveProjectCheckout({ group: groups[0]! }).checkout).toBe(key);
    expect(
      resolveProjectCheckout({ group: groups[0]!, rememberedCheckout: "removed" }).member,
    ).toBeNull();
  });
  it("follows regrouping by canonical identity, never by title, path or branch", () => {
    expect(findProjectSuccessor(groups, remoteKey)?.environmentId).toBe("remote");
    expect(findProjectSuccessor([group, group], remoteKey)).toBeNull();
    expect(findProjectSuccessor(groups, encodeProjectCheckout(ref("removed")))).toBeNull();
  });
  it("preserves malformed explicit URLs including non-string search values", () => {
    expect(parseProjectNavigationSearch({ checkout: "" })).toEqual({ checkout: "" });
    expect(parseProjectNavigationSearch({ checkout: [key] })).toEqual({ checkout: "" });
    expect(parseTerminalCenterSearch({ checkout: remoteKey, taskId: "canonical-task" })).toEqual({
      checkout: remoteKey,
      taskId: "canonical-task",
    });
  });
  it("retains unavailable identities through persistence and reload", () => {
    const active = {
      projectKey: "removed-logical-group",
      checkout: remoteKey,
      destination: "workbench" as const,
    };
    const state = parsePersistedState({
      activeProjectNavigation: active,
      projectNavigationByKey: { [active.projectKey]: active },
    });
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem, removeItem: vi.fn() } });
    try {
      persistState(state);
      const serialized = setItem.mock.calls.find(([name]) => name === PERSISTED_STATE_KEY)?.[1];
      const restored = parsePersistedState(JSON.parse(serialized));
      expect(restored.activeProjectNavigation).toEqual(active);
      expect(
        resolveProjectCheckout({
          group: groups[0]!,
          rememberedCheckout: restored.activeProjectNavigation!.checkout,
        }).member,
      ).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Terminal Workspace scoped migration", () => {
  const legacy = createDefaultTerminalWorkspaceProjectState({
    projectId: local.projectId,
    workspacePath: "/synthetic/repo",
    now: "2026-10-17T00:00:00Z",
  });
  it("moves a uniquely identified layout preserving every pane/session/workspace ID", () => {
    const state = parsePersistedState({
      terminalWorkspacesByProjectId: { [local.projectId]: legacy },
    });
    const migrated = migrateTerminalWorkspaceScope(state, local, [local]);
    expect(migrated.terminalWorkspacesByProjectId[key]).toBe(
      state.terminalWorkspacesByProjectId[local.projectId],
    );
    expect(migrated.terminalWorkspacesByProjectId[local.projectId]).toBeUndefined();
    expect(migrateTerminalWorkspaceScope(migrated, local, [local])).toBe(migrated);
  });
  it("keeps ambiguous legacy state unassigned and requires an explicit original-host choice", () => {
    const state = parsePersistedState({
      terminalWorkspacesByProjectId: { [local.projectId]: legacy },
    });
    expect(migrateTerminalWorkspaceScope(state, local, [local, remote])).toBe(state);
    const assigned = migrateTerminalWorkspaceScope(state, remote, [local, remote], true);
    expect(assigned.terminalWorkspacesByProjectId[remoteKey]).toEqual(
      state.terminalWorkspacesByProjectId[local.projectId],
    );
    expect(assigned.terminalWorkspacesByProjectId[key]).toBeUndefined();
  });
  it("never overwrites a scoped destination or discards a conflicting legacy layout", () => {
    const state = parsePersistedState({
      terminalWorkspacesByProjectId: { [local.projectId]: legacy, [key]: legacy },
    });
    expect(migrateTerminalWorkspaceScope(state, local, [local], true)).toBe(state);
  });
  it("migrates a saved workspace even when a separate scoped canvas already exists", () => {
    const state = parsePersistedState({
      terminalWorkspacesByProjectId: { [local.projectId]: legacy },
      terminalCenterByProjectId: { [key]: { layout: "grid" } as never },
    });
    const migrated = migrateTerminalWorkspaceScope(state, local, [local]);
    expect(migrated.terminalWorkspacesByProjectId[key]).toEqual(
      state.terminalWorkspacesByProjectId[local.projectId],
    );
    expect(migrated.terminalCenterByProjectId[key]).toBe(state.terminalCenterByProjectId[key]);
  });
  it("keeps different hosts and multiple named workspaces independent, including hidden Preview", () => {
    const workspace = legacy.workspaces[0]!;
    const hidden = hideWorkspacePane(workspace, workspace.panes[0]!.id);
    const localState = {
      ...legacy,
      workspaces: [hidden, { ...workspace, id: "another-layout", name: "Review" }],
    };
    const state = parsePersistedState({
      terminalWorkspacesByProjectId: { [key]: localState, [remoteKey]: legacy },
    });
    expect(state.terminalWorkspacesByProjectId[key]?.workspaces).toHaveLength(2);
    expect(state.terminalWorkspacesByProjectId[key]?.workspaces[0]?.panes[0]?.visible).toBe(false);
    expect(state.terminalWorkspacesByProjectId[remoteKey]?.workspaces[0]?.panes[0]?.visible).toBe(
      true,
    );
  });
  it("preserves an empty saved workspace as recovery state instead of inventing a layout", () => {
    const state = parsePersistedState({
      terminalWorkspacesByProjectId: {
        [key]: { initialized: true, activeWorkspaceId: "missing-layout", workspaces: [] },
      },
    });
    expect(state.terminalWorkspacesByProjectId[key]).toEqual({
      initialized: true,
      activeWorkspaceId: "missing-layout",
      workspaces: [],
    });
  });
  it("retains a missing active workspace for explicit recovery", () => {
    const state = parsePersistedState({
      terminalWorkspacesByProjectId: {
        [key]: { ...legacy, activeWorkspaceId: "removed-workspace" },
      },
    });
    expect(state.terminalWorkspacesByProjectId[key]?.activeWorkspaceId).toBe("removed-workspace");
  });
});

describe("bounded project palette commands", () => {
  it("navigates with the exact requested selection and assigns no shortcuts", async () => {
    const open = vi.fn(async () => {});
    const result = buildProjectNavigationGroups({
      groups: [group],
      activeProjectKey: group.projectKey,
      activeCheckout: "invalid-explicit",
      remembered: {},
      icon: null,
      open,
    });
    const items = result[0]!.items;
    const overview = items.find((item) => item.value === "project-navigation:overview")!;
    if (overview.kind !== "action") throw new Error("Expected navigation action");
    await overview.run();
    expect(open).toHaveBeenCalledWith(group.projectKey, "overview", "invalid-explicit");
    for (const item of items) expect(item.shortcutCommand).toBeUndefined();
    const checkout = items.find((item) => item.value === "project-navigation:checkout")!;
    if (checkout.kind !== "submenu") throw new Error("Expected checkout selector");
    const remoteItem = checkout.groups[0]!.items[1]!;
    if (remoteItem.kind !== "action") throw new Error("Expected physical checkout");
    await remoteItem.run();
    expect(open).toHaveBeenLastCalledWith(group.projectKey, "overview", remoteKey);
  });
});
