# Work across Projects in Terminal Center

Terminal Center has two levels:

- **Global Terminal Center** answers what is running across every Project. It uses lightweight Project columns so many live sessions remain inexpensive to supervise.
- **Project Terminal Workspace** is where you work. It embeds live shells, provider Threads, approved processes, previews, tests, logs, and Git status in one persistent layout.

Choose **Terminal Center** in the sidebar for the global view. Choose a Project tab or a Project column to open that Project's last-used Terminal Workspace.

## Global supervision

Each Project column summarizes the panes that are intentionally visible in its active Workspace. A hidden Thread does not reappear just because its canonical conversation still exists. Running Dev Servers remain visible as Project activity even when their pane is hidden.

The Active Threads sidebar uses the same canonical Threads as Chat and Swarm. **Open Thread** opens the conversation. **Focus in Workspace** explicitly adds or restores a pane reference and opens it in the Project Workspace; it does not duplicate the Thread.

## Project work

A Project's first visit creates a **Default** Terminal Workspace with one live Shell rooted in the Project. Empty cells expose **Add pane**. Additional named Workspaces—such as Release or Frontend—remember their own pane membership, layout, positions, sizes, selection, and viewport.

A Terminal Workspace is UI composition. It is not a Git worktree. Panes may point at the current checkout or an existing isolated worktree without changing that distinction.

See [Terminal Workspaces](terminal-workspaces.md) for pane and layout behavior, [Dev Servers](dev-servers.md) for command approval and lifecycle, and [Preview Stage](preview-stage.md) for the large live-app view.

## Persistence and hiding

**Hide pane** removes only that pane from the visible Workspace. It does not delete its Thread or terminate its shell, test watcher, or Dev Server. The **Hidden panes** menu restores panes intentionally.

Workspace hydration treats saved pane membership as authoritative. Navigation and restart preserve hidden panes, layout mode, placement, selection, and the last Workspace used for each Project. Use the existing Thread deletion flow when you actually intend to delete a canonical conversation.

## Swarm relationship

Terminal Center is the manual multi-Project engineering workspace. Swarm remains the supervised multi-agent team. Both surfaces reference the same canonical Projects, Threads, Tasks, worktrees, provider runs, and process infrastructure.
