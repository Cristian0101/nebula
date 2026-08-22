import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface TaskReviewReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly drain: Effect.Effect<void>;
}

export class TaskReviewReactor extends Context.Reference<TaskReviewReactorShape>(
  "t3/orchestration/Services/TaskReviewReactor",
  { defaultValue: () => ({ start: () => Effect.void, drain: Effect.void }) },
) {}
