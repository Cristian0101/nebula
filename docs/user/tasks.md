# Review and restore a Task

Architect-generated Tasks are proposals until plan approval. Approval creates ordinary draft Builder Tasks with the human-confirmed provider/model, acceptance criteria, ownership, and Shared Resource requirements. It does not create a Thread or worktree.

For manual multi-Task work, open **Command Deck** from the active Project menu or Project settings. See [Coordinate Tasks in Command Deck](command-deck.md).

A Task may belong to one Mission. It remains the same canonical Task with the same provider, ownership, isolated workspace, review, and result lifecycle; Mission membership adds only explicit dependencies and derived readiness. See [Plan and run a Mission](missions.md).

Managed Builder Tasks keep their work in an isolated workspace. Open a Task in project settings and expand **Task Changes** to inspect the complete result from the Task's base commit to its current workspace. The file list includes committed, staged, unstaged, and untracked changes. Select a file to load its patch; binary and oversized files show a safe placeholder.

Choose **Prepare completion** when the work is ready. Nebula validates ownership, captures an immutable review snapshot, and prepares a structured handoff. Git evidence is read-only. You can edit the summary, reported tests, assumptions, interface changes, migrations, risks, and follow-ups before marking the handoff ready.

If the workspace changes after preparation, the snapshot and handoff become stale. Prepare them again before completing the Task. Completion always performs ownership validation again and checks that the reviewed snapshot still matches the workspace.

Optional acceptance criteria record what the implementation should prove. You can edit them freely on a draft Task. After execution starts, Command Deck asks for explicit confirmation because the edit invalidates any current review evidence. For quality gates, independent review, review rounds, and completion rules, see [Review Tasks with Quality Gates](reviewing-tasks.md).

## Restore the Task workspace

**Restore Task to Baseline** affects only the managed Task workspace. Nebula first retains the complete pre-restore contents under a recovery reference, then restores the Task branch and files to the recorded base commit. Published Task branches are refused because rewriting them would be unsafe.

The Task remains active after restoration. Its previous review becomes stale, ownership is revalidated, and the provider conversation remains available as history. Use **Undo restore** to recover the retained pre-restore contents. Recovery references are retained locally and are not deleted automatically.

## Integrate completed results

Completed Builder Tasks that retain a ready handoff, valid ownership evidence, required quality passes, and any required approving review can be selected for an Integration Batch. Integration consumes the immutable completed result and approved snapshot, not later worktree edits. See [Integrate approved Tasks](integrating-tasks.md).

## Shared Resources

Select any Project Shared Resources a Task requires during creation or in its Resources inspector.
Starting acquires every available requirement together. If another Task holds one, the Task remains
unstarted and identifies the holder. Active requirement changes ask for confirmation and use the same
all-or-nothing rule. Completion or cancellation releases held leases.

Resource compliance is separate from ownership: a path can be writable but still fail review or
completion when the Task changed a Shared Resource without its lease.
