import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { useComposerDraftStore, type DraftId } from "../../../composerDraftStore";
import { readProjectHomePrefill } from "./projectHomeDraft";
const ref = {
  environmentId: EnvironmentId.make("home-fixture"),
  projectId: ProjectId.make("project"),
};
describe("Home draft handoff", () => {
  it("carries Task and Mission text using the existing composer draft on the exact scoped root", () => {
    const store = useComposerDraftStore.getState();
    const draftId = "home-draft-fixture" as DraftId;
    store.setProjectDraftThreadId(ref, draftId, {
      threadId: ThreadId.make("draft-thread"),
      branch: "main",
      worktreePath: null,
      startFromOrigin: false,
      envMode: "local",
    });
    store.setPrompt(draftId, "Prepare the requested change\nKeep acceptance criteria.");
    expect(readProjectHomePrefill(ref, draftId)).toBe(
      "Prepare the requested change\nKeep acceptance criteria.",
    );
    expect(
      readProjectHomePrefill({ ...ref, environmentId: EnvironmentId.make("other") }, draftId),
    ).toBeNull();
    expect(
      readProjectHomePrefill({ ...ref, projectId: ProjectId.make("other") }, draftId),
    ).toBeNull();
    store.setDraftThreadContext(draftId, { worktreePath: "/different-checkout" });
    expect(readProjectHomePrefill(ref, draftId)).toBeNull();
    store.clearDraftThread(draftId);
  });
  it("rejects missing drafts", () => {
    expect(readProjectHomePrefill(ref, undefined)).toBeNull();
    expect(readProjectHomePrefill(ref, "unknown")).toBeNull();
  });
});
