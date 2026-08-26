# Watch changes in Preview Stage

Preview Stage is the large-view mode for one verified local Dev Server. Open it from a running Dev Server or Preview pane.

The live application dominates the view. The header shows the selected Project, Workspace or branch context, server name, URL, and textual status. Actions let you reload, restart the server, open the URL in the system browser, choose a desktop, tablet, or mobile viewport, and return to the exact Terminal Workspace.

## Pin an active agent

Choose a Codex or Antigravity Thread to pin beside the Preview. The side panel renders the canonical live Thread, including current model, conversation output, streaming tool events, and composer. It does not create another provider session.

The Dev Logs panel stays attached to the server's real terminal output so compile, HMR, and runtime errors remain visible. Unstructured output is shown as-is; Nebula does not invent log levels.

If the app supports HMR, the embedded Preview updates through the app's own runtime. **Reload** performs a real frame reload. Escape or **Return to Workspace** restores the prior pane arrangement and selection.
