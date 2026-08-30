# Plan and run a Mission

Missions created from approved Architect plans behave like ordinary Missions but retain the immutable planning base commit. They remain draft after approval. Manual Missions remain unchanged and continue to use the existing workspace-baseline behavior.

A Mission is a durable, human-authored objective over existing Tasks in one Project. It adds ordered membership and explicit prerequisite edges; it does not duplicate Task provider, workspace, ownership, review, or result state. A Task can belong to at most one Mission.

## Create the plan

Open **Command Deck → Missions**, create a Mission, then create a canonical Task inside it or attach an eligible draft Task from the same Project. Add dependencies with the two accessible Task selectors. An edge `Contract → Backend` means Backend stays blocked until Contract is completed. Nebula rejects self-edges, duplicates, missing members, and cycles on the server and shows the involved Task path.

Graph view shows dependency lines, Task status, provider, role, and computed wave. Waves are deterministic topological layers: independent Tasks appear together and later waves wait for every prerequisite. Waves are derived from the current graph and Task state. Approved Architect Missions may also create a durable [Supervised Mission Run](supervised-runs.md); manual Missions keep the explicit start flow.

The Mission Command Center summarizes progress as discrete facts rather than an effort percentage: current Task completion, active work, dependency and resource waits, current-review coverage, Integration state, and configured final-gate coverage. **Needs Attention** aggregates links into the same canonical Task, review, ownership, resource, or Integration state. It does not persist a second blocker list.

Select a Task title or graph node to inspect that same canonical Task in Command Deck. Use the Terminal Center action beside a Task to open its Task-bound execution context directly; Nebula selects the Task, reveals its inspector, and restores an existing Task pane when one is already present. No Mission-only workspace or copied Task state is created.

Supervised plans materialize only Tasks that can execute in a writable Task worktree. Independent reviewers are assigned by Mission policy after a Task handoff, and an integrator Task is created only when a concrete Integration conflict needs resolution. They do not appear as speculative read-only Tasks in the initial plan.

## Activate and start work

Activate a valid non-empty draft Mission when the authored graph is ready. Activation does not start anything. A draft Task is **Ready** only when every prerequisite is completed and its provider, ownership, and workspace start configuration is valid. Otherwise Command Deck shows explicit blockers or configuration attention.

Choose one ready Task or **Start ready Tasks** for manual execution. For an approved, materialized Architect Mission, **Start supervised Run** authorizes deterministic later-wave advancement under the documented concurrency, resource, completion, and attention policies. Both paths use the same canonical Task flow.

Completed Tasks satisfy dependencies. A historical completed Task without a retained Task Result remains compatible but is labeled as degraded evidence. A cancelled prerequisite does not silently satisfy an edge; edit or remove the dependency if the plan was wrong. Provider or workspace failures remain visible attention while downstream work stays blocked.

## Edit, cancel, complete, and integrate

Architect proposals keep every validated edit as a numbered Plan version with timestamp, source, and reason. The current version is the only version approval can materialize. The latest version diff names added or removed Tasks and provider, role, acceptance, ownership, resource, and dependency changes. Editing always reruns deterministic validation before approval; older versions remain audit history.

Draft graphs are editable. After activation, dependency changes and Task removal require explicit confirmation, only draft Tasks can be removed, and dependencies involving started work cannot be removed. Every accepted change is persisted in Mission activity. There is no casual dependency override.

Cancelling a Mission stops its coordination lifecycle without deleting or cancelling its Tasks, Threads, worktrees, results, or Integration Batch. Manual completion remains explicit. An approved Swarm Run launched with automatic Integration and canonical Mission completion transitions the Mission to **Completed** only after every required Task, current review, required Task gate, Integration step, and required final gate passes. Runs launched without that policy remain visibly **Mission: Active · Latest Run: Completed** rather than implying execution is still running.

When completed Mission Tasks retain approved results, **Create Integration Batch** suggests topological order. Review and reorder it before confirming. The existing Integration workflow still owns overlap acknowledgement, conflict resolution, validation, cleanup, and Ready state.

If the linked Batch fails or is cancelled, the Mission keeps that evidence visible and offers an explicit replacement Batch. Preparing, applying, conflicting, validating, and Ready Batches cannot be replaced.

## Pause, resume, and recover

**Pause Run** pauses scheduling. It does not claim to suspend every provider process: already-running provider turns continue according to their actual runtime capability, while no new Task is admitted. **Resume Run** reconciles persisted Task, dependency, resource, provider, review, and Integration state before scheduling again. **Abort Swarm Run** removes automatic scheduling authority while preserving Tasks, Threads, worktrees, attempts, and history.

Cancelling an individual Task preserves its worktree initially and releases its resource claims through the canonical Task lifecycle. Dependents remain blocked with a concrete cancelled-prerequisite reason. Cancelling a Mission preserves its Tasks and worktrees; removal remains an explicit later action.

After a client or server restart, the Command Center reconstructs the persisted state. A recovery banner appears only when that restart produced an actionable reconciliation result, such as an interrupted provider attempt requiring attention. Simply reopening a persisted Mission does not claim that a recovery occurred. Dismissing the banner hides the summary without deleting the durable recovery decision or attempt history.

Integration startup reconciliation compares the persisted item state with the artifact commit, recorded applied commit, Integration branch HEAD, and current worktree. It skips already-applied Task commits, resumes only the next durable pending item, and turns an interrupted final-validation process into an explicit rerun requirement. A conflict remains **Integration blocked** until a human resolves it; Nebula never silently auto-resolves it.

The Mission timeline filters and searches the canonical Mission activity history locally. Task attempt history remains under the same Task and distinguishes transient retry from provider replacement.

When the canonical completion criteria pass, Nebula persists both the Mission and Run as **Completed** and stores the factual final report with the Run. Mission History reconstructs the Plan, graph, Tasks, attempts, reviews, Integration Batch, final gates, exact Integration SHA, and final report from canonical events after reload, runtime restart, or a new frontend session. The report counts deliberate operator actions such as provider replacement, sent review remediation, resolved ownership or coordination requests, Integration intervention, and human Plan edits; automatic scheduling and bounded retry are not human interventions.

Task handoffs keep every historical risk. The final report separately shows **Remaining risks** and **Resolved during Mission**. A risk leaves the remaining set only when a captured Integration remediation commit contains an exact `Nebula-Resolved-Risk: <historical risk>` trailer. Passing gates, a later approval, or an unrelated Integration change does not erase a warning by itself. Older persisted reports keep their original legacy known-risk presentation and are not rewritten.

## Current limitations

Shared Resource blocking is implemented separately from dependency readiness. A Task may be ready by
dependencies but waiting for an exclusive resource held by another Task. Bulk starts serialize
deterministically: one contender starts and the other remains waiting. Releasing the lease makes it
resource-ready. A Supervised Run may continue it automatically under the user's prior authorization.
On runtime startup Nebula preserves leases for legitimate active Tasks, releases leases whose owners
are terminal or missing, and then recomputes the deterministic wait queue. The War Room names the
resource and current holder; agents do not coordinate the lock through chat prompts.
Automatic Task creation outside an approved Architect plan, automatic plan approval, automatic
`main` merge, unlimited autonomy, and AI conflict resolution are not implemented. Supervised Swarm,
one bounded transient retry, manual provider replacement, human-initiated remediation, and
policy-gated automatic Integration are implemented.
