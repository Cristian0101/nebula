import { describe, expect, it } from "vite-plus/test";

import { mergeUntrackedChanges, parseNameStatus } from "./taskChangeSet.ts";

describe("Task change-set Git fixtures", () => {
  it("normalizes committed, staged, and unstaged name-status records", () => {
    expect(
      parseNameStatus(
        "M\0src/committed.ts\0A\0src/staged.ts\0D\0src/removed.ts\0R097\0src/old.ts\0src/new.ts\0C100\0src/source.ts\0src/copy.ts\0",
      ),
    ).toEqual([
      { path: "src/committed.ts", changeType: "modified" },
      { path: "src/staged.ts", changeType: "added" },
      { path: "src/removed.ts", changeType: "deleted" },
      { path: "src/new.ts", previousPath: "src/old.ts", changeType: "renamed" },
      { path: "src/copy.ts", previousPath: "src/source.ts", changeType: "copied" },
    ]);
  });

  it("keeps captured untracked files distinct from ordinary additions", () => {
    expect(
      mergeUntrackedChanges(
        [
          { path: "src/staged.ts", changeType: "added" },
          { path: "src/untracked.ts", changeType: "added" },
        ],
        "src/untracked.ts\0assets/binary.png\0",
      ),
    ).toEqual([
      { path: "src/staged.ts", changeType: "added" },
      { path: "src/untracked.ts", changeType: "untracked" },
      { path: "assets/binary.png", changeType: "untracked" },
    ]);
  });
});
