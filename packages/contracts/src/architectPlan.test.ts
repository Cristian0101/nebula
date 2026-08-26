import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ArchitectPlanningLifecycle, ArchitectTeamConfiguration } from "./architectPlan.ts";

const decodeTeam = Schema.decodeUnknownSync(ArchitectTeamConfiguration);
const decodeLifecycle = Schema.decodeUnknownSync(ArchitectPlanningLifecycle);

it("rejects non-integer and out-of-range Architect team counts", () => {
  const team = {
    preset: "custom",
    executionAgentCount: 4,
    maxWritableConcurrency: 2,
    startingSeats: [],
  };
  expect(() => decodeTeam({ ...team, executionAgentCount: Number.NaN })).toThrow();
  expect(() => decodeTeam({ ...team, executionAgentCount: 4.5 })).toThrow();
  expect(() => decodeTeam({ ...team, executionAgentCount: 21 })).toThrow();
  expect(() => decodeTeam({ ...team, maxWritableConcurrency: 0 })).toThrow();
});

it("requires positive integer planning attempts", () => {
  const lifecycle = {
    phase: "planner_working",
    attempt: 1,
    startedAt: "2026-08-25T12:00:00.000Z",
    lastProgressAt: "2026-08-25T12:00:01.000Z",
    completedAt: null,
    failureCategory: null,
  };
  expect(decodeLifecycle(lifecycle).attempt).toBe(1);
  expect(() => decodeLifecycle({ ...lifecycle, attempt: 0 })).toThrow();
  expect(() => decodeLifecycle({ ...lifecycle, attempt: 1.5 })).toThrow();
});
