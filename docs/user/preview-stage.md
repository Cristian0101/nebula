# Watch changes in Preview

Preview is the large-view mode for one verified local Dev Server. Open it from a running Dev Server or Preview pane, or switch modes from the Terminal Workspace header.

The live application dominates the view. The header shows the selected Project, Workspace or branch context, server name, detected URL, and separate server and Preview status. Actions let you reload, restart a Nebula-managed server, open the URL in the system browser, and return to the exact Workbench. The bottom Agent and Logs tray stays collapsed until requested.

**Build + Preview** keeps that same live app beside a resizable rail with the active Agent and Dev Logs. Switching between Preview, Build + Preview, and Workbench preserves pane membership, selection, dock order, and saved ratios.

## Capture a change in Design Mode

On desktop, choose **Design Mode** in the Preview header. Design Mode snapshots the Preview pane, URL, title, Workspace, and current workspace mode before opening, then starts element capture immediately. The header and inspector show **Editing this Preview**, and every capture and reload stays on that exact surface; Nebula does not start, attach, or switch to a different server. Pick any surface in the live app, including the page background, then review its screenshot, mapped component and source line when available, HTML context, and authored styles in the inspector. Add a note, choose a Chat agent in the same Workspace, and send the capture. If the provider is currently open only as a Terminal, choose it from the target menu to create or restore the canonical Chat companion first. Nebula uploads the screenshot and sends the structured element context as a normal turn to that canonical Thread. Exit restores the mode that was active before Design Mode.

If source mapping is unavailable, the capture remains useful but the inspector labels the missing source instead of guessing. Terminal processes remain terminal processes; handoff is enabled only after Nebula has a durable Chat Thread for the selected provider.

The desktop app renders Workspace previews through Nebula's managed Preview runtime, which reports navigation loading and failures instead of treating an error document as live. On surfaces that cannot use the managed runtime, applications may intentionally deny iframe embedding through `X-Frame-Options` or Content Security Policy. Nebula explains that the healthy app is browser-only and offers **Open in Browser**; it does not weaken the application's security headers. Externally attached servers likewise omit Restart because Nebula does not own their process.

## Pin an active agent

Choose a Codex or Antigravity Thread to pin beside the Preview. The side panel renders the canonical live Thread, including current model, conversation output, streaming tool events, and composer. It does not create another provider session.

The Dev Logs panel stays attached to the server's real terminal output so compile, HMR, and runtime errors remain visible. Unstructured output is shown as-is; Nebula does not invent log levels.

If the app supports HMR, the embedded Preview updates through the app's own runtime. **Reload** performs a real navigation reload. When a managed server is stopped or unreachable, **Restart Server** relaunches the approved command and Preview follows the scanner-verified URL. Escape or **Return to Workbench** restores the prior pane arrangement and selection.
