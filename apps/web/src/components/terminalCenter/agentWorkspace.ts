/** Resolve launch context once; the server validates this exact cwd before spawning. */
export function resolveAgentWorkspace(input: {
  projectPath: string;
  taskWorkspace?: { status: string; path: string | null } | null;
  chatWorktreePath?: string | null;
  paneWorkspacePath?: string | null;
}) {
  if (
    input.taskWorkspace &&
    (input.taskWorkspace.status !== "ready" || !input.taskWorkspace.path)
  ) {
    throw new Error("Task workspace is not ready. Restore the Task worktree before launching.");
  }
  const worktreePath =
    input.taskWorkspace?.path ??
    input.chatWorktreePath ??
    (input.paneWorkspacePath !== input.projectPath ? input.paneWorkspacePath : null) ??
    null;
  return { cwd: worktreePath ?? input.projectPath, worktreePath };
}
