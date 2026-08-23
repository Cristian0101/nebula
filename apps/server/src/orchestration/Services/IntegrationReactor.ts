import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface IntegrationReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly drain: Effect.Effect<void>;
}

export class IntegrationReactor extends Context.Reference<IntegrationReactorShape>(
  "t3/orchestration/Services/IntegrationReactor",
  { defaultValue: () => ({ start: () => Effect.void, drain: Effect.void }) },
) {}
