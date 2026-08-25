import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

import { forkParked, forkParkedStream, ServerActivation } from "./serverActivation.ts";

it.effect("proves a root is parked before returning and releases it with one gate", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const activation = yield* Deferred.make<void>();
      const ran = yield* Deferred.make<void>();

      yield* forkParked(Deferred.succeed(ran, undefined)).pipe(
        Effect.provideService(ServerActivation, Deferred.await(activation)),
      );
      expect(yield* Deferred.isDone(ran)).toBe(false);

      yield* Deferred.succeed(activation, undefined);
      yield* Deferred.await(ran);
      expect(yield* Deferred.isDone(ran)).toBe(true);
    }),
  ),
);

it.effect("captures hot stream events while processing is parked", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const activation = yield* Deferred.make<void>();
      const processed = yield* Deferred.make<number>();
      const events = yield* PubSub.unbounded<number>();

      yield* forkParkedStream(Stream.fromPubSub(events), (event) =>
        Deferred.succeed(processed, event),
      ).pipe(Effect.provideService(ServerActivation, Deferred.await(activation)));

      yield* PubSub.publish(events, 19);
      expect(yield* Deferred.isDone(processed)).toBe(false);

      yield* Deferred.succeed(activation, undefined);
      expect(yield* Deferred.await(processed)).toBe(19);
    }),
  ),
);
