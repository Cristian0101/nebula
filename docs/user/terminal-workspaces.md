# Build a Terminal Workspace

A Terminal Workspace is a persistent arrangement of live tools for one Project. The Default Workspace begins with a Shell already rooted in the Project. Choose **New Workspace** to create another independent arrangement.

## General panes and Task-bound panes

Use **Execution context** in **New Pane** to choose between the repository workspace and a canonical Task.

- A general pane is rooted in the selected repository checkout and does not require engineering Task metadata. It remains useful for exploration, brainstorming, Git history, and externally owned servers.
- A Task-bound pane carries the Task ID and uses the Task's isolated worktree. Shells, approved tests, managed Dev Servers, Logs, Preview, and Task Diff inherit that same context.
- **Create Task** records a bounded title, objective, role, provider assignment, acceptance criteria, and ownership paths, then asks the canonical workspace manager to prepare the Task worktree.

The pane header keeps Task status and ownership compact. Choose **Task details** to inspect the objective, agent session, worktree, branch, base commit, allowed and denied paths, real quality runs, structured handoff, review result, and canonical Task Diff. The inspector can validate ownership, prepare or refresh the immutable review package, run the Project's configured quality gates, complete the structured handoff, and request independent review.

Opening Terminal Center from a Mission Task carries the canonical Task selection into the Workspace. The Task becomes the execution context, its inspector opens immediately, and any existing pane attached to that Task is selected without changing its saved geometry.

Changing or replacing a provider does not change the Task. Interrupt or stop the current session, then choose an available replacement provider from the inspector. Nebula creates a distinct canonical Thread in the same Task worktree and sends bounded recovery context; the Task, worktree, changes, validation, and review history remain the durable engineering object.

## Add panes

Choose an empty dock column or **New Pane**. Quick Add separates **Agent**, **Tool**, and **Layout** choices so the common path stays short:

- **Shell** for a real interactive terminal rooted in the selected checkout or worktree.
- **Agent → Chat GUI** for a canonical provider Thread with live output, tool events, model information, attachments, and a composer.
- **Agent → Terminal** for the selected provider's configured CLI in a normal interactive PTY. Provider availability, custom binary paths, safe instance environment values, and the active repository or Task worktree are reused.
- **Dev Server** for an approved development process.
- **Preview** for the live URL of an attached Dev Server.
- **Tests** for an explicitly approved test or watch command.
- **Logs** for the stream of an existing approved process.
- **File** for a searchable, read-only repository file. The chosen relative path is saved with the pane.
- **Git Status** for the selected checkout's branch and working-tree evidence.
- **Diff** for the current checkout's working-tree patch. The pane uses the same syntax-colored, file-grouped diff renderer as Review and keeps horizontal overflow inside its own slot. When the pane is Task-bound, it shows the canonical base-to-Task-worktree change set and excludes unrelated checkout changes.
- **Existing Thread** to restore or add an existing canonical conversation.

Agent providers come from the same dynamic provider registry used everywhere else in Nebula. A provider that is disabled, missing, or still configuring remains visible with its truthful status instead of producing a dead pane. Use the pane header's **Pane** menu to turn the current slot into Chat, Terminal, Preview, Logs, Diff, Git, or Tests without changing its dock position. Chat and Terminal retain the canonical agent identity and switch between linked companion views without collapsing the pane or losing either history. Provider terminals advertise Nebula's 256-color, true-color-capable surface so Codex, Antigravity, and other CLIs keep their native palettes.

The workspace drawer groups servers into two ownership classes:

- **Project Services** are managed Dev Servers already running in any named Workspace for this Project. **Add Preview Here** and **Add Server + Logs** reuse the original terminal owner and URL without launching a second process. **Focus in…** returns to the owning Workspace.
- **Other Local Servers** are external processes. **Attach & Preview** adds an externally owned server pane and its Preview. **Detach** removes both panes and leaves that process untouched.

Closing a pane and terminating its underlying process are separate actions. Hiding never silently ends useful work.

## Recovery boundaries

Terminal Workspace restores pane layout and Task attachments after reload. Canonical startup reconciliation verifies that recorded Task worktrees still exist; a missing worktree is reported instead of silently recreated. Managed Dev Server state is derived again from terminal metadata and HTTP discovery, while externally attached servers remain external and never gain stop or restart controls.

Provider and PTY processes are not promised to survive every Nebula application or machine restart. When exact process resumption is unavailable, the Task, worktree, changed files, terminal history, and review state remain preserved, while the process or agent session is shown as stopped, exited, missing, or interrupted. Recovery never resets a Task worktree.

## Arrange and split panes

- **Workbench** is a recursive split canvas. Shared gutters and subtle edge handles redistribute the space that is already on screen; middle cells expose both sides of an axis, and available corners resize both axes at once. The selected pane on the bottom edge gets a distinct blue floor grip below it. Drag that grip down to extend the scrollable Workbench instead of taking height from agents above it; their pixel heights stay fixed while the bottom pane gains new room. A focused floor grip accepts Arrow Down or Arrow Up in 120-pixel steps. Drag the dedicated pane grip over another pane or the full-canvas dock zones to choose **Left**, **Right**, **Top**, **Bottom**, or **Tab**; every drop creates a nested split or adds the pane to that tab stack instead of overlapping it.
- **Preview** gives the running app nearly the entire window. A slim rail returns to Workbench or Build + Preview, while the bottom Agent and Logs tray stays collapsed until requested.
- **Build + Preview** keeps a dominant live Preview beside a narrower rail containing the active Agent and Dev Logs. Both the main gutter and the Agent/Logs gutter are draggable.
- **Focus** temporarily isolates the selected pane. **Maximize** fills the work area without rewriting its saved geometry. Escape or Restore returns to the exact prior Workspace.

The always-visible **Layout** menu groups 20 searchable presets into Essentials, Focus, Build, Review, and Dense layouts. The same choices are available under Quick Add's **Layout** section. Presets range from Solo, side-by-side, stacked, and Main + rail through Preview + chat, Diff + preview, Test triage, 3×3, 4×3, and 4×4. A preset replaces only the visual composition: every visible pane remains reachable, and no provider, terminal, server, or canonical Task is closed or duplicated. Empty preset slots keep **Add pane** centered and reveal a subtle remove control in the upper-right corner on hover or keyboard focus. Removing a slot never closes a pane or process; neighboring slots expand into the freed space, while choosing **Add pane** fills the exact slot that was selected.

The recursive split tree, every gutter ratio, extended Workbench height, active tab, selected pane, preset identity, and empty preset slot persist per named Workspace. There is no fixed visible-pane cap in Workbench. Legacy Grid, Freeform, and Split View state is normalized into the recursive layout without overlapping or losing pane membership.

## Design Mode

Open a healthy Preview and choose **Design Mode**. Nebula pins Design Mode to the Preview pane and URL currently on screen; it never launches or attaches a replacement server. Element capture starts immediately. The live app stays on the left while the inspector on the right identifies **Editing this Preview** and guides the capture. Every page surface is selectable, including the document background. Pick a surface to collect its screenshot, source-mapped component and file line when available, HTML context, and authored styles. Add an implementation note, choose a running Chat agent, and choose **Send capture** to deliver the evidence and image as a normal agent turn scoped to that exact Preview. If only a provider Terminal exists, the target menu can open its canonical Chat companion and select it automatically. Exit returns to the mode that was open before Design Mode.

Design Mode never invents a source location when the Preview runtime cannot resolve one. A terminal process is never treated as a durable Chat Thread; Nebula creates or restores the real Chat companion before sending a handoff.

## Keyboard workflow

The Workspace avoids existing high-value bindings and supports:

- Command-N: New Pane
- Shift-Command-T: New Shell
- Shift-Command-C: New Codex pane
- Shift-Command-A: New Antigravity pane
- Command-Backslash: Split Right with a new Shell
- Shift-Command-Backslash: Split Down with a new Shell
- Option-Command-T: Select the next tab in the active stack
- Command-Enter: Focus the selected pane
- Escape: Return from Focus, Preview, or Build + Preview

Empty slots and all pane controls are keyboard focusable. Header actions and the Quick Add Layout menu provide button-based alternatives to dragging and resizing.
