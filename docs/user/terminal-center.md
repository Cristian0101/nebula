# Work with provider sessions in Terminal Center

During supervised recovery, Terminal Center keeps one visible node for the canonical Task's current provider attempt. Earlier attempt Threads stay durable and can be opened explicitly. See [Recover and route supervised Missions](recovery-routing.md).

Terminal Center is Nebula's freeform manual provider workspace. Open it from a Project's menu, Project settings, or the command palette. It works with zero Tasks and zero Missions: choose a configured provider and Nebula creates one canonical Thread, ready for its first prompt.

## Configure quick launch

The first provider launch asks for a Project preference:

- **Current project checkout** creates a writable Thread in the Project checkout. When more than one writable Thread shares it, Terminal Center shows a persistent shared-checkout warning.
- **New isolated Task-backed workspace** creates a canonical draft Builder Task, records the explicit write path you choose, prepares the existing Task worktree, and binds the new Thread to it. Terminal Center never silently grants `WRITE **`.

The chosen workspace mode and provider model are reused for later one-click launches. Provider availability comes from the configured provider registry. Disabled or unavailable providers stay visible with the reason they cannot launch.

Creating a node does not execute the provider. Select or focus it and send the first prompt through the existing Thread composer when you are ready.

## Organize the canvas

Pan the background, use the mouse wheel to zoom, drag node headers, and choose **Fit all** to frame the visible workspace. The **Arrange** menu offers:

- **Grid** for a regular overview.
- **Provider columns** grouped by configured provider instance.
- **Status lanes** grouped into Ready, Working, and Needs attention.
- **Mission flow** using canonical Mission dependency waves for Task-backed Threads.
- **Radial** with the selected Thread in the center.
- **Compact** for a dense many-session overview.
- **Freeform** to preserve manual positions.

The selected layout, node positions, viewport, visible Thread IDs, and quick-launch preference are local UI settings. Task and Thread projections never contain canvas coordinates. Restarting Nebula restores the same canvas over the same server-persisted Threads.

## Work with Threads and Tasks

Unselected nodes show a lightweight preview rather than mounting complete histories. **Focus** mounts the existing Thread workspace—messages, composer, provider stream, tools, terminal, and supported model controls. Press Escape or choose **Canvas** to return.

Use **Add thread** to place an existing Project Thread or Task Thread on the canvas. Mission Flow uses the Task's existing Mission membership and dependencies. Removing a node only hides it from this canvas; it does not delete the Thread, cancel a Task, or remove a workspace.

Terminal Center and Command Deck are complementary. Terminal Center is for freeform provider sessions and spatial focus switching. Command Deck remains the structured Task, Mission, review, and Integration surface. While a Supervised Mission Run is active, its Task Threads are added to the canvas and the existing **Mission flow** layout remains available.

## Current scope

Terminal Center, Agent Canvas, quick provider launch, automatic layouts, freeform spatial layout, Supervised Run Thread discovery, and Swarm Mission Flow are **implemented**. Canvas edges are reserved for canonical Mission dependencies; Terminal Center does not invent agent-to-agent communication.
