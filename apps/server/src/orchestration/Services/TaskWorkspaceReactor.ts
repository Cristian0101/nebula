import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface TaskWorkspaceReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly drain: Effect.Effect<void>;
}

export class TaskWorkspaceReactor extends Context.Reference<TaskWorkspaceReactorShape>(
  "t3/orchestration/Services/TaskWorkspaceReactor",
  { defaultValue: () => ({ start: () => Effect.void, drain: Effect.void }) },
) {}
