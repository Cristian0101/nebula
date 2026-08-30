import { describe, expect, it } from "@effect/vitest";

import { redactSensitiveText } from "./redaction.ts";

describe("redactSensitiveText", () => {
  it("redacts quoted assignments without retaining a trailing fragment", () => {
    const result = redactSensitiveText(
      `TOKEN="alpha beta" password='correct horse battery staple'`,
    );

    expect(result).toBe("TOKEN=[REDACTED] password=[REDACTED]");
    expect(result).not.toContain("alpha");
    expect(result).not.toContain("battery");
  });

  it("redacts private-key blocks and credentials embedded in URLs", () => {
    const result = redactSensitiveText(
      [
        "-----BEGIN PRIVATE KEY-----",
        "private-material",
        "-----END PRIVATE KEY-----",
        "git clone https://builder:password-value@example.test/repository.git",
      ].join("\n"),
    );

    expect(result).toContain("[REDACTED]");
    expect(result).toContain("https://[REDACTED]@example.test/repository.git");
    expect(result).not.toContain("private-material");
    expect(result).not.toContain("password-value");
  });

  it("bounds persisted evidence after redaction", () => {
    expect(redactSensitiveText(`token=hidden ${"x".repeat(50)}`, 24)).toBe(
      "token=[REDACTED] xxxxxxx",
    );
  });
});
