# Nebula Alpha quick start

This path gets a developer with an installed, authenticated provider CLI to a useful Nebula action in about five minutes.

## 1. Start Nebula

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

## 2. Open a repository

Choose **New project**, select an existing local Git repository, and confirm the repository name and current checkout. Nebula does not publish or merge it automatically.

## 3. Check providers

Open **Settings → Providers**. Each provider reports whether it is enabled, installed, authenticated, ready, and which version Nebula detected.

- Use **Refresh** after installing or authenticating a CLI.
- Authentication remains owned by the provider CLI. Nebula does not store provider credentials.
- Enable only providers you intend Nebula to run.

## 4. Launch a provider session

From the project menu, open **Terminal Center**, choose **Provider +**, select the provider and workspace, then launch. A shared checkout is convenient but can collide with other writers; an isolated Task workspace is the safe default for implementation.

The node is the canonical Thread. Focusing the node opens that same conversation—Nebula does not create a second chat surface.

## 5. Create structured work

Open **Command Deck** for the project.

- **Task**: one bounded unit of work with a provider, ownership rules, acceptance criteria, and an isolated worktree.
- **Mission**: an explicit Task DAG.
- **Integration**: a separate worktree that applies approved Task artifacts and runs final validation.

For a manual workflow, create a Task, define ownership, start it, inspect its diff and handoff, run approved gates, request independent review, then complete it.

## 6. Ask Architect for a Mission

In **Command Deck → Missions**, choose **New → Architect**. Describe the objective and constraints. Architect reads only bounded repository evidence against the recorded clean commit and returns a proposal; it does not modify the repository.

Review the Tasks, dependencies, ownership, providers, acceptance criteria, assumptions, and risks. Edit anything necessary, then explicitly approve and activate the Mission.

## 7. Run Supervised Swarm

Choose **Supervised Swarm**, then review:

- maximum active Tasks;
- routing profile;
- retry and remediation limits;
- independent-review requirement;
- Automatic Integration;
- final approved quality commands and their Task/Integration scope.

Choose **Run Swarm** only after the frozen policy is correct. Nebula schedules ready Tasks, respects dependencies and Shared Resources, injects prerequisite context, and advances later waves. It stops the affected branch when human judgment is required.

## 8. Resolve attention and inspect Integration

An attention card should explain what stopped, why, and the available action. Typical boundaries are an ownership request, unavailable provider, requested review changes, failed gate, overlap acknowledgement, or Git conflict.

When Automatic Integration is enabled, successful Tasks seed a deterministic Integration Batch. **Ready** means the isolated Integration worktree passed its approved final gates. It does not mean `main` was merged or a PR was opened.

For current release evidence and known blockers, see [Alpha acceptance](../release/ALPHA_ACCEPTANCE.md).
