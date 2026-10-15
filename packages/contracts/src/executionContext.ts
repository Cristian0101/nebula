import * as Schema from "effect/Schema";
import {
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  TaskId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";
import { RuntimeMode } from "./orchestration.ts";

// Display-only. There is deliberately no caller-supplied filesystem path.
export const GetExecutionContextInput = Schema.Struct({ threadId: ThreadId });
export const ExecutionContext = Schema.Struct({
  environmentId: EnvironmentId,
  environmentLabel: TrimmedNonEmptyString,
  threadId: ThreadId,
  project: Schema.Struct({ id: ProjectId, title: TrimmedNonEmptyString }),
  repositoryKey: Schema.NullOr(TrimmedNonEmptyString),
  workspacePath: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  recordedBranch: Schema.NullOr(TrimmedNonEmptyString),
  currentBranch: Schema.NullOr(TrimmedNonEmptyString),
  task: Schema.NullOr(Schema.Struct({ id: TaskId, title: TrimmedNonEmptyString })),
  providerSession: Schema.NullOr(
    Schema.Struct({
      threadId: ThreadId,
      instanceId: Schema.NullOr(ProviderInstanceId),
      driver: ProviderDriverKind,
      status: Schema.Literals(["connecting", "ready", "running", "error", "closed"]),
      // Never expose the provider-owned resume cursor or raw session metadata.
      continuation: Schema.Literals(["recorded", "unknown"]),
    }),
  ),
  permissions: RuntimeMode,
  issues: Schema.Array(
    Schema.Literals([
      "workspace-unavailable",
      "git-unavailable",
      "branch-mismatch",
      "task-context-mismatch",
      "session-context-mismatch",
      "multiple-task-bindings",
    ]),
  ),
  observedAt: IsoDateTime,
});
export type ExecutionContext = typeof ExecutionContext.Type;
