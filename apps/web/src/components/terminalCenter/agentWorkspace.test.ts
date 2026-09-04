import { describe, expect, it } from "vite-plus/test";
import { resolveAgentWorkspace } from "./agentWorkspace";

describe("agent launch workspace", () => {
  it("keeps Task worktree precedence over Chat and pane state", () => {
    expect(
      resolveAgentWorkspace({
        projectPath: "/source",
        taskWorkspace: { status: "ready", path: "/task" },
        chatWorktreePath: "/chat",
        paneWorkspacePath: "/pane",
      }),
    ).toEqual({ cwd: "/task", worktreePath: "/task" });
  });
  it("keeps a Task-less Chat in its worktree on Terminal launch", () => {
    expect(resolveAgentWorkspace({ projectPath: "/source", chatWorktreePath: "/chat" })).toEqual({
      cwd: "/chat",
      worktreePath: "/chat",
    });
  });
  it("uses source only without a more specific workspace", () => {
    expect(resolveAgentWorkspace({ projectPath: "/source" })).toEqual({
      cwd: "/source",
      worktreePath: null,
    });
  });
  it("retains stale Chat cwd for server validation rather than redirecting", () => {
    expect(
      resolveAgentWorkspace({ projectPath: "/source", chatWorktreePath: "/missing" }).cwd,
    ).toBe("/missing");
  });
  it("preserves pane context while a linked Chat is unavailable", () => {
    expect(resolveAgentWorkspace({ projectPath: "/source", paneWorkspacePath: "/chat" }).cwd).toBe(
      "/chat",
    );
  });
  it("fails closed for an unready Task", () => {
    expect(() =>
      resolveAgentWorkspace({
        projectPath: "/source",
        taskWorkspace: { status: "failed", path: null },
        chatWorktreePath: "/chat",
      }),
    ).toThrow("Task workspace is not ready");
  });
  it("does not leak cwd between simultaneous Chats or repeated launches", () => {
    for (const chatWorktreePath of ["/a", "/b", "/a"])
      expect(resolveAgentWorkspace({ projectPath: "/source", chatWorktreePath }).cwd).toBe(
        chatWorktreePath,
      );
  });
});
