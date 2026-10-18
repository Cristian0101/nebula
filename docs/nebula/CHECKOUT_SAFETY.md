# Checkout safety containment (E4.S)

E4.S suspends generic mutations that can move or remove an existing checkout until
E4.4 provides shared server-side coordination. This is a refusal policy, not an
activity assessment or a new ownership manager. It applies to every caller of the
existing Git workflow service, including older clients. A clean checkout or an
execution-context display result never authorizes a mutation.

## Protected operations

- `vcs.switchRef`, `vcs.createRef` with `switchRef: true`, and `vcs.pull` fail before
  invoking the Git driver. No branch is created as a side effect of a rejected
  create-and-switch request.
- Local PR checkout and stacked actions requesting `featureBranch` fail before
  hosting commands, text generation, checkout, commit, or push.
- Opening an existing PR worktree does not refresh/reset HEAD, change its upstream,
  or rerun setup. The response does not claim that the checkout matches fresh PR
  HEAD. New PR worktrees still use the established creation/setup flow.
- `GitWorkflowService.removeWorktree` refuses both forced and ordinary removal.
  Thread deletion no longer offers or requests worktree removal. Task and
  Integration cleanup also fail safely through this service for existing paths;
  their cleanup entry points remain canonical, but deletion is temporarily
  suspended. Missing Task workspace reconciliation can still record absence.
- Generic Thread metadata cannot change an existing Thread's worktree path.
  Task-bound Threads (including recorded Mission recovery attempts) cannot change
  their branch either. Repeated exact identity and ordinary title/model metadata
  updates remain valid. Commands are checked inside the canonical serialized
  orchestration decision pipeline.
- New-worktree turn bootstrap creates the worktree before creating the Thread,
  assigns its final branch/path in `thread.create`, and never retargets an
  existing Thread. The source must match the canonical Project. A pre-creation
  failure returns `not-created` so the client can restore its local draft;
  failed later cleanup retains its original error semantics.
- If an active provider session's cwd differs from the canonical Thread context,
  the provider reactor refuses the next turn instead of replacing the session.
- Terminal `open` refuses a changed cwd, worktree, or environment for an existing
  terminal identity before stopping its process or clearing history. Explicit
  terminal restart/close remains a separate user operation through existing
  authorization. Normal attachment and resize preserve the launch context. Reopening an exited
  terminal keeps its transcript; clearing history remains explicit.

These refusals cover clean, dirty, untracked, detached, missing, ambiguous,
Task-owned, Integration-owned, busy and uninspectable/offline contexts equally.
They do not rely on a potentially stale session/process/status query. Existing
RPC scopes and per-provider permission modes are unchanged. Trusted low-level Git
primitives remain available to canonical internal workflows and test fixtures;
this policy is not a filesystem sandbox against an external editor or shell.

## Drafts and opening worktrees

Selecting an unopened branch in a composer draft records the branch as the base
for a new worktree. Selecting an existing worktree records that worktree for the
new Thread. Neither action switches a physical checkout, stops another provider,
or reuses another Thread's terminal identity. An existing server Thread keeps its
workspace. Branch inspection, Git status/diffs, non-switching branch creation,
new worktree creation, and resuming a Thread in its original context remain
available. The recovery message directs users to open the branch in a new
worktree.

## Required E4.4 coordination contract

Before restoring these mutations, extend the existing server runtime to:

1. Resolve an environment-local Project and repository from canonical identity,
   then verify real worktree identity (common Git directory, worktree Git
   directory, path, branch and HEAD). Renderer paths and cached display queries
   are insufficient. Reject missing, detached or ambiguous state without falling
   back to a Project root or another environment.
2. Admit checkout mutation and all provider/session starts, terminal starts and
   restarts, managed development servers, Task workspaces, Integration workspaces,
   setup scripts, quality commands and recovery operations through shared
   serialization. Key coordination by verified checkout identity, including
   aliases. A Git-only mutex or a read-only preflight leaves a TOCTOU race.
3. Re-read canonical ownership and activity plus uncached tracked/untracked Git
   status and in-progress operation markers while holding that coordination.
   Treat unavailable or uncertain observations as blockers. Task and Integration
   identities remain immutable outside their own lifecycle.
4. Bind any assessment receipt to exact context, target, permission, freshness and
   a server generation. Revalidate under coordination at mutation time. An
   orchestration-read/display RPC never supplies execution authority.
5. Keep removal inside canonical Task/Integration cleanup. Recheck terminal state,
   active/resumable sessions, ownership, process admissions and dirty/untracked
   state through completion; never infer safety from Thread-count heuristics or
   `force`. Define restart/crash reconciliation and external-process uncertainty.
6. Verify rejected/concurrent/replayed requests, symlinks and repository aliases,
   process startup races, remote disconnects and preserved files/session/history
   with disposable worktrees and synthetic provider/process fixtures.

E4.1 read-only inventory and Project OS navigation compose this policy in I1.
They grant no mutation authority. See [capability reconciliation](SUPER_ADE_INTEGRATION.md)
for implemented slices and separate E3/design/human acceptance boundaries.
