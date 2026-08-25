import { describe, expect, it } from "vite-plus/test";

import { normalizeOwnershipPattern } from "./ownershipPaths.ts";

describe("normalizeOwnershipPattern", () => {
  it("rejects provider prose appended to a repository path", () => {
    expect(() =>
      normalizeOwnershipPattern(
        "tests/notification-preferences.contract.test.js ** — explicit note: add coverage",
      ),
    ).toThrow("path syntax only");
  });

  it("preserves valid narrow and broad patterns", () => {
    expect(normalizeOwnershipPattern("src/shared/notification-preferences.js")).toBe(
      "src/shared/notification-preferences.js",
    );
    expect(normalizeOwnershipPattern("**")).toBe("**");
  });
});
