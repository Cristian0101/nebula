# Terminal Center composition

Project and Global Terminal Center are local UI compositions over canonical server state. They do not introduce a second Thread, Task, Mission, provider, or process domain.

## Canonical boundaries

- A node references an `OrchestrationThreadShell` and renders only lightweight projection fields.
- Agent panes reference canonical Thread IDs and mount the existing embedded `ChatView` when their saved geometry can support a transcript and composer. Compact panes render a lightweight projection until selected or enlarged. Preview Stage attaches the same Thread view; it does not clone provider state.
- Task and Mission badges come from existing projections. Mission Flow uses canonical dependency waves.
- Hiding a node updates canvas membership only; it never deletes the Thread.

Canvas state lives in the client UI store under a stable key. Project canvases use the Project ID. Global Terminal Center uses `nebula:global-terminal-center`, which keeps membership, positions, layout, viewport, selection, and quick-launch state separate from every Project canvas.

Project Terminal Workspaces persist pane membership, visibility, canonical attachments, Grid and Freeform geometry, grid density, selection, focus, and viewport per Project. Grid sanitization clamps invalid values, removes duplicate pane IDs, clears invalid selection, reflows collisions, and hides overflow above the bounded sixteen-pane surface. Focus and maximize never mutate pane geometry.

## Dev Server lifecycle

A `DevServerProfile` is client-local configuration keyed by logical Project. Its exact one-line command and project-relative working directory are user approved. Runtime execution reuses the canonical terminal RPC and PTY lifecycle with a deterministic `dev-server-<profile-id>` terminal ID.

Current-checkout Threads resolve the profile directory from the Project root. Task-backed Threads resolve it from `thread.worktreePath`. Running state is reconstructed from terminal metadata; it is never persisted as profile state. The provider process and Dev Server PTY are independent, so turn completion does not close the Dev Server.

Restart interrupts the managed terminal's foreground process, waits for terminal metadata to report that the subprocess has exited, and only then writes the same approved command again. This keeps the PTY identity and transcript while preventing the replacement server from racing the old listener for its port.

Port discovery reports the terminal owner for each reachable local server. Terminal Workspace binds health and Preview to the matching host Thread ID plus terminal ID, then uses the scanner's resolved URL as the live target. A preferred profile port is configuration, not proof of readiness. Generic commands keep a null preferred port unless a Project Script supplies an explicit Preview URL.

The same discovery response carries an embedding policy derived from `X-Frame-Options` and Content Security Policy headers. Definite frame denial is rendered as a browser-only Preview state; custom frame allowlists remain unknown until the browser evaluates them. Terminal Workspace never strips those headers.

Explicit external attachments persist host, port, URL, process display metadata, and attachment time in pane state. They are re-resolved against live discovery by host and port after hydration. External ownership is a hard lifecycle boundary: Workspace can open, preview, or detach the server, but only a managed `DevServerProfile` may start, stop, or restart a process.

## Local Project discovery

`filesystem.discoverProjects` is a read-scoped RPC. The server scans only request roots already approved in client settings. It canonicalizes real paths, deduplicates case-insensitively on macOS and Windows, stops at repository markers, skips hidden/cache/dependency directories, tolerates partial unreadability, and enforces depth, directory-count, time, and result limits. Adding a result uses the existing Project create command with `createWorkspaceRootIfMissing: false`.

## Provider model discovery

Antigravity status probes the installed CLI version and then the documented `agy models` command. Only a successful model command contributes explicit choices. Auto and configured custom model IDs remain available as fallbacks; a configured ID is not treated as provider-validated until a real launch succeeds.
