import { describe, expect, it } from "@effect/vitest";
import { AntigravityDriver } from "./AntigravityDriver.ts";
import { BUILT_IN_DRIVERS } from "../builtInDrivers.ts";

describe("AntigravityDriver", () => {
  it("registers the stable antigravity identity", () => {
    expect(AntigravityDriver.driverKind).toBe("antigravity");
    expect(AntigravityDriver.metadata.displayName).toBe("Antigravity");
    expect(BUILT_IN_DRIVERS).toContain(AntigravityDriver);
  });
});
