# Build a Terminal Workspace

A Terminal Workspace is a persistent arrangement of live tools for one Project. The Default Workspace begins with a Shell already rooted in the Project. Choose **New Workspace** to create another independent arrangement.

## General panes and Task-bound panes

Use **Execution context** in **New Pane** to choose between the repository workspace and a canonical Task.

- A general pane is rooted in the selected repository checkout and does not require engineering Task metadata. It remains useful for exploration, brainstorming, Git history, and externally owned servers.
- A Task-bound pane carries the Task ID and uses the Task's isolated worktree. Shells, approved tests, managed Dev Servers, Logs, Preview, and Task Diff inherit that same context.
- **Create Task** records a bounded title, objective, role, provider assignment, acceptance criteria, and ownership paths, then asks the canonical workspace manager to prepare the Task worktree.

The pane header keeps Task status and ownership compact. Choose **Task details** to inspect the objective, agent session, worktree, branch, base commit, allowed and denied paths, real quality runs, structured handoff, review result, and canonical Task Diff.

Changing or replacing a provider does not change the Task. The Task, worktree, changes, validation, and review history remain the durable engineering object.

## Add panes

Choose any empty cell or **New Pane**, then select:

- **Shell** for a real interactive terminal rooted in the selected checkout or worktree.
- **Codex** or **Antigravity** for a canonical provider Thread with live output, tool events, model information, and a composer.
- **Dev Server** for an approved development process.
- **Preview** for the live URL of an attached Dev Server.
- **Tests** for an explicitly approved test or watch command.
- **Logs** for the stream of an existing approved process.
- **Git Status** for the selected checkout's branch and working-tree evidence.
- **Task Diff** for the canonical base-to-Task-worktree change set when the pane is Task-bound. Unrelated repository checkout changes are excluded.
- **Existing Thread** to restore or add an existing canonical conversation.

The drawer also lists reachable **Existing Local Servers**. **Attach & Preview** adds an externally owned server pane and its Preview without starting a duplicate process. **Detach** removes both panes and leaves that process untouched.

Closing a pane and terminating its underlying process are separate actions. Hiding never silently ends useful work.

## Recovery boundaries

Terminal Workspace restores pane layout and Task attachments after reload. Canonical startup reconciliation verifies that recorded Task worktrees still exist; a missing worktree is reported instead of silently recreated. Managed Dev Server state is derived again from terminal metadata and HTTP discovery, while externally attached servers remain external and never gain stop or restart controls.

Provider and PTY processes are not promised to survive every Nebula application or machine restart. When exact process resumption is unavailable, the Task, worktree, changed files, terminal history, and review state remain preserved, while the process or agent session is shown as stopped, exited, missing, or interrupted. Recovery never resets a Task worktree.

## Arrange panes

- **Grid** offers Auto, 1×1, 2×1, 2×2, 3×2, 3×3, and 4×3 densities. Auto expands only as far as the saved pane geometry needs. Drag a pane header to an empty cell, or drag the lower-right handle to snap its span to the current grid. The header size control remains a keyboard-accessible alternative.
- **Freeform** preserves independent window positions and sizes. Drag headers to move panes; the resize control provides a keyboard-accessible alternative.
- **Split View** lays visible panes deterministically. Choose **Split Right** or **Split Down** in the footer.
- **Focus** temporarily isolates the selected pane. **Maximize** fills the work area without rewriting its saved geometry. Escape or Restore returns to the exact prior Workspace.

Changing layout modes does not erase the saved Grid or Freeform geometry. If persisted geometry is invalid after an upgrade, Nebula deterministically reflows visible panes and keeps overflow panes hidden instead of overlapping or losing them.

## Keyboard workflow

The Workspace avoids existing high-value bindings and supports:

- Command-N: New Pane
- Shift-Command-T: New Shell
- Shift-Command-C: New Codex pane
- Shift-Command-A: New Antigravity pane
- Command-Enter: Focus the selected pane
- Escape: Return from Focus or Preview Stage

Empty cells and all pane controls are keyboard focusable. Dragging always has button-based placement and resize alternatives.
