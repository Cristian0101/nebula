import { describe, expect, it } from "@effect/vitest";
import {
  parseInventoryRefs,
  parseInventoryWorktrees,
  INVENTORY_LIMITS,
} from "./projectInventory.ts";

const sha = "a".repeat(40);
const record = (path: string, fields = `HEAD ${sha}\0branch refs/heads/main`) =>
  `worktree ${path}\0${fields}\0\0`;
describe("project inventory structured Git parsers (pure reads)", () => {
  it("retains detached, locked, prunable, bare and unborn records, including whitespace paths", () => {
    const parsed = parseInventoryWorktrees(
      record("/repo") +
        record("/repo with\nnewlines", `HEAD ${sha}\0detached\0locked reason\nwith newline`) +
        record("/missing", `HEAD ${sha}\0branch refs/heads/gone\0prunable missing`) +
        record("/unborn", `HEAD ${"0".repeat(40)}\0branch refs/heads/unborn`) +
        record("/bare", "bare"),
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.records).toHaveLength(5);
    expect(parsed.records[0]?.isMain).toBe(true);
    expect(parsed.records[1]).toMatchObject({
      path: "/repo with\nnewlines",
      detached: true,
      locked: true,
      branchRef: null,
    });
    expect(parsed.records[2]?.prunable).toBe(true);
    expect(parsed.records[3]).toMatchObject({ headSha: null, headState: "unborn" });
    expect(parsed.records[4]?.bare).toBe(true);
  });
  it("returns known complete records on truncation, never inventing an incomplete tail", () => {
    const parsed = parseInventoryWorktrees(record("/repo") + "worktree /partial\0HEAD abc", true);
    expect(parsed.records.map((entry) => entry.path)).toEqual(["/repo"]);
    expect(parsed.issues).toEqual(expect.arrayContaining(["truncated", "malformed-output"]));
  });
  it.each([
    "",
    "worktree /repo\nHEAD abc\n\n",
    "HEAD bad\0\0",
    record("/repo", "HEAD nope\0detached"),
    record("/repo", `HEAD ${sha}`),
    record("/repo", `HEAD ${sha}\0branch refs/heads/main\0detached`),
    record("/repo") + record("/repo"),
  ])("reports malformed output without guessing: %j", (output) => {
    expect(parseInventoryWorktrees(output).issues).toContain("malformed-output");
  });
  it("reports unknown porcelain fields as unsupported while preserving known facts", () => {
    const parsed = parseInventoryWorktrees(
      record("/repo", `HEAD ${sha}\0detached\0future-attribute value`),
    );
    expect(parsed.issues).toEqual(["unsupported-output"]);
    expect(parsed.records[0]?.headSha).toBe(sha);
  });
  it("bounds worktree records and surfaces the cap", () => {
    const parsed = parseInventoryWorktrees(
      Array.from({ length: INVENTORY_LIMITS.worktrees + 1 }, (_, index) =>
        record(`/repo/${index}`),
      ).join(""),
    );
    expect(parsed.records).toHaveLength(INVENTORY_LIMITS.worktrees);
    expect(parsed.issues).toContain("scan-limit");
  });
  it("retains full local and remote ref identities, tips, upstreams and commit timestamps", () => {
    const clean = parseInventoryRefs(
      ["refs/heads/main", sha, "1700000000", "refs/remotes/origin/main", ""].join("\0") +
        "\n" +
        ["refs/remotes/origin/main", sha, "", "", ""].join("\0") +
        "\n",
    );
    expect(clean.issues).toEqual([]);
    expect(clean.refs[0]).toMatchObject({
      fullRefName: "refs/heads/main",
      headSha: sha,
      upstreamRef: "refs/remotes/origin/main",
      committedAt: "2023-11-14T22:13:20.000Z",
    });
    expect(clean.refs[1]).toMatchObject({ kind: "remote-tracking", committedAt: null });
  });
  it("flags malformed refs and truncated final lines, and omits symbolic aliases", () => {
    const parsed = parseInventoryRefs(
      ["refs/remotes/origin/HEAD", sha, "", "", "refs/remotes/origin/main"].join("\0") +
        "\ninvalid\npartial",
      true,
    );
    expect(parsed.refs).toEqual([]);
    expect(parsed.issues).toEqual(expect.arrayContaining(["malformed-output", "truncated"]));
  });
});
