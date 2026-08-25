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

- **Open Terminal Center** for direct provider sessions and Dev Servers;
- **Run a Swarm** to start in Command Deck's Mission Architect;
- **Quick Thread** for the familiar lightweight conversation flow.

Global Terminal Center in the sidebar supervises active Threads across Projects.

## 5. Launch a provider session

From the project menu, open **Terminal Center**, choose a provider in the quick launcher, select the provider and workspace defaults when prompted, then launch. A shared checkout is convenient but can collide with other writers; an isolated Task workspace is the safe default for implementation.

The node is the canonical Thread. Focusing the node opens that same conversation—Nebula does not create a second chat surface.

Terminal Center supports Grid, Project columns, Provider columns, Status lanes, Mission flow, Radial, Compact, and Freeform layouts. Freeform positions and canvas membership persist across layout changes and restarts. Only the focused node mounts the full Thread workspace.

Antigravity model choices come from the installed `agy models` command. When discovery is unavailable, use Auto or an explicit custom model ID; Nebula does not claim a custom ID is valid until the CLI accepts it.

## 6. Create structured work

Open **Command Deck** for the project.

- **Task**: one bounded unit of work with a provider, ownership rules, acceptance criteria, and an isolated worktree.
- **Mission**: an explicit Task DAG.
- **Integration**: a separate worktree that applies approved Task artifacts and runs final validation.

For a manual workflow, create a Task, define ownership, start it, inspect its diff and handoff, run approved gates, request independent review, then complete it.

## 7. Ask Architect for a Mission

In **Command Deck → Missions**, choose **New → Architect**. Describe the objective and constraints. Architect reads only bounded repository evidence against the recorded clean commit and returns a proposal; it does not modify the repository.

Review the Tasks, dependencies, ownership, providers, acceptance criteria, assumptions, and risks. Edit anything necessary, then explicitly approve and activate the Mission.

## 8. Run Supervised Swarm

Choose **Supervised Swarm**, then review:

- maximum active Tasks;
- routing profile;
- retry and remediation limits;
- independent-review requirement;
- Automatic Integration;
- final approved quality commands and their Task/Integration scope.

Choose **Run Swarm** only after the frozen policy is correct. Nebula schedules ready Tasks, respects dependencies and Shared Resources, injects prerequisite context, and advances later waves. It stops the affected branch when human judgment is required.

## 9. Resolve attention and inspect Integration

An attention card should explain what stopped, why, and the available action. Typical boundaries are an ownership request, unavailable provider, requested review changes, failed gate, overlap acknowledgement, or Git conflict.

When Automatic Integration is enabled, successful Tasks seed a deterministic Integration Batch. **Ready** means the isolated Integration worktree passed its approved final gates. It does not mean `main` was merged or a PR was opened.

If Nebula or the server restarts during a provider turn, gate, review, remediation, or Integration step, reopen the same Project instead of recreating the work. Canonical Tasks, Threads, worktrees, attempts, and review history are durable. Interrupted gates never count as passing; rerun the affected gate through the visible recovery action.

## 10. Use the desktop Alpha

Mount the arm64 DMG and launch **Nebula (Alpha)**. The desktop app uses the same Projects, Terminal Center, Command Deck, provider readiness, and recovery model as the web client. Provider authentication remains owned by the provider CLI installed on the host.

For acceptance or support work, use a disposable `T3CODE_HOME` so test Projects and Threads cannot touch normal user state. A restart should preserve the Project, canvas nodes, and canonical Threads in that isolated home.

For current release evidence and known blockers, see [Alpha acceptance](../release/ALPHA_ACCEPTANCE.md).
