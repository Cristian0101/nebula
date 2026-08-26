# Watch changes in Preview Stage

Preview Stage is the large-view mode for one verified local Dev Server. Open it from a running Dev Server or Preview pane.

The live application dominates the view. The header shows the selected Project, Workspace or branch context, server name, detected URL, and textual status. Actions let you reload, restart a Nebula-managed server, open the URL in the system browser, and return to the exact Terminal Workspace. Preview distinguishes a running process from HTTP readiness and shows explicit stopped, connecting, loading, and embedding-blocked states instead of an unexplained blank frame.

Some applications intentionally deny iframe embedding through `X-Frame-Options` or Content Security Policy. When Nebula detects that policy, Preview explains that the healthy app is browser-only and offers **Open in Browser**. Nebula does not weaken or bypass the application's security headers. Externally attached servers likewise omit Restart because Nebula does not own their process.

## Pin an active agent

Choose a Codex or Antigravity Thread to pin beside the Preview. The side panel renders the canonical live Thread, including current model, conversation output, streaming tool events, and composer. It does not create another provider session.

The Dev Logs panel stays attached to the server's real terminal output so compile, HMR, and runtime errors remain visible. Unstructured output is shown as-is; Nebula does not invent log levels.

If the app supports HMR, the embedded Preview updates through the app's own runtime. **Reload** performs a real frame reload. When a managed server is stopped or unreachable, **Restart Server** relaunches the approved command and Preview follows the scanner-verified URL. Escape or **Return to Workspace** restores the prior pane arrangement and selection.
