# Work with provider sessions in Terminal Center

During supervised recovery, Terminal Center keeps one visible node for the canonical Task's current provider attempt. Earlier attempt Threads stay durable and can be opened explicitly. See [Recover and route supervised Missions](recovery-routing.md).

Terminal Center is Nebula's freeform manual provider workspace. Open a Project to reach **Project Home**, then choose **Open Terminal Center**. You can also open it from Project settings or the command palette. It works with zero Tasks and zero Missions: choose a configured provider and Nebula creates one canonical Thread, ready for its first prompt.

**Global Terminal Center** is available from the sidebar and command palette. It supervises canonical Threads from several Projects on one canvas. Choose a Project, provider, model, and optionally an approved Dev Server profile when creating a session. Global launch always uses the current checkout; use the Project Terminal Center when you need an isolated Task worktree.

## Configure quick launch

The first provider launch asks for a Project preference:

- **Current project checkout** creates a writable Thread in the Project checkout. When more than one writable Thread shares it, Terminal Center shows a persistent shared-checkout warning.
- **New isolated Task-backed workspace** creates a canonical draft Builder Task, records the explicit write path you choose, prepares the existing Task worktree, and binds the new Thread to it. Terminal Center never silently grants `WRITE **`.

The chosen workspace mode and provider model are reused for later one-click launches. Provider availability comes from the configured provider registry. Disabled or unavailable providers stay visible with the reason they cannot launch.

Creating a node does not execute the provider. Select or focus it and send the first prompt through the existing Thread composer when you are ready.

## Organize the canvas

Pan the background, use the mouse wheel to zoom, drag node headers, and choose **Fit all** to frame the visible workspace. The **Arrange** menu offers:

- **Grid** for a regular overview.
- **Project columns** grouped by Project. This is most useful in Global Terminal Center.
- **Provider columns** grouped by configured provider instance.
- **Status lanes** grouped into Ready, Working, and Needs attention.
- **Mission flow** using canonical Mission dependency waves for Task-backed Threads.
- **Radial** with the selected Thread in the center.
- **Compact** for a dense many-session overview.
- **Freeform** to preserve manual positions.

The selected layout, node positions, viewport, visible Thread IDs, and quick-launch preference are local UI settings. Task and Thread projections never contain canvas coordinates. Restarting Nebula restores the same canvas over the same server-persisted Threads.

Global and Project canvases persist independently. Their membership, layout, manual positions, viewport, and selection do not overwrite one another.

## Work with Threads, Tasks, and Dev Servers

Unselected nodes show a lightweight preview rather than mounting complete histories. Single-click selects a node; double-click or Enter focuses it. **Focus** mounts the existing Thread workspace—messages, composer, provider stream, tools, terminal, and supported model controls. Press Escape or choose **Canvas** to return. Exactly one heavyweight Thread workspace is mounted at a time.

When a Project has an approved Dev Server profile, nodes show its live status and preferred port. Select a node to start, stop, restart, preview, or open logs. The server is a dedicated canonical terminal process tied to that Thread workspace; completing a provider turn or hiding the canvas node does not stop it.

Use **Add thread** to place an existing Project Thread or Task Thread on the canvas. Mission Flow uses the Task's existing Mission membership and dependencies. Removing a node only hides it from this canvas; it does not delete the Thread, cancel a Task, or remove a workspace.

Terminal Center and Command Deck are complementary. Terminal Center is for freeform provider sessions and spatial focus switching. Command Deck remains the structured Task, Mission, review, and Integration surface. While a Supervised Mission Run is active, its Task Threads are added to the canvas and the existing **Mission flow** layout remains available.

Each node shows a textual **Ready**, **Working**, or **Needs attention** state alongside its current action. The border, tint, and shadow transition only when canonical Thread state changes; there is no decorative timer or simulated activity. Reduced-motion preferences disable those transitions.

## Current scope

Project and Global Terminal Center, quick provider launch, automatic layouts, freeform spatial layout, approved Dev Servers, Supervised Run Thread discovery, and Swarm Mission Flow are **implemented**. Canvas edges are reserved for canonical Mission dependencies; Terminal Center does not invent agent-to-agent communication.
