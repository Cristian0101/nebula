import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface TaskOwnershipReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly drain: Effect.Effect<void>;
}

export class TaskOwnershipReactor extends Context.Reference<TaskOwnershipReactorShape>(
  "t3/orchestration/Services/TaskOwnershipReactor",
  { defaultValue: () => ({ start: () => Effect.void, drain: Effect.void }) },
) {}
