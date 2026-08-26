# Run Nebula Alpha

This path gets a developer with an installed, authenticated provider CLI to a useful Nebula action in about five minutes.

For persistent local macOS dogfood:

1. Install `Nebula (Alpha).app` in Applications.
2. Open **Nebula (Alpha)** from Applications or Finder.
3. Or launch it through macOS LaunchServices:

   ```bash
   open -a "Nebula (Alpha)"
   ```

Do not rely on a Nebula dev process launched inside a Codex implementation session as your persistent daily app; the coding harness may clean up its child processes after the session completes.

## 1. Start Nebula from source

For a source checkout, install the pinned dependencies once and start the local runtime:

```bash
vp i
vp run dev
```

Open the complete pairing URL printed by the server. Keep the token in the URL; the bare origin cannot pair a new browser.

For disposable QA, always provide an explicit home outside normal user data:

```bash
vp run dev --home-dir /tmp/nebula-qa-home
```

Never point a test runtime at `~/.t3` or `~/.nebula`.

## 2. Open or discover a repository

Choose **New project**, select an existing local Git repository, and confirm the repository name and current checkout. Nebula does not publish or merge it automatically.

For a larger development folder, open **Settings → Local Projects**, approve one or more discovery folders, and choose **Refresh**. Search also includes repositories found under those approved roots. **Add & Open** registers the canonical path once and opens a Thread; Nebula does not scan your whole home or disk.

## 3. Check providers

Open **Settings → Providers**. Each provider reports whether it is enabled, installed, authenticated, ready, and which version Nebula detected.

- Use **Refresh** after installing or authenticating a CLI.
- Authentication remains owned by the provider CLI. Nebula does not store provider credentials.
- Enable only providers you intend Nebula to run.

## 4. Choose a Project mode

Opening a Project now shows **Project Home** instead of immediately creating a Chat. Choose:

- **Open Terminal Center** for a persistent live workspace of shells, provider Threads, Dev Servers, tests, logs, Git status, and previews;
- **Run a Swarm** to start in Command Deck's Mission Architect;
- **Quick Thread** for the familiar lightweight conversation flow.

**Swarm** and **Terminal Center** are first-class sidebar destinations. Swarm shows the contextual Project's latest planning state; the ordinary Thread list continues to show active canonical Threads. Global Terminal Center supervises active Threads across Projects.

## 5. Launch a provider session

From the project menu, open **Terminal Center**. The Default Terminal Workspace starts with a live Shell already rooted in the Project. Choose an empty Grid cell or **New Pane** to add Codex, Antigravity, another Shell, an approved Dev Server, Preview, Tests, Logs, Git Status, or an Existing Thread.

A provider pane is the canonical Thread. It streams real output and accepts the next turn without creating a duplicate chat surface. A shared checkout is convenient but can collide with other writers; an isolated Task worktree remains the safe default for parallel implementation.

Terminal Workspaces support a 4-by-4 Grid, persistent Freeform geometry, deterministic Split View, and Focus. Hide removes only the pane reference; the Thread and useful processes remain intact and the Hidden panes menu restores them explicitly. Named Workspaces and the last-used state persist across navigation and restart.

Choose **New Pane → Dev Server** for the first run. Nebula suggests supported Project scripts, shows the command and working directory, and waits for **Approve & Start** before executing. A verified URL can open in a Preview pane or the large Preview Stage beside a live agent and server logs.

Antigravity model choices come from the installed `agy models` command. When discovery is unavailable, use Auto or an explicit custom model ID; Nebula does not claim a custom ID is valid until the CLI accepts it.

## 6. Create structured work

Open **Command Deck** for the project.

- **Task**: one bounded unit of work with a provider, ownership rules, acceptance criteria, and an isolated worktree.
- **Mission**: an explicit Task DAG.
- **Integration**: a separate worktree that applies approved Task artifacts and runs final validation.

For a manual workflow, create a Task, define ownership, start it, inspect its diff and handoff, run approved gates, request independent review, then complete it.

## 7. Create a Swarm Brief

Open **Swarm**. Describe the objective and constraints, select a Planner, choose the 2, 4, 8, or 12-agent preset (or Custom), assign ready providers, and set the maximum writable concurrency. The Planner reads only bounded repository evidence against the recorded clean commit and returns a proposal; it does not modify the repository.

Review the Team Plan's roster, Tasks, dependencies, checkpoints, ownership, providers, acceptance criteria, assumptions, warnings, and risks. Edit anything necessary, then explicitly approve the plan. Approval and Run remain separate actions.

## 8. Run Supervised Swarm

Choose **Run Swarm**, then supervise in the War Room:

- maximum active Tasks;
- routing profile;
- retry and remediation limits;
- independent-review requirement;
- Automatic Integration;
- final approved quality commands and their Task/Integration scope.

Choose **Run Swarm** only after the frozen policy is correct. Nebula schedules ready Tasks, respects dependencies and Shared Resources, injects prerequisite context, and advances later waves. It stops the affected branch when human judgment is required.

When a named checkpoint requires human approval, verify the displayed Task, gate, and review evidence, then choose **Approve checkpoint**. The server will reject early approval; the client cannot bypass the barrier.

## 9. Resolve attention and inspect Integration

An attention card should explain what stopped, why, and the available action. Typical boundaries are an ownership request, unavailable provider, requested review changes, failed gate, overlap acknowledgement, or Git conflict.

When Automatic Integration is enabled, successful Tasks seed a deterministic Integration Batch. **Ready** means the isolated Integration worktree passed its approved final gates. It does not mean `main` was merged or a PR was opened.

If Nebula or the server restarts during a provider turn, gate, review, remediation, or Integration step, reopen the same Project instead of recreating the work. Canonical Tasks, Threads, worktrees, attempts, and review history are durable. Interrupted gates never count as passing; rerun the affected gate through the visible recovery action.

## 10. Use the desktop Alpha

Mount the arm64 DMG and launch **Nebula (Alpha)**. The desktop app uses the same Projects, Terminal Center, Command Deck, provider readiness, and recovery model as the web client. Provider authentication remains owned by the provider CLI installed on the host.

For acceptance or support work, use a disposable `T3CODE_HOME` so test Projects and Threads cannot touch normal user state. A restart should preserve the Project, canvas nodes, and canonical Threads in that isolated home.

For current release evidence and known blockers, see [Alpha acceptance](../release/ALPHA_ACCEPTANCE.md).
