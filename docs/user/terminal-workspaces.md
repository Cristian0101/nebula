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

The drawer also lists reachable **Existing Local Servers**. **Attach & Preview** adds an externally owned server pane and its Preview without starting a duplicate process. **Detach** removes both panes and leaves that process untouched.

Closing a pane and terminating its underlying process are separate actions. Hiding never silently ends useful work.

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
