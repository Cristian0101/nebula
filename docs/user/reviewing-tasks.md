# Review Tasks with Quality Gates

Architect proposal review is plan review, not independent code review. Approving a plan does not satisfy Task quality gates or independent-review policy; those controls still apply after implementation.

Nebula validates one exact Task snapshot at a time. Quality results and independent reviews are evidence for that snapshot only; changing the Task workspace makes them stale and requires a new snapshot.

## Configure quality and review policy

Open Project settings and find **Quality and review**. A quality gate has a label, command, required or optional policy, enabled state, and timeout. Review the exact command and approve it before execution. Editing the command revokes its approval. Repository files cannot silently add or run trusted gates, and Nebula does not create `.nebula/config.yml`.

New managed Builder Tasks require independent review by default and prefer a different provider. Legacy Tasks keep their previous completion behavior. The Project policy can change the default, and Task creation can make the requirement explicit.

## Run gates and request review

Prepare completion and mark the handoff ready. Command Deck shows every command Nebula will run in the selected Task's managed worktree. Required gates must pass before **Start Review** is available; optional failures remain visible but do not block review. A failed, timed-out, cancelled, errored, or stale required gate does not count as a pass. With no configured gates, Command Deck says so and does not invent a passing result.

Select a reviewer provider and model. Nebula recommends a ready provider whose driver differs from the Builder's. If only the same provider is available, review remains possible and the diversity is visibly degraded. Reviewer generation receives the Task objective, acceptance criteria, immutable changed-file and bounded patch evidence, handoff claims, and bounded quality results. It does not receive environment variables, terminal history, credential files, or a writable Builder worktree.

## Act on a review

A round returns **Approve**, **Approve with notes**, **Request changes**, or **Reject**, plus findings, criterion results, security concerns, and required changes. Malformed output fails the review. Blocking or security findings cannot be saved with an approving verdict.

For requested changes, choose **Send Review Findings to Builder** to place a concise, traceable message in the existing Builder Thread. Nebula never starts an automatic remediation loop. After the Builder changes the Task, prepare a fresh snapshot, rerun required gates, and request another round. Earlier rounds remain in history.

A required-review Task can complete only when ownership and Shared Resource compliance are valid, the snapshot and ready handoff are current, all required gates for that snapshot passed, and a current round is **Approve** or **Approve with notes**. Nebula checks the Git change set, including untracked files and both sides of renames, against held resource leases. A writable path can still be resource-invalid. A Supervised Mission Run may invoke this same pipeline automatically; it does not weaken policy or remediate `REQUEST_CHANGES` or failed gates. The completed result satisfies downstream dependencies and remains eligible for a human-created Integration Batch.
