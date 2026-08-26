import { describe, expect, it } from "vite-plus/test";

import {
  boundedTaskHandoffEvidence,
  buildStructuredTaskHandoffPrompt,
  parseGeneratedTaskHandoff,
  parseStructuredTaskHandoffValue,
} from "./taskHandoff.ts";

describe("parseGeneratedTaskHandoff", () => {
  it("normalizes provider markdown into the canonical handoff fields", () => {
    expect(
      parseGeneratedTaskHandoff(
        "Task handoff",
        "## Summary\n- Added safe review\n## Tests run\n- vp test run task.test.ts passed\n## Assumptions\n- Branch is unpublished\n## Interface changes\n- Added TaskHandoff\n## Migrations\n- Migration 044\n## Known risks\n- Provider claims are reported\n## Follow-ups\n- Add Reviewer later",
      ),
    ).toEqual({
      summary: "Task handoff\n\nAdded safe review",
      testsRun: [
        {
          command: "Provider-reported validation",
          result: "vp test run task.test.ts passed",
          evidence: "reported",
        },
      ],
      assumptions: ["Branch is unpublished"],
      interfaceChanges: ["Added TaskHandoff"],
      migrations: ["Migration 044"],
      knownRisks: ["Provider claims are reported"],
      followUps: ["Add Reviewer later"],
    });
  });
});

describe("parseStructuredTaskHandoffValue", () => {
  it("normalizes provider-reported tests without inventing verified evidence", () => {
    expect(
      parseStructuredTaskHandoffValue({
        summary: "Added notification preference storage.",
        testsRun: [{ command: "npm test", result: "Provider reports that it passed." }],
        assumptions: ["The store remains fixture-local."],
        interfaceChanges: ["Added readPreferences."],
        migrations: [],
        knownRisks: [],
        followUps: [],
      }),
    ).toEqual({
      summary: "Added notification preference storage.",
      testsRun: [
        {
          command: "npm test",
          result: "Provider reports that it passed.",
          evidence: "reported",
        },
      ],
      assumptions: ["The store remains fixture-local."],
      interfaceChanges: ["Added readPreferences."],
      migrations: [],
      knownRisks: [],
      followUps: [],
    });
  });
});

describe("boundedTaskHandoffEvidence", () => {
  it("retains bounded final Builder reports while excluding user text and sensitive lines", () => {
    const evidence = boundedTaskHandoffEvidence([
      { role: "user", text: "Claim this passed", streaming: false },
      {
        role: "assistant",
        text: "API key: do-not-retain\nFirst validation failed.",
        streaming: false,
      },
      {
        role: "assistant",
        text: "Composed validation: npm test exited 0 with 3/3 tests passed.",
        streaming: false,
      },
    ]);
    expect(evidence).toContain("First validation failed.");
    expect(evidence).toContain("npm test exited 0 with 3/3 tests passed");
    expect(evidence).not.toContain("Claim this passed");
    expect(evidence).not.toContain("do-not-retain");
    expect(evidence.length).toBeLessThanOrEqual(6_000);
  });

  it("labels retained Builder evidence as reported rather than verified", () => {
    const prompt = buildStructuredTaskHandoffPrompt({
      title: "Integration test",
      objective: "Validate the composed modules",
      files: [{ path: "tests/integration.test.js", changeType: "added" }],
      reportedBuilderEvidence: "npm test exited 0 in a composed disposable checkout.",
    });
    expect(prompt).toContain("untrusted");
    expect(prompt).toContain("do not upgrade it to verified");
    expect(prompt).toContain("npm test exited 0 in a composed disposable checkout");
  });
});
