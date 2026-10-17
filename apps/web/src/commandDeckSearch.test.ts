import { describe, expect, it } from "vite-plus/test";
import { parseCommandDeckSearch } from "./commandDeckSearch";
describe("Command Deck route search", () => {
  it("preserves ordinary Task deep links without enabling Swarm", () => {
    expect(
      parseCommandDeckSearch({ checkout: "explicit-invalid", selectedTask: "task-2" }),
    ).toEqual({ checkout: "explicit-invalid", selectedTask: "task-2" });
  });
  it("preserves existing Swarm stages, selection and plan identity", () => {
    expect(
      parseCommandDeckSearch({
        mode: "swarm",
        stage: "review",
        missionId: "m",
        proposalId: "p",
        selectedTask: "t",
      }),
    ).toMatchObject({
      mode: "swarm",
      stage: "review",
      missionId: "m",
      proposalId: "p",
      selectedTask: "t",
    });
  });
  it("supports draft and Integration navigation without prompt URL state", () => {
    expect(
      parseCommandDeckSearch({
        section: "integration",
        createTask: "true",
        workDraft: "draft-id",
        prompt: "private idea",
      }),
    ).toEqual({ section: "integration", createTask: true, workDraft: "draft-id" });
  });
  it("rejects malformed fields and keeps legacy default behavior", () => {
    expect(
      parseCommandDeckSearch({
        selectedTask: 123,
        workDraft: "x".repeat(129),
        createTask: "yes",
        mode: "bad",
      }),
    ).toEqual({});
    expect(parseCommandDeckSearch({ mode: "swarm", stage: "bad" })).toEqual({
      mode: "swarm",
      stage: "brief",
    });
  });
});
