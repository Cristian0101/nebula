import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

export class ServerActivation extends Context.Reference<Effect.Effect<void> | undefined>(
  "t3/serverActivation",
  { defaultValue: () => undefined },
) {}

/** Forks a long-running root before commit and proves it is parked at the activation boundary. */
export const forkParked = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<void, never, Scope.Scope | R> =>
  Effect.gen(function* () {
    const activation = yield* ServerActivation;
    if (activation === undefined) {
      yield* Effect.forkScoped(effect);
      return;
    }
    const parked = yield* Deferred.make<void>();
    yield* Effect.forkScoped(
      Deferred.succeed(parked, undefined).pipe(Effect.andThen(activation), Effect.andThen(effect)),
    );
    yield* Deferred.await(parked);
  });

/**
 * Subscribes to a hot stream before activation, then parks processing until the
 * runtime is active. Startup reconciliation can therefore publish work without
 * racing subscribers that would otherwise attach only after activation.
 */
export const forkParkedStream = <A, E, R, A2, E2, R2>(
  stream: Stream.Stream<A, E, R>,
  process: (value: A) => Effect.Effect<A2, E2, R2>,
): Effect.Effect<void, never, Scope.Scope | R | R2> =>
  Effect.gen(function* () {
    const queue = yield* Stream.toQueue(stream, { capacity: "unbounded" });
    yield* forkParked(Stream.runForEach(Stream.fromQueue(queue), process));
  });
