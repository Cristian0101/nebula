# Run approved Dev Servers

Dev Servers use Nebula's existing terminal and process runtime. They are independent of provider turns: finishing a Codex or Antigravity response does not stop the server, and hiding its pane leaves it running.

## First run

Choose **New Pane → Dev Server**. If the Project has no saved profile, Nebula inspects supported Project metadata such as `package.json` and suggests likely `dev`, `start`, or `preview` scripts. A suggestion shows its command and working directory but does not run.

Choose **Approve & Start** to save a Project Dev Server profile and launch it. This explicit approval boundary also applies to discovered test commands. Future panes can reuse the approved profile directly.

Profiles record the Project, display name, approved command, working directory, preferred port, and optional preview URL pattern. Edit profiles in Project settings when the command needs manual arguments or an unsupported port option.

## Runs and ports

A Dev Server pane reports Starting, Running, Stopped, or Failed and provides **Start**, **Stop**, **Restart**, **Preview Stage**, and live terminal output.

Nebula verifies the listening URL before presenting it as live. If the preferred port is occupied and the approved command has a supported port flag, Nebula selects the next available port for that run. The original approved command remains unchanged. This allows the current checkout and an isolated worktree to run simultaneously with distinct working directories and URLs.

Stopping the server is always explicit. **Attach Dev Server** behavior is available by adding a Preview or Logs pane for an already-running approved server instead of creating another process.
