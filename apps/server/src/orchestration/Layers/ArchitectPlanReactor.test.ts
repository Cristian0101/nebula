import { describe, expect, it } from "@effect/vitest";
import { ArchitectPlanGenerationError } from "@t3tools/contracts";

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

  it("uses the typed origin category instead of reclassifying its message", () => {
    expect(
      classifyArchitectPlanningFailure(
        new ArchitectPlanGenerationError({
          message: "Unexpected provider wording",
          category: "transport_interrupted",
        }),
      ),
    ).toBe("transport_interrupted");
  });
});
