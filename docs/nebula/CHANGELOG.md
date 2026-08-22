# Nebula changelog

## Unreleased

### Task workspace isolation

- New writable Builder Tasks prepare one durable Git worktree before Thread creation.
- Task workspace records persist source repository, exact base commit, stable branch, inherited path, lifecycle state, timestamps, and safe failure details.
- Startup reconciliation adopts completed worktrees, reports missing workspaces, and resumes interrupted explicit cleanup.
- Terminal Task cleanup refuses dirty worktrees, never forces removal, and preserves branches.
- Pre-isolation Tasks and existing Threads remain compatible with their original shared workspace.
