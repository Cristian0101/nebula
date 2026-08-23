# Coordinate Tasks in Command Deck

The Missions section offers both manual Mission authoring and **Plan with Architect**. Architect proposals have their own review surface and do not appear as Missions until explicit approval. Generation and approval both state that no execution has started.

Command Deck is Nebula's desktop-first manual orchestration surface. Its **Tasks**, **Missions**, and **Integration** sections let you run several coding providers against one repository without putting them in one writable checkout. You choose the work, dependencies, provider, model, ownership, and every Start action; Nebula does not plan, schedule, or route work automatically.

Open an active Project's menu and choose **Command Deck**, or open it from Project settings.

## Create and start a Task

1. Choose **New Task**.
2. Enter a title and bounded objective.
3. Choose an available provider and its supported model option.
4. Add at least one write rule. Add read-only or deny rules when the boundary needs to be explicit.
5. Create the Task, then choose **Start**.

The draft appears before it has a Thread or workspace. Start prepares a dedicated Git worktree, creates the canonical provider Thread in that worktree, binds it to the Task, and sends the objective plus ownership context. Repeat the flow to start other Tasks manually. Each writable Builder Task receives its own worktree.

If the assigned provider is no longer ready, the Task and its work remain visible with **Provider unavailable** attention. Starting is blocked until the provider is ready. Provider reassignment is not part of this release.

## Monitor and inspect

The Task rail shows lifecycle, provider/model, role, workspace, changed-file count, handoff state, and the most important attention reason. The summary shows total and active Tasks, review-ready Tasks, attention, changed files, and provider distribution.

Select a Task to see its canonical execution context and inspector:

- **Overview** — objective, provider/model, role, timestamps, cancellation, and terminal workspace cleanup.
- **Ownership** — write, read-only, and deny rules, validation evidence, editing, and manual revalidation.
- **Changes** — the existing base-to-current Task Diff with lazy file patches.
- **Review** — immutable snapshot, structured handoff, approved quality commands and results, reviewer selection, structured review rounds, findings handoff, and Complete Task.
- **Workspace** — isolation state, branch, base commit, worktree path, restore, and undo.

Choose **Open Thread** to continue with the existing provider stream, composer, tools, and terminal. Command Deck does not copy provider output into a second chat. **Stop current turn** is shown only while a cancellable turn is running; there is no invented universal pause control.

The activity area shows meaningful persisted Task, workspace, ownership, review, restore, completion, and cancellation milestones. Raw token streaming remains in the Thread.

## Review, restore, and clean up

Use **Prepare completion** to validate ownership and capture the current review evidence. Review or edit the provider-neutral handoff and mark it ready. Run every required approved quality gate, then request a review when the effective policy requires one. A different provider is recommended when ready; a same-provider choice remains available and is labeled degraded. Any later workspace change makes the snapshot, gate results, and applicable review stale. See [Review Tasks with Quality Gates](reviewing-tasks.md).

**Restore Task** changes only the selected managed worktree and retains a recovery snapshot first. It does not change another Task or the source checkout. Use **Undo restore** while the recovery reference is available. A terminal Task's clean workspace can then be removed explicitly.

## Current scope

Command Deck, manual parallel provider Tasks, Quality Gates, Reviewer, cross-provider review, Missions, explicit Task DAGs, execution waves, and human-controlled wave starts are **implemented**. See [Plan and run a Mission](missions.md).

Manual deterministic Integration Batches and Shared Resource coordination are **implemented** in Command Deck. Select eligible completed Tasks, arrange their order, acknowledge overlapping paths, then create an isolated Integration branch. A Mission may suggest completed results in topological order, but you confirm or change it. The Task rail includes resource blockers and compliance failures; the Resources inspector shows requirements, holders, and evidence. Ownership requests have individual Approve and Deny actions, with a separate confirmation to require an intersecting resource. Command Deck does not merge main, open a PR, auto-approve scope, schedule Tasks, route providers, remediate failures, or run Architect or Swarm Mode. Providers do not share hidden context; findings enter the existing Builder Thread only when the user chooses **Send Review Findings to Builder**.
