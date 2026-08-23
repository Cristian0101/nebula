import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ArchitectPlanProposalId,
  CommandId,
  EventId,
  MissionId,
  ProjectId,
  ProviderInstanceId,
  TaskId,
  type ArchitectMissionDraft,
  type ArchitectPlanProposal,
  type OrchestrationCommand,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { validateArchitectPlan } from "@t3tools/shared/architectPlan";
import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const now = "2026-08-23T12:00:00.000Z";
const projectId = ProjectId.make("architect-project");
const proposalId = ArchitectPlanProposalId.make("proposal-1");
const missionId = MissionId.make("mission-1");
const baseCommit = "a".repeat(40);
const proposal: ArchitectMissionDraft = {
  title: "Organization API keys",
  objective: "Add scoped keys with audit history",
  description: "Do not touch billing",
  tasks: [
    {
      key: "contract",
      title: "Define API key contract",
      objective: "Add canonical types",
      acceptanceCriteria: ["Keys are organization scoped"],
      ownership: { write: ["packages/contracts/**"], read: [], deny: ["packages/billing/**"] },
      requiredResourceIds: [],
      assignedModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
    },
    {
      key: "server",
      title: "Implement API keys",
      objective: "Add server behavior",
      acceptanceCriteria: ["Audit events are durable"],
      ownership: {
        write: ["apps/server/**"],
        read: ["packages/contracts/**"],
        deny: ["packages/billing/**"],
      },
      requiredResourceIds: [],
      assignedModelSelection: { instanceId: ProviderInstanceId.make("antigravity"), model: "test" },
    },
  ],
  dependencies: [{ prerequisiteKey: "contract", dependentKey: "server" }],
  assumptions: [],
  risks: [],
  unresolvedQuestions: [],
  resourcePolicyGaps: [],
};

const apply = Effect.fn("applyArchitectCommand")(function* (
  model: OrchestrationReadModel,
  command: OrchestrationCommand,
) {
  const decided = yield* decideOrchestrationCommand({ readModel: model, command });
  let next = model;
  for (const planned of Array.isArray(decided) ? decided : [decided])
    next = yield* projectEvent(next, { ...planned, sequence: next.snapshotSequence + 1 });
  return next;
});

it.effect("atomically materializes one pinned draft Mission without execution side effects", () =>
  Effect.gen(function* () {
    let model = createEmptyReadModel(now);
    model = yield* projectEvent(model, {
      sequence: 1,
      eventId: EventId.make("project-created"),
      type: "project.created",
      aggregateKind: "project",
      aggregateId: projectId,
      occurredAt: now,
      commandId: CommandId.make("seed"),
      causationEventId: null,
      correlationId: null,
      metadata: {},
      payload: {
        projectId,
        title: "Project",
        workspaceRoot: "/tmp/architect-project",
        defaultModelSelection: null,
        scripts: [],
        createdAt: now,
        updatedAt: now,
      },
    });
    const validation = validateArchitectPlan({
      proposal,
      planningBaseCommit: baseCommit,
      resources: [],
      validatedAt: now,
    });
    const plan: ArchitectPlanProposal = {
      id: proposalId,
      projectId,
      status: "ready",
      objective: proposal.objective,
      constraints: "Do not touch billing",
      planningBaseCommit: baseCommit,
      architectProviderInstanceId: ProviderInstanceId.make("codex"),
      architectModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
      contextFingerprint: "context",
      contextPaths: ["README.md"],
      resourcePolicyFingerprint: "resources",
      proposal,
      validation,
      revisions: [
        { number: 1, source: "architect", feedback: null, proposal, validation, createdAt: now },
      ],
      materializedMissionId: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    model = yield* apply(model, {
      type: "architect.plan.save",
      commandId: CommandId.make("save"),
      projectId,
      plan,
      createdAt: now,
    });
    const approval = {
      type: "architect.plan.approve" as const,
      commandId: CommandId.make("approve"),
      projectId,
      proposalId,
      missionId,
      tasks: [
        { key: "contract", taskId: TaskId.make("contract-task") },
        { key: "server", taskId: TaskId.make("server-task") },
      ],
      acknowledgeWarnings: true,
      createdAt: now,
    };
    model = yield* apply(model, approval);
    expect(model.missions).toHaveLength(1);
    expect(model.missions?.[0]).toMatchObject({
      id: missionId,
      status: "draft",
      baseCommit,
      architectPlanProposalId: proposalId,
    });
    expect(model.tasks).toHaveLength(2);
    expect(
      model.tasks?.every(
        (task) => task.status === "draft" && task.threadId === null && task.workspace === null,
      ),
    ).toBe(true);
    expect(model.threads).toHaveLength(0);
    expect(model.projects[0]?.resourceLeases ?? []).toHaveLength(0);
    model = yield* apply(model, { ...approval, commandId: CommandId.make("approve-retry") });
    expect(model.missions).toHaveLength(1);
    expect(model.tasks).toHaveLength(2);
  }).pipe(Effect.provide(NodeServices.layer)),
);
