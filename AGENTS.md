# AGENTS.md — Nebula

## Purpose and authority

Nebula is a local-first coding-agent orchestration system derived from T3 Code. It adds Tasks, ownership, isolated worktrees, Missions, provider integration, supervised execution, review, quality gates, and integration workflows.

- The current user task defines scope and granted authority, subject to host/system safeguards.
- This file defines durable repository-wide constraints. Scoped skills/contracts add detail without weakening these safeguards; tool rules are thin adapters.
- Current implementation establishes behavior; current Nebula contracts establish intent. Historical milestones, release notes, upstream snapshots, and debugging observations are context, not standing authority.
- Resolve ordinary choices autonomously within scope. Escalate conflicts only when they materially block safe execution; preserve credentials, data, permission boundaries, and unrelated work.
- Start with [Nebula docs](docs/nebula/README.md), the [project contract](docs/nebula/PROJECT_CONTRACT.md), and relevant [architecture](docs/nebula/ARCHITECTURE.md)/[extension contracts](docs/nebula/EXTENSION_CONTRACT.md). [UPSTREAM.md](UPSTREAM.md) preserves T3 attribution and scoped sync guidance.

## Architecture and permissions

- Extend established commands, pure deciders, persisted events, projections, reactors/effects, and runtime coordination. Do not create competing provider, Git, event, transport, database, or process systems.
- Manual Command Deck and supervised Mission/Swarm policies share canonical Tasks, workspaces, providers, sessions, review, and integration primitives. UI views do not own parallel execution state.
- Provider credentials remain provider-owned. Do not move, duplicate, expose, or reinterpret them outside established provider boundaries.
- Preserve per-provider permission modes, authenticated transports, and per-method RPC authorization. Never bypass these for debugging or convenience.
- Inspect [current provider registration](apps/server/src/provider/builtInDrivers.ts) when providers matter; do not assume a historical provider count or identical capabilities.
- Core local operation must not acquire a hosted database/account prerequisite. Optional remote/relay behavior has separate authentication and verification boundaries.
- Prefer the smallest model that preserves these contracts, responsive clients, and truthful readiness/error states.

## State and worktree safety

- Preserve unrelated user work and local configuration. Inspect branch, HEAD, status (including untracked files), worktrees, and ownership before edits or Git operations.
- Never delete user or test state because a generic setup recipe says to. Establish ownership, disposability, current process use, and destructive authority first.
- Do not blanket-delete `.t3`, SQLite databases/journals, userdata, or worktree state. Prefer a fresh task-owned fixture directory.
- Never run tests against live/business state or open it read-write. For snapshots and fixtures use the [SQLite reference](.agents/skills/test-t3-app/references/sqlite-fixtures.md); preserve read-only sources and existing snapshots.
- Worktrees isolate tracked files but are not security sandboxes. Determine whether configuration is copied, symlinked, shared, generated, or externally managed before editing it.
- Current `t3.json` setup creates independent `.env` and `infra/relay/.env` copies when destinations are missing, preserves existing regular files, and refuses existing aliases. Previously imported setup actions and older worktrees may still use shared symlinks; update the stored action and inspect existing configuration before assuming isolation. See the [worktree configuration boundary](docs/internals/worktree-configuration.md).
- Never reset, discard, force checkout, destructively clean, or rewrite history as an automatic setup step. Do not run an unconditional pull or push directly to `main`.
- Use focused branches/worktrees when isolation or authorized delivery needs them. Runtime Builder Task worktree requirements do not require a Task/worktree for every read-only investigation.

## Secrets and external authority

- Never expose secrets in commits, logs, screenshots, test artifacts, documentation, public PR evidence, or ordinary final reports.
- Pairing/bootstrap credentials are sensitive. Only an explicitly requested handoff that needs the actual value permits disclosure through the minimum necessary private channel; never persist it in logs, screenshots, commits, PR descriptions, or public artifacts.
- Authorized client pairing may consume a credential privately; redact captured output and avoid recording the pairing screen. Do not copy startup credential output into durable diagnostics.
- Code work alone does not authorize production deployment/configuration, release publication, external messages, paid provider execution, credential rotation, shared production-data changes, main merges, or destructive remote operations.
- Stop at an ungranted external boundary and report what remains. Existing task authorization is sufficient; do not ask again merely because a scoped workflow mentions approval.
- Review Git changes and proportional evidence before integration. Nebula integration targets a dedicated branch; readiness never grants automatic main-merge or publication authority.

## Clients and development environments

- Distinguish browser, Electron/desktop, mobile/native, and server behavior. Consider affected entry points, clients, providers, contracts, reverse/recovery states, and local/remote connections.
- Browser `dev`/`dev:web` uses single-origin Vite proxies: do not inject `VITE_HTTP_URL`/`VITE_WS_URL` there. Desktop deliberately uses configured loopback origins; preserve that scoped behavior.
- Use [web verification](.agents/skills/test-t3-app/SKILL.md) or [mobile verification](.agents/skills/test-t3-mobile/SKILL.md) for launch/authentication/state procedures. Use their iOS references when applicable.
- Browser/computer-use verification requires the user's request or agreement; reuse authorization already granted. Do not launch clients for instruction-only changes.
- Reuse compatible healthy environments where appropriate. Track processes you start and use platform-appropriate ownership checks; never kill by broad name/path patterns.
- Cleanup follows the overall scoped workflow, not the end of a turn. Keep environments alive for requested review/iteration; stop only owned processes when that loop ends.
- Use the repository's declared Node version and Vite+ scripts. Inspect setup before running it; dependency installation and runtime startup are not prerequisites for read-only or docs-only work.

## Source and reference scope

- `apps/server`: provider/runtime/orchestration/persistence; `packages/contracts`: wire/domain schemas; `packages/client-runtime`: shared client behavior.
- `apps/web`, `apps/desktop`, and `apps/mobile` are distinct client surfaces. `packages/shared` contains shared runtime helpers.
- Vendored `.repos/**` material and its instructions apply only to that reference scope unless explicitly incorporated. Do not edit or import vendored references into first-party code.
- Consult the vendored Effect reference when the affected Effect API/pattern needs it; a small edit does not require reading the entire reference corpus.
- Do not hand-edit generator-owned outputs; use the documented source/generator. Intentionally tracked generated source/assets differ from build output and caches; do not impose a blanket generated-file ban.
- Keep scratch plans and PR-only evidence outside the worktree. Durable decisions belong in architecture docs/ADRs; product behavior docs belong in `docs/user/`, procedures in `docs/operations/` or scoped skills.

## Verification

Use the smallest checks that credibly prove the affected behavior:

| Change                          | Evidence                                              |
| ------------------------------- | ----------------------------------------------------- |
| Instructions/docs               | Diff, focused syntax/frontmatter and reference checks |
| Local logic                     | Focused behavior tests                                |
| Package changes                 | Relevant lint, typecheck, and tests                   |
| Providers/contracts/persistence | Tests at each affected boundary                       |
| UI/native                       | Focused authorized client or native build/test path   |
| Release/upstream integration    | Explicit broader workflow                             |
| Hosted/production               | Separate authority and live evidence                  |

- Do not automatically run repo-wide lint/typecheck/tests/builds for small changes. Broaden for integration, release readiness, affected high-risk boundaries, or explicit full validation.
- Prefer typed receipts, worker drains, and deterministic synchronization. Bounded timeouts are valid failure controls; timeout usage alone is not a defect.
- Backend behavior changes need focused tests. Keep scope coherent and plan in proportion to complexity; consequential irreversible actions need explicit authority and a recovery decision.
- Never equate builds, mocks, historical capability tables, or a loaded UI with live provider/hosted/release acceptance. Report checks actually run and their limits.

## Delegation and completion

- Delegate only when authorized and work is separable. Establish edit ownership; avoid overlapping writes. No fixed agent count or mandatory swarm.
- The primary agent owns integration, conflict resolution, final verification, and reporting.
- Git/PR delivery is task-dependent. Create a PR only when requested; preserve conventional titles and describe the problem, change, and evidence. Do not infer merge authority from PR authority.
- Before completion, inspect the full diff, preserve unrelated state, verify proportionally, check for secret exposure, and identify shared-configuration risks.
- Report what changed, relevant files, actual checks/results, skipped checks/blockers, external actions not performed, and local versus hosted/release evidence.
