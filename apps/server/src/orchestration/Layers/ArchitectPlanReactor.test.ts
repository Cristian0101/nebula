import { describe, expect, it } from "@effect/vitest";

import { classifyArchitectPlanningFailure } from "./ArchitectPlanReactor.ts";

describe("Architect planning failure classification", () => {
  it.each([
    ["Provider is not ready", "provider_unavailable"],
    ["Authentication credential missing", "authentication_required"],
    ["Transport connection interrupted", "transport_interrupted"],
    ["Malformed structured output", "invalid_structured_plan"],
    ["Plan validation failed", "validation_failed"],
    ["Repository baseline changed", "repository_changed"],
    ["Unexpected planner failure", "unknown"],
  ] as const)("maps %s to %s", (message, category) => {
    expect(classifyArchitectPlanningFailure(message)).toBe(category);
  });
});
