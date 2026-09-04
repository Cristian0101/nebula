import { describe, expect, it } from "vite-plus/test";
import { ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import { selectReviewerModel } from "./MissionRunReactor.ts";

const a = ProviderInstanceId.make("reviewer-a");
const b = ProviderInstanceId.make("reviewer-b");
const ready = [
  { instance: { instanceId: a, driverKind: "codex" }, model: "default-a" },
  { instance: { instanceId: b, driverKind: "claude" }, model: "default-b" },
];
const configured = [
  ModelSelection.make({
    instanceId: a,
    model: "chosen-a",
    options: [{ id: "reasoningEffort", value: "high" }],
  }),
  ModelSelection.make({
    instanceId: b,
    model: "chosen-b",
    options: [{ id: "reasoningEffort", value: "low" }],
  }),
];
describe("configured reviewer selection", () => {
  it("preserves explicit model", () =>
    expect(
      selectReviewerModel(ready, [ModelSelection.make({ instanceId: a, model: "chosen" })], false)
        ?.model,
    ).toBe("chosen"));
  it("preserves model options", () =>
    expect(selectReviewerModel(ready, configured, false)).toEqual(configured[0]));
  it("keeps runtime defaults without explicit config", () =>
    expect(selectReviewerModel(ready, [], false)).toEqual(
      ModelSelection.make({ instanceId: a, model: "default-a" }),
    ));
  it("preserves the selected different provider's own options", () =>
    expect(selectReviewerModel(ready, configured, true, "codex")).toEqual(configured[1]));
  it("fallback uses only the first configured candidate's options", () =>
    expect(selectReviewerModel([ready[0]!], configured, true, "codex")).toEqual(configured[0]));
  it("does not borrow defaults when configured candidates are unavailable", () =>
    expect(selectReviewerModel([ready[1]!], [configured[0]!], false)).toBeNull());
  it("repeated selection leaves both configurations unchanged", () => {
    const before = structuredClone(configured);
    for (let i = 0; i < 3; i++)
      expect(selectReviewerModel(ready, configured, true, "codex")).toEqual(before[1]);
    expect(configured).toEqual(before);
  });
});
