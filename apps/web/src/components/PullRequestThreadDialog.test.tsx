import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { reactHookHarness as hooks } from "../test/reactHookHarness";
import { visitElements } from "../test/reactElementTree";

const action = vi.hoisted(() => ({ run: vi.fn(), resetError: vi.fn() }));

vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return {
    ...actual,
    useCallback: reactHookHarness.useCallback,
    useMemo: reactHookHarness.useMemo,
    useRef: reactHookHarness.useRef,
    useState: reactHookHarness.useState,
    useEffect: vi.fn(),
  };
});
vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});
vi.mock("@tanstack/react-pacer", async (original) => ({
  ...(await original<typeof import("@tanstack/react-pacer")>()),
  useDebouncedValue: (value: string) => [value, { state: { isPending: false } }],
}));
vi.mock("~/lib/sourceControlActions", () => ({
  readCachedPullRequestResolution: () => null,
  usePreparePullRequestThreadAction: () => ({ ...action, isPending: false, error: null }),
  usePullRequestResolution: () => ({
    data: {
      pullRequest: { number: 42, title: "Synthetic PR", headBranch: "feature", baseBranch: "main" },
    },
    isPending: false,
    isFetching: false,
  }),
}));
vi.mock("~/state/query", () => ({ useEnvironmentQuery: () => ({ data: null }) }));
vi.mock("~/state/vcs", () => ({ vcsEnvironment: { status: () => null } }));

import { PullRequestThreadDialog } from "./PullRequestThreadDialog";

function render() {
  hooks.beginRender();
  return PullRequestThreadDialog({
    open: true,
    environmentId: EnvironmentId.make("test-host"),
    threadId: ThreadId.make("test-thread"),
    cwd: "/synthetic/project",
    initialReference: "#42",
    onOpenChange: vi.fn(),
    onPrepared: vi.fn(),
  });
}

describe("PR checkout containment", () => {
  beforeEach(() => {
    hooks.reset();
    vi.clearAllMocks();
    action.run.mockResolvedValue({
      _tag: "Success",
      value: { branch: "feature", worktreePath: "/synthetic/worktree" },
    });
  });

  it("discloses and disables Local checkout before activation", () => {
    const tree = render();
    const local = visitElements(tree, (element) => element.props.children === "Local unavailable");
    expect(local?.props.disabled).toBe(true);
    expect(local?.props.onClick).toBeUndefined();
    const explanation = visitElements(
      tree,
      (element) => element.props.id === local?.props["aria-describedby"],
    );
    expect(explanation).not.toBeNull();
    expect(JSON.stringify(explanation?.props.children)).toContain("temporarily unavailable");
  });

  it("does not substitute a worktree mutation when Enter is pressed", () => {
    const input = visitElements(
      render(),
      (element) => typeof element.props.onKeyDown === "function",
    );
    const preventDefault = vi.fn();
    (input?.props.onKeyDown as (event: unknown) => void)({ key: "Enter", preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(action.run).not.toHaveBeenCalled();
  });

  it("requires an explicit Worktree action and preserves the Thread identity", async () => {
    const worktree = visitElements(render(), (element) => element.props.children === "Worktree");
    expect(worktree?.props.disabled).toBe(false);
    (worktree?.props.onClick as () => void)();
    await vi.waitFor(() => expect(action.run).toHaveBeenCalledOnce());
    expect(action.run).toHaveBeenCalledWith({
      reference: "42",
      mode: "worktree",
      threadId: "test-thread",
    });
  });
});
