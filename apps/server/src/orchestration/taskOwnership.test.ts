import type { TaskOwnershipRule } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  evaluateTaskOwnership,
  normalizeOwnershipPath,
  normalizeOwnershipPattern,
} from "./taskOwnership.ts";

const createdAt = "2026-08-22T12:00:00.000Z";
const rule = (
  id: string,
  access: TaskOwnershipRule["access"],
  pattern: string,
): TaskOwnershipRule => ({ id, access, pattern, reason: null, createdAt });

describe("Task ownership engine", () => {
  it("authorizes nested and exact write matches", () => {
    const result = evaluateTaskOwnership(
      [rule("web", "write", "apps/web/src/**"), rule("pkg", "write", "package.json")],
      [
        { path: "apps/web/src/features/task.ts", changeType: "modified" },
        { path: "package.json", changeType: "modified" },
      ],
    );
    expect(result).toEqual({ changedPathCount: 2, violations: [] });
  });

  it("makes deny override overlapping write", () => {
    const result = evaluateTaskOwnership(
      [rule("all", "write", "**"), rule("package", "deny", "package.json")],
      [{ path: "package.json", changeType: "modified" }],
    );
    expect(result.violations[0]).toMatchObject({ path: "package.json", reason: "denied" });
    expect(result.violations[0]?.matchedRules).toHaveLength(2);
  });

  it("classifies read-only and unclassified modifications separately", () => {
    const result = evaluateTaskOwnership(
      [rule("frontend", "write", "src/frontend/**"), rule("shared", "read", "shared/**")],
      [
        { path: "shared/schema.ts", changeType: "modified" },
        { path: "src/backend/private.ts", changeType: "untracked" },
      ],
    );
    expect(result.violations.map(({ path, reason }) => ({ path, reason }))).toEqual([
      { path: "shared/schema.ts", reason: "read-only" },
      { path: "src/backend/private.ts", reason: "unclassified" },
    ]);
  });

  it("keeps complementary Task scopes independent", () => {
    const taskA = evaluateTaskOwnership(
      [
        rule("frontend", "write", "src/frontend/**"),
        rule("shared-a", "read", "shared/**"),
        rule("package-a", "deny", "package.json"),
      ],
      [{ path: "src/frontend/a.ts", changeType: "modified" }],
    );
    const taskB = evaluateTaskOwnership(
      [
        rule("backend", "write", "src/backend/**"),
        rule("shared-b", "read", "shared/**"),
        rule("package-b", "deny", "package.json"),
      ],
      [{ path: "src/backend/b.ts", changeType: "modified" }],
    );
    expect(taskA.violations).toEqual([]);
    expect(taskB.violations).toEqual([]);
  });

  it("evaluates both sides of a rename", () => {
    const result = evaluateTaskOwnership(
      [rule("frontend", "write", "src/frontend/**")],
      [
        {
          path: "src/backend/a.ts",
          previousPath: "src/frontend/a.ts",
          changeType: "renamed",
        },
      ],
    );
    expect(result.changedPathCount).toBe(2);
    expect(result.violations).toMatchObject([
      { path: "src/backend/a.ts", changeType: "renamed", reason: "unclassified" },
    ]);
  });

  it("uses case-sensitive Git-style matching and normalizes separators", () => {
    expect(normalizeOwnershipPath("src\\frontend\\a.ts")).toBe("src/frontend/a.ts");
    expect(
      evaluateTaskOwnership(
        [rule("case", "write", "Src/**")],
        [{ path: "src/a.ts", changeType: "modified" }],
      ).violations,
    ).toHaveLength(1);
  });

  it.each([
    "/absolute/path",
    "../escape",
    "src/../escape",
    "file://repo/a",
    "C:/repo/a",
    "src//a",
    "src/",
  ])("rejects unsafe pattern %s", (pattern) =>
    expect(() => normalizeOwnershipPattern(pattern)).toThrow(),
  );
});
