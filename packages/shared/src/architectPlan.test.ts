import { describe, expect, it } from "@effect/vitest";
import {
  SharedResourceId,
  type ArchitectMissionDraft,
  type SharedResourceDefinition,
} from "@t3tools/contracts";
import { createArchitectTeamConfiguration, validateArchitectPlan } from "./architectPlan.ts";

const now = "2026-08-23T12:00:00.000Z";
const resourceId = SharedResourceId.make("api-schema");
const resources: SharedResourceDefinition[] = [
  {
    id: resourceId,
    projectId: "project" as never,
    name: "API schema",
    description: null,
    patterns: ["packages/contracts/**"],
    mode: "exclusive",
    enabled: true,
    createdAt: now as never,
    updatedAt: now as never,
  },
];
const base: ArchitectMissionDraft = {
  title: "OAuth callback",
  objective: "Refactor the callback safely",
  description: "Plan",
  tasks: [
    {
      key: "contract",
      title: "Define contract",
      objective: "Update types",
      acceptanceCriteria: ["Existing success payload remains compatible"],
      ownership: {
        write: ["packages/contracts/**"],
        read: ["apps/server/**"],
        deny: ["deployment/**"],
      },
      requiredResourceIds: [resourceId],
      assignedModelSelection: null,
    },
    {
      key: "server",
      title: "Implement server",
      objective: "Update callback",
      acceptanceCriteria: ["Recoverable errors are explicit"],
      ownership: {
        write: ["apps/server/**"],
        read: ["packages/contracts/**"],
        deny: ["deployment/**"],
      },
      requiredResourceIds: [],
      assignedModelSelection: null,
    },
  ],
  dependencies: [{ prerequisiteKey: "contract", dependentKey: "server" }],
  assumptions: [],
  risks: [],
  unresolvedQuestions: [],
  resourcePolicyGaps: [],
};
const validate = (proposal: ArchitectMissionDraft) =>
  validateArchitectPlan({
    proposal,
    planningBaseCommit: "a".repeat(40),
    resources,
    validatedAt: now,
  });

describe("validateArchitectPlan", () => {
  it("builds the 2, 4, 8, and 12-agent presets without counting the Planner", () => {
    expect(
      (["pair", "standard", "large", "heavy"] as const).map((preset) => {
        const team = createArchitectTeamConfiguration({ preset, defaultModelSelection: null });
        return [preset, team.executionAgentCount, team.startingSeats.length];
      }),
    ).toEqual([
      ["pair", 2, 2],
      ["standard", 4, 4],
      ["large", 8, 8],
      ["heavy", 12, 12],
    ]);
  });

  it("bounds a custom non-Planner team and derives a separate writable concurrency cap", () => {
    const custom = createArchitectTeamConfiguration({
      preset: "custom",
      customCount: 7,
      defaultModelSelection: null,
    });
    expect(custom).toMatchObject({
      preset: "custom",
      executionAgentCount: 7,
      maxWritableConcurrency: 3,
    });
    expect(custom.startingSeats).toHaveLength(7);
    expect(
      createArchitectTeamConfiguration({
        preset: "custom",
        customCount: Number.NaN,
        defaultModelSelection: null,
      }).executionAgentCount,
    ).toBe(4);
    expect(
      createArchitectTeamConfiguration({
        preset: "custom",
        customCount: Number.POSITIVE_INFINITY,
        defaultModelSelection: null,
      }).executionAgentCount,
    ).toBe(4);
    expect(custom.startingSeats.map((seat) => seat.label)).toContain("Functional reviewer 1");
  });

  it("validates team concurrency, reviewers, and named checkpoint references", () => {
    const team = createArchitectTeamConfiguration({ preset: "pair", defaultModelSelection: null });
    const result = validateArchitectPlan({
      proposal: {
        ...base,
        tasks: [
          { ...base.tasks[0]!, reviewerKey: "server" },
          { ...base.tasks[1]!, checkpointKey: "contract-freeze" },
        ],
        checkpoints: [
          {
            key: "contract-freeze",
            name: "Contract freeze",
            requiredTaskKeys: ["contract"],
            unlockTaskKeys: ["server"],
            requiredGateIds: ["typecheck"],
            reviewsRequired: true,
            humanApprovalRequired: true,
          },
        ],
      },
      planningBaseCommit: "a".repeat(40),
      resources,
      team,
      qualityGateIds: ["typecheck"],
      validatedAt: now,
    });
    expect(result.status).toBe("valid");
    expect(result.errors).toEqual([]);
  });

  it("keeps the final Task-agent roster within the selected team-size maximum", () => {
    const team = createArchitectTeamConfiguration({ preset: "pair", defaultModelSelection: null });
    const result = validateArchitectPlan({
      proposal: {
        ...base,
        tasks: [...base.tasks, { ...base.tasks[1]!, key: "overflow", title: "Overflow Task" }],
      },
      planningBaseCommit: "a".repeat(40),
      resources,
      team,
      validatedAt: now,
    });
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "team-plan-over-capacity" }),
    );
  });

  it("keeps writable manual-shell Tasks blocked until an explicit WRITE path is assigned", () => {
    const result = validateArchitectPlan({
      proposal: {
        ...base,
        tasks: [
          {
            ...base.tasks[0]!,
            role: "builder",
            ownership: { write: [], read: [], deny: [] },
          },
          {
            ...base.tasks[1]!,
            role: "reviewer",
            ownership: { write: [], read: ["packages/contracts/**"], deny: [] },
          },
        ],
      },
      planningBaseCommit: "a".repeat(40),
      resources,
      validatedAt: now,
    });
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "ownership-write-empty", taskKey: "contract" }),
    );
    expect(result.errors).not.toContainEqual(
      expect.objectContaining({ code: "ownership-write-empty", taskKey: "server" }),
    );
  });

  it("requires Task checkpoint labels and unlock lists to describe the same barrier", () => {
    const result = validateArchitectPlan({
      proposal: {
        ...base,
        tasks: [{ ...base.tasks[0]!, checkpointKey: "contract-freeze" }, base.tasks[1]!],
        checkpoints: [
          {
            key: "contract-freeze",
            name: "Contract freeze",
            requiredTaskKeys: ["contract"],
            unlockTaskKeys: ["server"],
            requiredGateIds: [],
            reviewsRequired: false,
            humanApprovalRequired: false,
          },
        ],
      },
      planningBaseCommit: "a".repeat(40),
      resources,
      validatedAt: now,
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "checkpoint-task-mismatch", taskKey: "contract" }),
        expect.objectContaining({ code: "checkpoint-task-mismatch", taskKey: "server" }),
      ]),
    );
  });

  it("accepts a bounded valid proposal and computes waves", () => {
    const result = validate(base);
    expect(result.status).toBe("valid");
    expect(result.waveCount).toBe(2);
  });
  it("rejects duplicate task keys", () => {
    expect(
      validate({ ...base, tasks: [...base.tasks, { ...base.tasks[0]! }] }).errors.some(
        (issue) => issue.code === "duplicate-task-key",
      ),
    ).toBe(true);
  });
  it("rejects unknown dependency endpoints", () => {
    expect(
      validate({
        ...base,
        dependencies: [{ prerequisiteKey: "missing", dependentKey: "server" }],
      }).errors.some((issue) => issue.code === "dependency-endpoint"),
    ).toBe(true);
  });
  it("rejects self edges and cycles through the canonical graph validator", () => {
    expect(
      validate({
        ...base,
        dependencies: [{ prerequisiteKey: "contract", dependentKey: "contract" }],
      }).errors.some((issue) => issue.code === "dag-invalid"),
    ).toBe(true);
    expect(
      validate({
        ...base,
        dependencies: [
          ...base.dependencies,
          { prerequisiteKey: "server", dependentKey: "contract" },
        ],
      }).errors.some((issue) => issue.code === "dag-invalid"),
    ).toBe(true);
  });
  it("rejects duplicate edges", () => {
    expect(
      validate({ ...base, dependencies: [...base.dependencies, ...base.dependencies] }).errors.some(
        (issue) => issue.code === "duplicate-edge",
      ),
    ).toBe(true);
  });
  it("rejects unsafe ownership paths", () => {
    const tasks = [
      { ...base.tasks[0]!, ownership: { ...base.tasks[0]!.ownership, write: ["../../secrets"] } },
      base.tasks[1]!,
    ];
    expect(
      validate({ ...base, tasks }).errors.some((issue) => issue.code === "ownership-invalid"),
    ).toBe(true);
  });
  it("rejects prose appended to Architect ownership patterns", () => {
    const tasks = [
      {
        ...base.tasks[0]!,
        ownership: {
          ...base.tasks[0]!.ownership,
          write: ["tests/contract.test.ts ** — explicit note: required coverage"],
        },
      },
      base.tasks[1]!,
    ];
    const result = validate({ ...base, tasks });
    expect(result.status).toBe("invalid");
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "ownership-invalid" })]),
    );
  });
  it("rejects unknown resources", () => {
    const tasks = [
      { ...base.tasks[0]!, requiredResourceIds: [SharedResourceId.make("missing")] },
      base.tasks[1]!,
    ];
    expect(
      validate({ ...base, tasks }).errors.some((issue) => issue.code === "unknown-resource"),
    ).toBe(true);
  });
  it("warns instead of rejecting broad write ownership", () => {
    const tasks = [
      { ...base.tasks[0]!, ownership: { ...base.tasks[0]!.ownership, write: ["**"] } },
      base.tasks[1]!,
    ];
    const result = validate({ ...base, tasks });
    expect(result.status).toBe("valid");
    expect(result.warnings.some((issue) => issue.code === "broad-write")).toBe(true);
  });

  it("rejects empty Missions and proposal bounds", () => {
    expect(validate({ ...base, title: "" } as ArchitectMissionDraft).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "mission-empty" })]),
    );
    const tasks = Array.from({ length: 21 }, (_, index) => ({
      ...base.tasks[0]!,
      key: `task-${index}`,
    }));
    expect(validate({ ...base, tasks }).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "task-limit" })]),
    );
  });

  it("accepts a structured provider recommendation", () => {
    const tasks = [
      {
        ...base.tasks[0]!,
        providerRecommendation: {
          driverKind: "codex",
          model: "gpt-5.6-sol",
          reason: "Strong contract work",
        },
      },
      base.tasks[1]!,
    ];
    expect(validate({ ...base, tasks }).status).toBe("valid");
  });

  it("warns conservatively when a write scope intersects an unclaimed resource", () => {
    const tasks = [{ ...base.tasks[0]!, requiredResourceIds: [] }, base.tasks[1]!];
    expect(
      validate({ ...base, tasks }).warnings.some(
        (issue) => issue.code === "missing-resource-claim",
      ),
    ).toBe(true);
  });

  it("validates the supported 20 Task and 30 dependency ceiling", () => {
    const tasks = Array.from({ length: 20 }, (_, index) => ({
      ...base.tasks[0]!,
      key: `task-${index}`,
      title: `Task ${index}`,
      ownership: { write: [`scope-${index}/**`], read: [], deny: [] },
      requiredResourceIds: [],
    }));
    const chain = Array.from({ length: 19 }, (_, index) => ({
      prerequisiteKey: `task-${index}`,
      dependentKey: `task-${index + 1}`,
    }));
    const extra = Array.from({ length: 11 }, (_, index) => ({
      prerequisiteKey: `task-${index}`,
      dependentKey: `task-${index + 2}`,
    }));
    const result = validate({ ...base, tasks, dependencies: [...chain, ...extra] });
    expect(result.status).toBe("valid");
    expect(result.taskCount).toBe(20);
    expect([...chain, ...extra]).toHaveLength(30);
    expect(result.waveCount).toBe(20);
  });
});
