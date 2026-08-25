import {
  MissionId,
  MissionRun,
  MissionRunId,
  ProjectId,
  ProviderInstanceId,
  TaskId,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  classifyRuntimeFailure,
  LocalCapacityAdvisor,
  parseCoordinationRequest,
  recommendWithFallback,
  recoveryAction,
  smallestReplanScope,
} from "./recoveryRouting.js";

const taskId = TaskId.make("task-1");
const codex = ProviderInstanceId.make("codex");
const antigravity = ProviderInstanceId.make("antigravity");
const candidates = [
  {
    instanceId: codex,
    driverKind: "codex",
    model: "gpt-5.6",
    ready: true,
    activeLoad: 2,
    reservedForReview: true,
  },
  {
    instanceId: antigravity,
    driverKind: "antigravity",
    model: "gemini",
    ready: true,
    activeLoad: 0,
  },
];
const decodeMissionRun = Schema.decodeUnknownSync(MissionRun);

describe("bounded recovery", () => {
  it("classifies deterministic runtime evidence without an LLM", () => {
    expect(classifyRuntimeFailure({ source: "provider", code: "ETIMEDOUT" })).toBe(
      "transport_transient",
    );
    expect(classifyRuntimeFailure({ source: "provider", code: "AUTH_EXPIRED" })).toBe(
      "provider_unavailable_auth",
    );
    expect(
      classifyRuntimeFailure({
        source: "provider",
        message:
          "Provider session did not survive a server restart. Send a new message to continue.",
      }),
    ).toBe("transport_transient");
    expect(
      classifyRuntimeFailure({
        source: "provider",
        message:
          "Provider validation failed: Provider instance 'antigravity' is disabled in Nebula settings.",
      }),
    ).toBe("provider_unavailable_auth");
    expect(classifyRuntimeFailure({ source: "quality" })).toBe("quality_failure");
    expect(classifyRuntimeFailure({ source: "review", reviewVerdict: "request_changes" })).toBe(
      "review_request_changes",
    );
    expect(classifyRuntimeFailure({ source: "ownership" })).toBe("ownership_violation");
  });

  it("retries transient provider failures exactly twice before replacement", () => {
    expect(
      recoveryAction({
        failureClass: "transport_transient",
        transientRetries: 0,
        remediationRounds: 0,
        replacementAvailable: true,
      }),
    ).toBe("retry");
    expect(
      recoveryAction({
        failureClass: "transport_transient",
        transientRetries: 1,
        remediationRounds: 0,
        replacementAvailable: true,
      }),
    ).toBe("retry");
    expect(
      recoveryAction({
        failureClass: "transport_transient",
        transientRetries: 2,
        remediationRounds: 0,
        replacementAvailable: true,
      }),
    ).toBe("replace");
  });

  it("bounds quality and request-changes remediation at two rounds", () => {
    for (const failureClass of ["quality_failure", "review_request_changes"] as const) {
      expect(
        recoveryAction({
          failureClass,
          transientRetries: 0,
          remediationRounds: 1,
          replacementAvailable: false,
        }),
      ).toBe("remediate");
      expect(
        recoveryAction({
          failureClass,
          transientRetries: 0,
          remediationRounds: 2,
          replacementAvailable: false,
        }),
      ).toBe("attention");
    }
  });

  it("never blindly retries ownership, resource, workspace, or architecture failures", () => {
    for (const failureClass of [
      "ownership_violation",
      "resource_violation",
      "workspace_failure",
      "planning_architecture_blocker",
    ] as const) {
      expect(
        recoveryAction({
          failureClass,
          transientRetries: 0,
          remediationRounds: 0,
          replacementAvailable: true,
        }),
      ).toBe("attention");
    }
  });
});

describe("routing and CapacityAdvisor", () => {
  it("keeps Manual Only manual", () => {
    expect(
      LocalCapacityAdvisor.recommend({
        taskId,
        taskRole: "builder",
        profile: "manual_only",
        candidates,
        decidedAt: "2026-08-23T00:00:00.000Z",
      }).decision,
    ).toBeNull();
  });

  it("balances load and preserves a provider reserved for review", () => {
    const decision = LocalCapacityAdvisor.recommend({
      taskId,
      taskRole: "builder",
      profile: "balanced",
      candidates,
      decidedAt: "2026-08-23T00:00:00.000Z",
    }).decision;
    expect(decision?.selectedProviderInstanceId).toBe(antigravity);
    expect(decision?.reasons).toEqual([
      "Provider is ready.",
      "Independent reviewer capacity was preserved.",
      "Current active load is 0.",
      "balanced policy.",
    ]);
  });

  it("excludes the failed provider during replacement while preserving Task identity", () => {
    const decision = LocalCapacityAdvisor.recommend({
      taskId,
      taskRole: "builder",
      profile: "balanced",
      candidates,
      excludedInstanceIds: new Set([codex]),
      decidedAt: "2026-08-23T00:00:00.000Z",
    }).decision;
    expect(decision?.taskId).toBe(taskId);
    expect(decision?.selectedProviderInstanceId).toBe(antigravity);
  });

  it("falls back to local policy when an optional advisor is unavailable", () => {
    const decision = recommendWithFallback(
      {
        taskId,
        taskRole: "builder",
        profile: "maximum_speed",
        candidates,
        decidedAt: "2026-08-23T00:00:00.000Z",
      },
      {
        recommend: () => {
          throw new Error("Ichnos unavailable");
        },
      },
    ).decision;
    expect(decision?.selectedProviderInstanceId).toBe(antigravity);
  });
});

describe("structured requests and replanning", () => {
  it("decodes a provider-neutral ownership request with nested paths", () => {
    const request = parseCoordinationRequest(
      `Need access:\n${JSON.stringify({
        type: "nebula_coordination_request",
        kind: "ownership_request",
        reason: "Callback contract must change.",
        paths: [{ pattern: "packages/contracts/src/auth.ts", access: "write" }],
      })}`,
    );
    expect(request).toEqual({
      kind: "ownership_request",
      reason: "Callback contract must change.",
      paths: [{ pattern: "packages/contracts/src/auth.ts", access: "write", reason: null }],
      resource: null,
      question: null,
      scope: null,
    });
  });

  it("rejects malformed requests instead of changing policy", () => {
    expect(
      parseCoordinationRequest(
        '{"type":"nebula_coordination_request","kind":"ownership_request","reason":""}',
      ),
    ).toBeNull();
  });

  it("chooses the smallest requested replan scope", () => {
    expect(
      smallestReplanScope({ requested: "task_split", affectedTaskCount: 1, missionTaskCount: 5 }),
    ).toBe("task_split");
    expect(
      smallestReplanScope({
        requested: "mission_subgraph",
        affectedTaskCount: 2,
        missionTaskCount: 5,
      }),
    ).toBe("mission_subgraph");
    expect(
      smallestReplanScope({ requested: "full_mission", affectedTaskCount: 2, missionTaskCount: 5 }),
    ).toBe("mission_subgraph");
    expect(
      smallestReplanScope({ requested: "full_mission", affectedTaskCount: 5, missionTaskCount: 5 }),
    ).toBe("full_mission");
  });
});

describe("restart recovery", () => {
  it("decodes a durable mid-remediation ledger without resetting budgets", () => {
    const run = decodeMissionRun({
      id: MissionRunId.make("run-restart"),
      missionId: MissionId.make("mission-restart"),
      projectId: ProjectId.make("project-restart"),
      mode: "supervised",
      status: "running",
      maxConcurrentTasks: 2,
      currentReadyTaskIds: [],
      scheduledTaskIds: [taskId],
      attention: [],
      attentionReason: null,
      decisions: [],
      startedAt: "2026-08-23T00:00:00.000Z",
      pausedAt: null,
      completedAt: null,
      stoppedAt: null,
      failedAt: null,
      failureReason: null,
      recoveryPolicy: {
        transportRetryLimit: 2,
        remediationLimit: 2,
        routingProfile: "balanced",
      },
      taskRecovery: [
        {
          taskId,
          transientRetries: 1,
          remediationRounds: 1,
          attempts: [
            {
              number: 2,
              kind: "remediation",
              providerInstanceId: codex,
              threadId: ThreadId.make("builder-thread"),
              status: "active",
              failureClass: null,
              summary: "Remediation in progress.",
              startedAt: "2026-08-23T00:01:00.000Z",
              completedAt: null,
            },
          ],
          latestFailureClass: "quality_failure",
          latestFailureSignature: "quality_failure:builder-thread:turn-1:snapshot-1:no-review",
          attentionRequired: false,
          updatedAt: "2026-08-23T00:01:00.000Z",
        },
      ],
      routingDecisions: [],
      coordinationRequests: [],
      replanProposals: [],
      updatedAt: "2026-08-23T00:01:00.000Z",
    });
    expect(run.taskRecovery?.[0]).toMatchObject({
      transientRetries: 1,
      remediationRounds: 1,
      attempts: [{ kind: "remediation", status: "active" }],
    });
  });
});
