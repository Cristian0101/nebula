# Build a Terminal Workspace

A Terminal Workspace is a persistent arrangement of live tools for one Project. The Default Workspace begins with a Shell already rooted in the Project. Choose **New Workspace** to create another independent arrangement.

## Add panes

Choose any empty cell or **New Pane**, then select:

- **Shell** for a real interactive terminal rooted in the selected checkout or worktree.
- **Codex** or **Antigravity** for a canonical provider Thread with live output, tool events, model information, and a composer.
- **Dev Server** for an approved development process.
- **Preview** for the live URL of an attached Dev Server.
- **Tests** for an explicitly approved test or watch command.
- **Logs** for the stream of an existing approved process.
- **Git Status** for the selected checkout's branch and working-tree evidence.
- **Existing Thread** to restore or add an existing canonical conversation.

Closing a pane and terminating its underlying process are separate actions. Hiding never silently ends useful work.

## Arrange panes

- **Grid** uses a 4-by-4 snap surface. Drag a pane header to an empty cell. Use its resize control to cycle through useful cell spans.
- **Freeform** preserves independent window positions and sizes. Drag headers to move panes; the resize control provides a keyboard-accessible alternative.
- **Split View** lays visible panes deterministically. Choose **Split Right** or **Split Down** in the footer.
- **Focus** fills the work area with the selected pane. Escape restores the exact prior Workspace.

Changing layout modes does not erase the saved Grid or Freeform geometry.

## Keyboard workflow

The Workspace avoids existing high-value bindings and supports:

- Command-N: New Pane
- Shift-Command-T: New Shell
- Shift-Command-C: New Codex pane
- Shift-Command-A: New Antigravity pane
- Command-Enter: Focus the selected pane
- Escape: Return from Focus or Preview Stage

Empty cells and all pane controls are keyboard focusable. Dragging always has button-based placement and resize alternatives.
