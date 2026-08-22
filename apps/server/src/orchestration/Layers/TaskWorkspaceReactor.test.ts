import { TaskId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { taskWorkspaceBaselineFailure, taskWorkspaceBranch } from "./TaskWorkspaceReactor.ts";

describe("TaskWorkspaceReactor policy", () => {
  it("derives a stable collision-resistant branch from immutable Task identity", () => {
    const first = taskWorkspaceBranch({
      id: TaskId.make("e1d9a170-6465-4cbd-a574-f97e76542101"),
      title: "Fix OAuth callback",
    });
    const repeated = taskWorkspaceBranch({
      id: TaskId.make("e1d9a170-6465-4cbd-a574-f97e76542101"),
      title: "Fix OAuth callback",
    });
    const second = taskWorkspaceBranch({
      id: TaskId.make("caa0392c-9877-41ab-a574-f97e76542101"),
      title: "Fix OAuth callback",
    });
    expect(first).toBe("nebula/manual/e1d9a1706465-fix-oauth-callback");
    expect(repeated).toBe(first);
    expect(second).not.toBe(first);
  });

  it("rejects non-Git and dirty source checkouts before baseline capture", () => {
    expect(
      taskWorkspaceBaselineFailure({ isRepo: false, hasWorkingTreeChanges: false }),
    ).toMatchObject({ code: "git-required" });
    expect(
      taskWorkspaceBaselineFailure({ isRepo: true, hasWorkingTreeChanges: true }),
    ).toMatchObject({ code: "dirty-source" });
    expect(taskWorkspaceBaselineFailure({ isRepo: true, hasWorkingTreeChanges: false })).toBeNull();
  });
});
