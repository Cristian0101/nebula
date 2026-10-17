# Project navigation and Workbench identity

E4.2A extends the existing project destinations with an explicit physical checkout.
Logical project grouping remains presentation; execution uses the selected canonical
`ScopedProjectRef` (`EnvironmentId`, `ProjectId`) through the existing authenticated APIs.

## Selection and URLs

Every project route accepts `checkout=v1.<base64url>`, encoding a UTF-8 JSON pair of
Environment ID and Project ID. This is a navigation selector, never an execution token.
It contains no path, branch, workspace key, command, or provider credential. Existing
logical `projectKey` routes and the project `terminal-center` path remain unchanged.

An explicit value wins, including an invalid or empty one. Otherwise the client's
remembered selection wins. Only a single physical member with known snapshots for
all catalogued hosts may be inferred. Invalid remembered identities remain unavailable;
they do not authorize a replacement. Disconnection never selects the local host.
Regrouping follows a uniquely resolved canonical Project reference to its successor key.
When the old group still exists, a persisted hint of the previously displayed member
distinguishes a real regrouping from an arbitrary wrong-group URL. This hint grants no
execution authority; the current canonical Project and environment must still resolve.

`uiStateStore` retains the active logical key, checkout selector, and destination per
logical key using its existing debounced persistence. Thread and draft navigation can
update that presentation selection without changing the conversation's binding.
Explicit new-thread actions use this exact valid canonical checkout as their default;
an unavailable selection offers no substituted default. Navigation itself creates no Thread.
Invalid and removed identities remain available for recovery. Display-name changes
do not affect selection. No provider session or execution authority is added to storage.

## Navigation surfaces

The existing sidebar mounts `SidebarProjectSection`; the active Project exposes
Overview, Workbench, Tasks, and Settings. Other Projects stay collapsed. Its checkout
line remains visible when destinations are collapsed. Focus/hover disclosure shows
hosts and paths; arrow keys move between Project headings or expand/collapse the active
one. Existing Threads inbox, shortcuts, provider entry points, and the legacy sidebar
remain available. Project attention composition belongs to the Project Home milestone.

`ProjectCheckoutSwitcher` explicitly selects a physical Project and changes only the
view. The palette offers bounded navigation and checkout choices without new default
shortcuts. Files opens the existing Workbench file dialog (`files=true`, presentation
only). Branches and Notes destinations remain hidden. Global Terminal Center keeps its
name; the project destination is Workbench. No inventory query is required for ordinary
navigation, so older hosts need no new capability or RPC to support this slice.

## Workbench migration and recovery

The existing terminal layout maps retain their persisted field names and use the same
encoded scoped reference as their new keys. Bare Project ID entries migrate at read time
only when every known host's Project snapshot is available and the ID has one possible
environment. Migration moves the saved objects without rewriting workspace, pane, Thread,
Task, terminal, or terminal-host IDs. Each map migrates independently; conflicting
destinations never overwrite a legacy entry.

Ambiguous entries stay unassigned. The Workbench offers explicit original-checkout
assignment; a missing active workspace or empty saved layout shows recovery and requires
an explicit saved-workspace selection or creation of a presentation layout. It never
manufactures a Thread to recover a layout. Existing multiple workspaces, hidden panes,
Preview state, and layout choices remain scoped to the physical Project. Compact views
select a full-width pane without rewriting the desktop composition.

Terminal viewports restore by canonical terminal identity without a cwd or launch
environment. Missing shells require an explicit Start action. Workbench also refuses to
attach a saved pane to a terminal whose known launch context differs. Explicit terminal
open/stop operations retain their existing RPC authorization. Navigation never checks
out a branch, changes a Task/Thread binding, starts inference, replaces a terminal,
stops a session, removes a worktree, or replays a saved command.

This is client presentation state only. E4.S mutation containment, E3 Provider Connections,
E4.2B Project Home, E4.3 Branches, and E4.4 server coordination remain separate work.
