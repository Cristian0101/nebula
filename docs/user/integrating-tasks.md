# Integrate approved Tasks

An Integration Batch combines approved completed Task Results into one isolated branch for final review. It does not merge your target branch, push, or open a pull request.

## Eligibility

A Task is selectable when it is completed and its immutable result still points to the retained approved snapshot. Its handoff must be ready, ownership must be valid when required, every required exact Project quality gate must have passed for that snapshot, and any required independent review must be approved. Later edits in the old Task worktree are ignored; they cannot rewrite the completed result.

Every selected Task must share the same exact base commit. If two results mention the same path, Command Deck shows an overlap warning and requires acknowledgement. Overlap is a planning signal, not a prediction that Git will conflict.

## Create and follow a Batch

1. In Command Deck, select eligible completed Tasks.
2. Move them into the intended application order.
3. Review and acknowledge any overlapping paths.
4. Choose **Create Integration**.

From a Mission, **Create Integration Batch** offers completed Mission Tasks with retained results in topological order. This is a suggestion, not an automatic cherry-pick policy: review the selection, move Tasks into the intended order, and confirm explicitly. The Batch stores its Mission association; standalone Batches remain supported.

A Mission may explicitly replace a failed or cancelled linked Batch. The previous Batch remains durable Project evidence, while the Mission points to the replacement. Active and Ready Batches cannot be replaced.

Nebula creates a deterministic artifact commit for each approved snapshot tree. The commit records its Task, Task Result, and snapshot identity and is retained without changing the source or Task worktree. Nebula then creates a dedicated `nebula/integration/*` branch and worktree from the shared base and applies artifacts in the stored order.

## Conflicts and manual resolution

If Git reports a conflict, the Batch pauses and Command Deck lists the unresolved files. Choose **Open Integration Workspace**, resolve and stage every conflicted file, then choose **Continue after resolution**. Nebula records the resulting commit as a human Integration change and resumes the remaining artifacts. **Abort Batch** stops the active cherry-pick while preserving the Integration branch, worktree, and already applied history.

Nebula does not auto-resolve conflicts or auto-commit unrelated external changes. If an editor changes the Integration worktree outside conflict resolution, validation fails closed until the state is reviewed and committed explicitly.

## Final validation and Ready

After all artifacts apply, Nebula captures the Integration HEAD and tree and runs only enabled, exact approved Project gates in the Integration worktree. A required failure prevents Ready. If a gate changes HEAD, the tree, or the worktree, the validation snapshot becomes stale and the Batch fails. When no gates are configured, Command Deck says so instead of inventing a pass.

Ready means the isolated Integration branch passed the configured policy and is ready for human review. Merging main, pushing, and opening a pull request remain separate user-controlled actions.

## Cleanup and limitations

A Ready, failed, or cancelled Batch workspace can be removed only when clean. Cleanup removes the worktree and preserves the branch and durable Batch evidence. A linked Mission becomes eligible for explicit completion only when the Batch is Ready. Automatic main merge, automatic pull requests, shared-resource locks, scheduling, automated conflict agents, and Swarm Mode are not part of this workflow.
