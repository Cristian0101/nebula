# Contributing to Nebula

Nebula is a local-first orchestration system derived from T3 Code. Follow [AGENTS.md](AGENTS.md) for repository-wide safety and authority, and [current Nebula contracts](docs/nebula/README.md) for implemented boundaries.

## Before you start

- Read [UPSTREAM.md](./UPSTREAM.md) and the relevant ADRs in `docs/adr/`.
- Keep provider execution provider-neutral: provider-specific behavior belongs at the existing adapter boundary.
- Do not add a parallel provider runtime, Git layer, event bus, or desktop shell when T3 Code already offers the primitive.
- Never commit secrets, credentials, local databases, caches, or build output. Intentionally tracked generated source/assets belong with their authoritative generator inputs.

## Development workflow

1. Inspect branch, HEAD, status, untracked files, and worktrees; preserve unrelated changes. Fetch when useful; do not pull unconditionally.
2. Use a focused branch and safe isolation for writable work.
3. Make one coherent change within the requested scope.
4. Run targeted checks; broaden only for affected boundaries or explicit integration/release validation.
5. Inspect the diff. Agents open a PR only when the task authorizes it; PR authority does not grant merge authority. Do not push directly to `main`.

Use the Node version declared in `package.json` and the repository's Vite+ workflow (`vp i`, then the relevant `vp` commands). Do not switch package managers or upgrade dependencies incidentally.

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

Nebula runtime Task branches use provider-neutral identities, conceptually:

```text
nebula/<mission-short-id>/<task-short-id>
```

Provider names do not belong in runtime task branch identities.

## Architecture discipline

- Writable Nebula Builder Tasks use their own Git worktree and explicit ownership. Worktrees do not isolate shared configuration or credentials; see [the configuration boundary](docs/internals/worktree-configuration.md).
- Roles are permissions, not personas. Keep read-only, builder, reviewer, and integrator responsibilities distinct.
- Prefer structured contracts and persisted, traceable state to hidden coordination in prompts.
- Add or update an ADR when a change establishes a durable architectural decision.
- Extend canonical Nebula boundaries; avoid incidental upstream renames or reorganizations.

## Testing expectations

Run the smallest relevant checks while developing, and include the commands and results in your pull request. Changes crossing contracts, providers, VCS, or client surfaces need coverage for every affected boundary.

## Upstream awareness

Do not rebase published `main` as part of routine upstream maintenance. Use the documented `upstream-sync/YYYY-MM-DD` workflow in [UPSTREAM.md](./UPSTREAM.md), review the complete diff, validate it, and merge through a pull request.
