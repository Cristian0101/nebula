# Plan and run a Mission

Missions created from approved Architect plans behave like ordinary Missions but retain the immutable planning base commit. They remain draft after approval. Manual Missions remain unchanged and continue to use the existing workspace-baseline behavior.

A Mission is a durable, human-authored objective over existing Tasks in one Project. It adds ordered membership and explicit prerequisite edges; it does not duplicate Task provider, workspace, ownership, review, or result state. A Task can belong to at most one Mission.

## Create the plan

Open **Command Deck → Missions**, create a Mission, then create a canonical Task inside it or attach an eligible draft Task from the same Project. Add dependencies with the two accessible Task selectors. An edge `Contract → Backend` means Backend stays blocked until Contract is completed. Nebula rejects self-edges, duplicates, missing members, and cycles on the server and shows the involved Task path.

Graph view shows dependency lines, Task status, provider, role, and computed wave. Waves are deterministic topological layers: independent Tasks appear together and later waves wait for every prerequisite. Waves are derived from the current graph and Task state. Approved Architect Missions may also create a durable [Supervised Mission Run](supervised-runs.md); manual Missions keep the explicit start flow.

Select a Task title or graph node to inspect that same canonical Task in Command Deck. Use the Terminal Center action beside a Task to open its Task-bound execution context directly; Nebula selects the Task, reveals its inspector, and restores an existing Task pane when one is already present. No Mission-only workspace or copied Task state is created.

Supervised plans materialize only Tasks that can execute in a writable Task worktree. Independent reviewers are assigned by Mission policy after a Task handoff, and an integrator Task is created only when a concrete Integration conflict needs resolution. They do not appear as speculative read-only Tasks in the initial plan.

## Activate and start work

Activate a valid non-empty draft Mission when the authored graph is ready. Activation does not start anything. A draft Task is **Ready** only when every prerequisite is completed and its provider, ownership, and workspace start configuration is valid. Otherwise Command Deck shows explicit blockers or configuration attention.

Choose one ready Task or **Start ready Tasks** for manual execution. For an approved, materialized Architect Mission, **Start supervised Run** authorizes deterministic later-wave advancement under the documented concurrency, resource, completion, and attention policies. Both paths use the same canonical Task flow.

Completed Tasks satisfy dependencies. A historical completed Task without a retained Task Result remains compatible but is labeled as degraded evidence. A cancelled prerequisite does not silently satisfy an edge; edit or remove the dependency if the plan was wrong. Provider or workspace failures remain visible attention while downstream work stays blocked.

## Edit, cancel, complete, and integrate

Draft graphs are editable. After activation, dependency changes and Task removal require explicit confirmation, only draft Tasks can be removed, and dependencies involving started work cannot be removed. Every accepted change is persisted in Mission activity. There is no casual dependency override.

Cancelling a Mission stops its coordination lifecycle without deleting or cancelling its Tasks, Threads, worktrees, results, or Integration Batch. Completing a Mission is also explicit: every non-cancelled Task must be completed, and a linked Integration Batch must be Ready.

When completed Mission Tasks retain approved results, **Create Integration Batch** suggests topological order. Review and reorder it before confirming. The existing Integration workflow still owns overlap acknowledgement, conflict resolution, validation, cleanup, and Ready state.

If the linked Batch fails or is cancelled, the Mission keeps that evidence visible and offers an explicit replacement Batch. Preparing, applying, conflicting, validating, and Ready Batches cannot be replaced.

## Current limitations

Shared Resource blocking is implemented separately from dependency readiness. A Task may be ready by
dependencies but waiting for an exclusive resource held by another Task. Bulk starts serialize
deterministically: one contender starts and the other remains waiting. Releasing the lease makes it
resource-ready. A Supervised Run may continue it automatically under the user's prior authorization.
Automatic Task creation outside an approved Architect plan, automatic plan approval, automatic
`main` merge, unlimited autonomy, and AI conflict resolution are not implemented. Supervised Swarm,
provider rerouting, bounded remediation, and policy-gated automatic Integration are implemented.
