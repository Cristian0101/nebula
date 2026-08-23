import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface TaskQualityReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly drain: Effect.Effect<void>;
}

export class TaskQualityReactor extends Context.Reference<TaskQualityReactorShape>(
  "t3/orchestration/Services/TaskQualityReactor",
  { defaultValue: () => ({ start: () => Effect.void, drain: Effect.void }) },
) {}
