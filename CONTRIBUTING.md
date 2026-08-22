# Contributing to Nebula

Nebula is in its repository-foundation phase. Changes should preserve T3 Code compatibility while adding only the orchestration capabilities Nebula needs.

## Before you start

- Read [UPSTREAM.md](./UPSTREAM.md) and the relevant ADRs in `docs/adr/`.
- Keep provider execution provider-neutral: provider-specific behavior belongs at the existing adapter boundary.
- Do not add a parallel provider runtime, Git layer, event bus, or desktop shell when T3 Code already offers the primitive.
- Never commit secrets, credentials, local databases, or generated artifacts.

## Development workflow

1. Update `main` from `origin` with a fast-forward pull.
2. Create a focused branch.
3. Make one coherent change.
4. Run the relevant upstream-compatible validation.
5. Inspect the diff and open a focused pull request. Do not push directly to `main`.

Use Node 24 and the repository's Vite+ workflow (`vp i`, then the relevant `vp` commands). Do not switch package managers or upgrade dependencies incidentally.

## Branch naming

Use one of:

```text
feat/<description>
fix/<description>
docs/<description>
refactor/<description>
security/<description>
chore/<description>
upstream-sync/YYYY-MM-DD
```

Future Nebula-generated task branches are reserved for:

```text
nebula/<mission-short-id>/<task-short-id>
```

Provider names do not belong in runtime task branch identities.

## Architecture discipline

- Every concurrent writable task will eventually require its own Git worktree and explicit ownership.
- Roles are permissions, not personas. Keep read-only, builder, reviewer, and integrator responsibilities distinct.
- Prefer structured contracts and persisted, traceable state to hidden coordination in prompts.
- Add or update an ADR when a change establishes a durable architectural decision.
- Keep future Nebula code isolated and namespaced; avoid broad upstream renames or reorganizations.

## Testing expectations

Run the smallest relevant checks while developing, and include the commands and results in your pull request. Changes crossing contracts, providers, VCS, or client surfaces need coverage for every affected boundary.

## Upstream awareness

Do not rebase published `main` as part of routine upstream maintenance. Use the documented `upstream-sync/YYYY-MM-DD` workflow in [UPSTREAM.md](./UPSTREAM.md), review the complete diff, validate it, and merge through a pull request.
