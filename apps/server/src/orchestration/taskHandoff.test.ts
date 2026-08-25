import { describe, expect, it } from "vite-plus/test";

import { parseGeneratedTaskHandoff, parseStructuredTaskHandoffValue } from "./taskHandoff.ts";

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
