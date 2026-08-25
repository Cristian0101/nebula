import { describe, expect, it } from "@effect/vitest";
import {
  buildAntigravityStructuredArgs,
  buildAntigravityTurnArgs,
} from "../antigravity/AntigravityCommand.ts";

describe("Antigravity headless commands", () => {
  it("builds continuation and explicit-model arguments without conflicting effort flags", () => {
    const args = buildAntigravityTurnArgs({
      prompt: "again",
      conversationId: "conv-1",
      model: "Gemini 3.7 Flash",
      effort: "high",
      plan: true,
    });
    expect(args).toContain("--conversation");
    expect(args).toContain("--model");
    expect(args).not.toContain("--effort");
    expect(args).toContain("plan");
    expect(args).not.toContain("--new-project");
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--acp");
  });

  it("passes provider-aware effort when Auto selects the model", () => {
    const args = buildAntigravityTurnArgs({
      prompt: "reason",
      model: "auto",
      effort: "high",
    });
    expect(args).toContain("--effort");
    expect(args).toContain("high");
    expect(args).not.toContain("--model");
  });

  it("creates a task-local project and only auto-accepts workspace edits on a first turn", () => {
    const args = buildAntigravityTurnArgs({ prompt: "first" });
    expect(args).toEqual([
      "--new-project",
      "--mode",
      "accept-edits",
      "-p",
      "first",
      "--output-format",
      "stream-json",
    ]);
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("allows non-interactive tools only for an explicitly full-access turn", () => {
    const args = buildAntigravityTurnArgs({ prompt: "implement", fullAccess: true });
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("builds structured text generation without a second API path", () => {
    const args = buildAntigravityStructuredArgs({
      prompt: "title",
      jsonSchema: '{"type":"object"}',
      model: "auto",
    });
    expect(args).toEqual([
      "--mode",
      "plan",
      "-p",
      "title",
      "--output-format",
      "json",
      "--json-schema",
      '{"type":"object"}',
    ]);
    expect(args).not.toContain("--dangerously-skip-permissions");
  });
});
