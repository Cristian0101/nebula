import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  OrchestrationReactor,
  type OrchestrationReactorShape,
} from "../Services/OrchestrationReactor.ts";
import { CheckpointReactor } from "../Services/CheckpointReactor.ts";
import { ProviderCommandReactor } from "../Services/ProviderCommandReactor.ts";
import { ProviderRuntimeIngestionService } from "../Services/ProviderRuntimeIngestion.ts";
import { ThreadDeletionReactor } from "../Services/ThreadDeletionReactor.ts";
import { TaskWorkspaceReactor } from "../Services/TaskWorkspaceReactor.ts";
import { TaskOwnershipReactor } from "../Services/TaskOwnershipReactor.ts";
import { TaskReviewReactor } from "../Services/TaskReviewReactor.ts";
import { TaskQualityReactor } from "../Services/TaskQualityReactor.ts";
import { IntegrationReactor } from "../Services/IntegrationReactor.ts";
import * as AgentAwarenessRelay from "../../relay/AgentAwarenessRelay.ts";

export const makeOrchestrationReactor = Effect.gen(function* () {
  const providerRuntimeIngestion = yield* ProviderRuntimeIngestionService;
  const providerCommandReactor = yield* ProviderCommandReactor;
  const checkpointReactor = yield* CheckpointReactor;
  const threadDeletionReactor = yield* ThreadDeletionReactor;
  const taskWorkspaceReactor = yield* TaskWorkspaceReactor;
  const taskOwnershipReactor = yield* TaskOwnershipReactor;
  const taskReviewReactor = yield* TaskReviewReactor;
  const taskQualityReactor = yield* TaskQualityReactor;
  const integrationReactor = yield* IntegrationReactor;
  const agentAwarenessRelay = yield* AgentAwarenessRelay.AgentAwarenessRelay;

  const start: OrchestrationReactorShape["start"] = Effect.fn("start")(function* () {
    yield* providerRuntimeIngestion.start();
    yield* providerCommandReactor.start();
    yield* checkpointReactor.start();
    yield* threadDeletionReactor.start();
    yield* taskWorkspaceReactor.start();
    yield* taskOwnershipReactor.start();
    yield* taskReviewReactor.start();
    yield* taskQualityReactor.start();
    yield* integrationReactor.start();
    yield* agentAwarenessRelay.start();
  });

  return {
    start,
  } satisfies OrchestrationReactorShape;
});

export const OrchestrationReactorLive = Layer.effect(
  OrchestrationReactor,
  makeOrchestrationReactor,
);
