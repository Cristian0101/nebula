# Terminal Center composition

Project and Global Terminal Center are local UI compositions over canonical server state. They do not introduce a second Thread, Task, Mission, provider, or process domain.

## Canonical boundaries

- A node references an `OrchestrationThreadShell` and renders only lightweight projection fields.
- Focusing a node mounts the existing `ChatView` once. The focused shell is full viewport height and does not stack a second workspace header.
- Task and Mission badges come from existing projections. Mission Flow uses canonical dependency waves.
- Hiding a node updates canvas membership only; it never deletes the Thread.

Canvas state lives in the client UI store under a stable key. Project canvases use the Project ID. Global Terminal Center uses `nebula:global-terminal-center`, which keeps membership, positions, layout, viewport, selection, and quick-launch state separate from every Project canvas.

## Dev Server lifecycle

A `DevServerProfile` is client-local configuration keyed by logical Project. Its exact one-line command and project-relative working directory are user approved. Runtime execution reuses the canonical terminal RPC and PTY lifecycle with a deterministic `dev-server-<profile-id>` terminal ID.

Current-checkout Threads resolve the profile directory from the Project root. Task-backed Threads resolve it from `thread.worktreePath`. Running state is reconstructed from terminal metadata; it is never persisted as profile state. The provider process and Dev Server PTY are independent, so turn completion does not close the Dev Server.

## Local Project discovery

`filesystem.discoverProjects` is a read-scoped RPC. The server scans only request roots already approved in client settings. It canonicalizes real paths, deduplicates case-insensitively on macOS and Windows, stops at repository markers, skips hidden/cache/dependency directories, tolerates partial unreadability, and enforces depth, directory-count, time, and result limits. Adding a result uses the existing Project create command with `createWorkspaceRootIfMissing: false`.

## Provider model discovery

Antigravity status probes the installed CLI version and then the documented `agy models` command. Only a successful model command contributes explicit choices. Auto and configured custom model IDs remain available as fallbacks; a configured ID is not treated as provider-validated until a real launch succeeds.
