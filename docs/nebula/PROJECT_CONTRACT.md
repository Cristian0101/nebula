# Nebula project contract

Future coding agents must read this contract before substantial Nebula work. These rules protect the inherited T3 Code foundation and keep Nebula's differentiation focused on coordination.

## 1. Fork-first rule

Nebula exists because T3 Code already solves large amounts of developer-tool infrastructure. Reuse mature upstream primitives when they satisfy the requirement. Do not rebuild infrastructure for ego.

Preferred:

```text
T3 foundation
+
Nebula orchestration extensions
```

Rejected pattern:

```text
T3 fork
↓
rename everything
↓
rewrite everything
↓
future upstream sync becomes impossible
```

## 2. Inspect before changing

Before any substantial feature:

1. Find the canonical upstream abstraction.
2. Understand its contracts, lifecycle, persistence, and tests.
3. Identify the narrowest extension point.
4. Add focused tests for the new behavior.
5. Document intentional divergence.

Do not invent a competing system because the inherited system uses unfamiliar names or patterns.

## 3. Provider neutrality

Nebula core must not assume one provider. Provider-specific behavior belongs behind the existing driver and adapter abstractions. Do not hard-code current model marketing names into domain logic. Capability differences must be explicit rather than hidden behind a false common denominator.

## 4. Local first

Core Nebula functionality must not require Supabase, a Nebula cloud account, remote repository upload, a central provider proxy, or a hosted database. Remote and team synchronization may be added later through an explicit design; they cannot become accidental prerequisites.

## 5. Authentication boundary

Prefer this boundary:

```text
provider CLI
↓
official provider auth
↓
provider stores credentials
↓
Nebula detects authenticated state
```

Nebula should not collect raw provider passwords, cookies, or tokens. Any new secret storage requires a dedicated threat review and ADR.

## 6. Git is the source-control primitive

Do not recreate Git semantics. Use native Git through the existing VCS driver, Git workflow, worktree, checkpoint, diff, and restore abstractions. Policy may constrain those operations; it must not create a parallel source-control model.

## 7. Reversibility

For every future autonomous or agentic action ask:

> How does the user undo this?

If recovery is unclear, the architecture is incomplete. Capture baselines before writable work, preserve reviewable commits, and make cleanup explicit.

## 8. No parallel competing systems

Do not introduce a second provider registry, task runtime, event architecture, Git abstraction, client transport, process manager, terminal manager, or local database unless the inherited architecture fundamentally cannot satisfy the requirement and an accepted ADR authorizes the replacement.

## 9. Swarm and Command Deck share one runtime

Command Deck and Supervised Swarm share the same Task, Workspace, Provider, Session, Event, Diff, and Review primitives. Manual assignment and automatic routing are two application policies over one runtime, not separate products.

## 10. Security

Protect by default:

- `.env*` files;
- SSH credentials;
- GitHub tokens;
- provider tokens;
- cloud credentials;
- OS credential stores; and
- production databases.

Never print secret values. Never silently escalate permissions. A Git worktree is not an OS security sandbox. Provider permission modes and RPC scopes remain enforced boundaries.

## 11. Branch discipline

Human development branches use:

```text
feat/*
fix/*
docs/*
refactor/*
security/*
chore/*
upstream-sync/YYYY-MM-DD
```

Future Nebula runtime-generated task branches are conceptually:

```text
nebula/<mission-short-id>/<task-short-id>
```

Do not identify runtime tasks by provider because providers can be reassigned. Branch and task identifiers must remain stable across a provider handoff.

## 12. Main protection

Do not directly modify or merge to `main` without the normal review and verification workflow. Future integration automation must target a dedicated integration branch by default, present evidence, and preserve a human-controlled path to `main`.

## Required pre-implementation questions

Before adding a Nebula capability, record concise answers to:

- Which current contract and service own the closest behavior?
- Is the change REUSE, EXTEND, COMPOSE, NEW NEBULA MODULE, or DEFER?
- What persisted command/event/projection changes are required?
- Which web, desktop, mobile, local, and remote surfaces apply?
- What is the reverse operation?
- What focused tests prove the invariant?
- Does this create upstream-sensitive divergence, and where is it documented?
