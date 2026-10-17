# Canonical Project inventory (E4.1)

This is a read-only backend foundation for Project OS. It adds no screens, mutation RPCs,
provider execution, process registry, persisted inventory, or ownership state. It is independent of
E3 Provider Connections and the E4.S mutation containment branch. D4 remains the design authority
for subsequent presentation work; this backend slice follows the E4.1 engineering scope.

## Canonical identity and selection

An authenticated environment transport selects the server. That server resolves `projectId`
against its current canonical Project projection. Logical repository grouping, labels, branch names,
remote URLs and renderer paths never select execution authority.

The returned physical identity contains environment ID, Project ID, canonical Project root and an
opaque repository ID derived from environment + Project + canonical common Git directory. Each
registered worktree gets an opaque `workspaceKey` derived from that identity and its registered
path. Keys are display selectors, not capabilities, globally portable Git identities, stable inode
identities, receipt generations or mutation approvals. Removing/recreating a repository at the same
location is not distinguished by an inode generation. Future mutation coordination must resolve
identity again and bind its own generation.

Canonical paths use the same filesystem realpath helper as `getExecutionContext`. Git observations
verify that the Project root is an actual checkout top-level and resolve its absolute common and
worktree Git directories. A selected workspace must be a registered inventory member, still resolve
to its observed realpath, be a checkout top-level, and have the same canonical common Git directory.
A missing Project, unavailable explicit worktree, wrong host key, changed symlink, nested directory
or foreign repository never falls back to the Project root or another environment. A disconnected
host fails at the existing client transport; neither query searches another host.

## Read contracts

Both RPCs require `orchestration:read`, through the existing RPC authorization middleware:

- `vcs.getProjectInventory({ projectId, refKind?, cursor?, limit?, refresh? })`
- `orchestration.getProjectWorkspaceContext({ projectId, workspaceKey })`

`projectInventory` is an optional server capability. Older capability documents decode unchanged;
clients must check support before issuing these queries. Environment-bound client query families
are exposed as `projectEnvironment.inventory` and `projectEnvironment.workspaceContext`, with no
periodic refresh. Requests accept no filesystem or executable authority. Unknown input fields are
ignored by schema decoding and never used. Invalid selectors and out-of-range pagination fail
schema validation or return typed invalid states.

Inventory returns separate ref/worktree pages, physical identity, source observations, typed issues,
observed totals and a compound next cursor. Cursor identity binds the environment, Project,
observation generation and ref-kind filter. A changed observation or filter returns `stale-cursor`;
the caller restarts from page one. Pagination reads the cached observation without re-enumerating
Git. `nextCursor: null` means the bounded observation has been consumed; it does not certify that
truncated source data was exhaustive. Totals are observed lower bounds when completeness is
partial or a scan limit was reached.

Workspace context adds one uncached local Git status inspection and bounded canonical joins.
It never calls the remote status, hosting/PR lookup, fetch or checkpoint-capture paths. The existing
GitManager status caches are intentionally not used here: their responses do not carry the source
timestamps needed by this contract. The observer extends GitVcsDriver through GitWorkflowService,
using the driver's existing process executor, Effect cache and mutation invalidation seam.

## Git evidence

The worktree parser uses `git worktree list --porcelain -z`, verified against Git 2.50.1 (Apple Git).
NUL attributes and empty NUL record boundaries preserve spaces and newlines in paths. Main,
linked, detached, locked, prunable, missing, bare, unborn and incomplete-HEAD records survive the
observation. Lock/prune reasons are not returned. A successful filesystem observation of a missing
path is a fact, not an excuse to discard its registration. Present means directory existence;
`membership: registered` does not certify current execution safety or Git membership at that path.
Selected-workspace inspection verifies membership before returning associations or status.

Refs come from one bounded, sorted `for-each-ref` enumeration of local and remote-tracking refs,
without local/remote deduplication. Each ref retains full identity, tip SHA, nullable commit time,
upstream identity and all registered worktree keys for that ref. Symbolic remote HEAD aliases are
omitted as aliases, not branch tips. A branch with no checkout stays visible. Selected checkout
branch/HEAD/detached state comes from local porcelain-v2 status, including dirty and untracked
entry counts. Status skips submodule traversal; no file contents or changed filenames are returned.

There is no automatic fetch, including on refresh. `remoteFreshness: not-verified` always describes
local tracking records, not remote server truth. Upstream names and commit timestamps do not prove
remote freshness.

Malformed/truncated records are never completed by guessing. Valid terminated records can remain
in a typed partial response; unknown attributes or unsupported porcelain output carry explicit
unsupported observations. A failed enumeration carries a null observation timestamp. Projection,
filesystem, Git and provider errors are sanitized; raw stderr, provider continuation tokens, error
payloads and credentials are excluded. A timed-out query returns a typed snapshot error.

## Ownership and activity

Worktree inventory does not scan every checkout's status or attach inferred ownership. The lazy
selected context composes the existing shell projection and source repository identity:

- Tasks require exact Project, ready workspace, realpath, recorded branch and source Project root.
- Integration Batches require canonical Project, source root, workspace path, branch and retained
  lifecycle state. Removed workspaces are excluded.
- Threads require canonical Project, realpath and recorded branch. Multiple valid Threads can
  share one checkout. A Task-bound Thread with ambiguous or mismatched ownership is omitted.
- Missions join only through verified Task membership or a canonical Batch-to-Mission relation.
- Provider sessions join only through those Threads, exact instance, runtime permission mode and
  real cwd. `ProviderService.listSessions(threadIds?)` reads the existing session directory for
  the selected bounded Threads, with directory-read concurrency four. Unfiltered callers remain
  compatible. The query returns only thread/instance/driver/status and the session's own updatedAt.

An assignment, saved role or projected status is not proof of execution. Sampling provider session
state is separate from proving an OS process exists. Session observation metadata records the
runtime sample time; each session keeps its own status-update timestamp. A failed sample is typed
unavailable and makes the result partial.

Terminal and subprocess metadata is intentionally omitted. `terminalActivity: requires-terminal-api`
directs clients to the existing `terminal:operate` API; the composite never accesses TerminalManager.
Managed dev-server process state is therefore not supplied by this API. `processActivity` and
`externalServices` are `not-observed`. Existing authorized terminal/dev-server/discovery APIs remain
separate. Discovered listeners cannot establish exhaustive external process coverage or idleness.

## Freshness and bounds

Each source identifies its subject, actual observation timestamp (or null), cache provenance, age and
completeness. Cached Git/filesystem timestamps are preserved. Project association timestamps come
from the canonical projection's updatedAt, not response construction. Fresh identity and selected
status observations are separate from cached worktree/ref facts. These multi-source reads are not
an atomic snapshot against concurrent Git, projection or external process changes.

| Bound                                       | Value                                                      |
| ------------------------------------------- | ---------------------------------------------------------- |
| Ref records retained                        | 10,000 (one additional record detects overflow)            |
| Worktree records inspected                  | 512                                                        |
| Git stdout/stderr bound                     | 2 MiB per enumeration/status; 16 KiB per identity command  |
| Page size                                   | Default 100, maximum 200 refs and 200 worktrees            |
| Git command duration                        | 5 seconds                                                  |
| Overall query duration, including admission | 20 seconds                                                 |
| Observer admissions                         | 2; identity commands concurrency 2; at most 4 Git children |
| Filesystem worktree inspection              | Concurrency 4 per observer                                 |
| Selected status scans                       | 1, with no other worktree status fanout                    |
| Canonical association candidates            | 500 each for Project Tasks, Threads and Batches            |
| Returned associations                       | 200 each; truncation is explicit                           |
| Association path reads                      | Per-query memoized, concurrency 4                          |
| Provider runtime sample                     | 3 seconds; selected directory reads concurrency 4          |
| Repository observation cache                | 64 entries, 15 seconds                                     |
| Explicit local refresh coalescing           | 64 entries, 5 seconds                                      |

Existing Git-driver mutation invalidation also invalidates inventory observations. External file
and Git changes may remain cached until TTL or explicit refresh. No background repository polling,
remote lookup, setup script, shell command, prune, repair, checkout, branch creation, process stop,
provider start or filesystem write belongs to collection. Timeout cancellation can stop only the
query's own bounded inspection child; it never signals an existing terminal/provider process.

## Subsequent milestones and E4.4 boundary

E4.2 can consume environment-bound inventory, shell projections and lazy workspace context for
Project Home. It still needs approved navigation, explicit checkout URL/state handling, honest
unknown/offline rendering, and appropriately authorized terminal/service composition. E4.3 can
render ref/worktree pages and selected details; it must expose partial bounds and restart stale
pagination. Neither milestone can treat these display results as action eligibility.

E4.S PR #43 independently contains unsafe mutations. This feature changes neither its policy nor
its mutation signatures. Integrate it through normal review after reconciling the shared Git workflow,
provider and RPC files; do not import the refusal policy into inventory. No E3/E4.S code is required
for these queries, and no PR is automatically merged.

Before E4.4 restores mutable actions, the server must:

1. Resolve fresh environment/Project/repository/worktree identity, including realpath aliases,
   common Git directory, per-worktree Git directory, HEAD and branch. Revalidate registration and
   ambiguity; display selectors are insufficient.
2. Serialize checkout mutation with **all** provider/session starts, terminal starts/restarts,
   managed dev servers, Task/Integration workspaces, setup/quality commands and recovery admissions.
   A Git-only lock or read-only preflight cannot close the startup race.
3. Re-read canonical ownership, retained/resumable sessions, activity, uncached tracked/untracked
   state and in-progress Git operation markers while holding that coordination. Unknown, missing,
   disconnected or uninspectable state blocks action. Task/Integration identity remains immutable
   outside its lifecycle.
4. Bind any future assessment receipt to exact identity, target, permissions, observation freshness
   and server generation, and revalidate under coordination immediately before the action.
5. Restore removal only within canonical Task/Integration cleanup, with explicit local-only/ignored
   file preservation and recovery decisions; never infer safety from Thread counts or force flags.
   Coordinate through completion and reconcile crashes/restarts and external-process uncertainty.
6. Prove concurrent/replayed/rejected requests, aliases, process admission races, disconnects and
   preserved files/history using disposable Git/process/provider fixtures.

E4.1 supplies observations for those guards. It supplies no receipt, authorization token, atomic
admission boundary, mutation approval, exhaustive process detection or release acceptance.
