import * as Schema from "effect/Schema";
import {
  EnvironmentId,
  ProjectId,
  TaskId,
  ThreadId,
  MissionId,
  IntegrationBatchId,
  IsoDateTime,
  NonNegativeInt,
} from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

export const ProjectInventoryIssue = Schema.Literals([
  "project-unavailable",
  "workspace-unavailable",
  "repository-mismatch",
  "workspace-invalid",
  "git-unavailable",
  "unsupported-output",
  "malformed-output",
  "truncated",
  "scan-limit",
  "invalid-cursor",
  "stale-cursor",
  "association-limit",
  "association-mismatch",
  "ambiguous-ownership",
  "session-context-mismatch",
]);
export type ProjectInventoryIssue = typeof ProjectInventoryIssue.Type;
export const ProjectObservation = Schema.Struct({
  subject: Schema.Literals([
    "identity",
    "refs",
    "worktrees",
    "paths",
    "status",
    "associations",
    "sessions",
  ]),
  observedAt: Schema.NullOr(IsoDateTime),
  source: Schema.Literals(["local-git", "filesystem", "projection", "provider-runtime"]),
  cache: Schema.Literals(["live", "cached"]),
  ageMs: NonNegativeInt,
  completeness: Schema.Literals(["complete", "partial", "unavailable", "unsupported"]),
});
export type ProjectObservation = typeof ProjectObservation.Type;
const Offset = NonNegativeInt.check(Schema.isLessThanOrEqualTo(10_000));
export const ProjectInventoryCursor = Schema.Struct({
  snapshotId: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  refs: Offset,
  worktrees: Offset,
});
export const GetProjectInventoryInput = Schema.Struct({
  projectId: ProjectId,
  refKind: Schema.optionalKey(Schema.Literals(["local", "remote"])),
  cursor: Schema.optionalKey(ProjectInventoryCursor),
  limit: Schema.optionalKey(
    NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(200)),
  ),
  refresh: Schema.optionalKey(Schema.Boolean),
});
export type GetProjectInventoryInput = typeof GetProjectInventoryInput.Type;
export const GetProjectWorkspaceContextInput = Schema.Struct({
  projectId: ProjectId,
  workspaceKey: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
export type GetProjectWorkspaceContextInput = typeof GetProjectWorkspaceContextInput.Type;

export const ProjectInventoryIdentity = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
  // Environment + canonical Project + physical common Git directory, never a remote URL.
  repositoryId: Schema.String,
  projectRoot: Schema.String,
});
export const ProjectInventoryWorktree = Schema.Struct({
  workspaceKey: Schema.String,
  path: Schema.String,
  realPath: Schema.NullOr(Schema.String),
  isMain: Schema.Boolean,
  headSha: Schema.NullOr(Schema.String),
  branchRef: Schema.NullOr(Schema.String),
  detached: Schema.Boolean,
  bare: Schema.Boolean,
  locked: Schema.Boolean,
  prunable: Schema.Boolean,
  headState: Schema.Literals(["resolved", "unborn", "incomplete"]),
  availability: Schema.Literals(["present", "missing", "unavailable"]),
  // Enumeration proves registration, not current path/repository identity or execution safety.
  membership: Schema.Literal("registered"),
});
export type ProjectInventoryWorktree = typeof ProjectInventoryWorktree.Type;
export const ProjectInventoryRef = Schema.Struct({
  name: Schema.String,
  fullRefName: Schema.String,
  kind: Schema.Literals(["local", "remote-tracking"]),
  headSha: Schema.String,
  committedAt: Schema.NullOr(IsoDateTime),
  upstreamRef: Schema.NullOr(Schema.String),
  workspaceKeys: Schema.Array(Schema.String),
});
export const ProjectInventory = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
  identity: Schema.NullOr(ProjectInventoryIdentity),
  state: Schema.Literals(["available", "partial", "unavailable", "invalid"]),
  refs: Schema.Array(ProjectInventoryRef),
  worktrees: Schema.Array(ProjectInventoryWorktree),
  nextCursor: Schema.NullOr(ProjectInventoryCursor),
  totals: Schema.Struct({ refs: NonNegativeInt, worktrees: NonNegativeInt }),
  observations: Schema.Array(ProjectObservation),
  issues: Schema.Array(ProjectInventoryIssue),
  // No network fetch occurs, including on refresh. Remote tips are local tracking records.
  remoteFreshness: Schema.Literal("not-verified"),
  refresh: Schema.Literals(["not-requested", "refreshed", "coalesced", "unavailable"]),
});
export type ProjectInventory = typeof ProjectInventory.Type;

export const ProjectWorkspaceContext = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
  identity: Schema.NullOr(ProjectInventoryIdentity),
  workspace: Schema.NullOr(ProjectInventoryWorktree),
  state: Schema.Literals(["available", "partial", "unavailable", "invalid"]),
  git: Schema.NullOr(
    Schema.Struct({
      headSha: Schema.NullOr(Schema.String),
      branchRef: Schema.NullOr(Schema.String),
      detached: Schema.Boolean,
      trackedChanges: NonNegativeInt,
      untrackedCount: NonNegativeInt,
    }),
  ),
  taskIds: Schema.Array(TaskId),
  missionIds: Schema.Array(MissionId),
  integrationBatchIds: Schema.Array(IntegrationBatchId),
  threadIds: Schema.Array(ThreadId),
  providerSessions: Schema.Array(
    Schema.Struct({
      threadId: ThreadId,
      instanceId: ProviderInstanceId,
      driver: ProviderDriverKind,
      status: Schema.Literals(["connecting", "ready", "running", "error", "closed"]),
      updatedAt: IsoDateTime,
    }),
  ),
  // No protected terminal metadata is read by this orchestration:read query.
  terminalActivity: Schema.Literal("requires-terminal-api"),
  processActivity: Schema.Literal("not-observed"),
  externalServices: Schema.Literal("not-observed"),
  observations: Schema.Array(ProjectObservation),
  issues: Schema.Array(ProjectInventoryIssue),
});
export type ProjectWorkspaceContext = typeof ProjectWorkspaceContext.Type;
