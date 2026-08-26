# Run approved Dev Servers

Dev Servers use Nebula's existing terminal and process runtime. They are independent of provider turns: finishing a Codex or Antigravity response does not stop the server, and hiding its pane leaves it running.

## First run

Choose **New Pane → Dev Server**. If the Project has no saved profile, Nebula inspects supported Project metadata such as `package.json` and suggests likely `dev`, `start`, or `preview` scripts. A suggestion shows its command and working directory but does not run.

Choose **Approve & Start** to save a Project Dev Server profile and launch it. This explicit approval boundary also applies to discovered test commands. Future panes can reuse the approved profile directly.

Profiles record the Project, display name, approved command, working directory, preferred port, and optional preview URL pattern. Edit profiles in Project settings when the command needs manual arguments or an unsupported port option.

## Runs and ports

A Dev Server pane reports Starting, Running, Stopped, or Failed and provides **Start**, **Stop**, **Restart**, **Preview Stage**, and live terminal output.

Nebula verifies the listening URL before presenting it as live. Readiness is matched to the exact managed terminal that owns the listening process, so Preview follows the actual reachable URL even when a framework selects a different port. If the preferred port is occupied and the approved command has a supported port flag, Nebula can select the next available port for that run. Opaque commands do not receive invented port flags or Preview URLs.

Stopping the server is always explicit. To reuse a server that Nebula did not start, open **New Pane**, find it under **Existing Local Servers**, and choose **Attach & Preview**. Nebula records the reachable host and port, opens a server pane plus Preview, and labels the process as externally owned.

An externally owned server has **Preview Stage**, **Open Browser**, and **Detach** actions. It does not expose Stop or Restart because Nebula does not own that process. Detaching removes only the Workspace panes; the server keeps running. If the server later stops, reattach it after the process is listening again.
