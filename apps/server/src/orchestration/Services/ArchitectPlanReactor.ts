import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface ArchitectPlanReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly drain: Effect.Effect<void>;
}

export class ArchitectPlanReactor extends Context.Reference<ArchitectPlanReactorShape>(
  "t3/orchestration/Services/ArchitectPlanReactor",
  { defaultValue: () => ({ start: () => Effect.void, drain: Effect.void }) },
) {}
