import { describe, expect, it } from "@effect/vitest";

import { BUILT_IN_DRIVERS } from "../builtInDrivers.ts";
import { GeminiDriver } from "./GeminiDriver.ts";

describe("GeminiDriver", () => {
  it("registers the first-party driver with safe defaults", () => {
    expect(BUILT_IN_DRIVERS).toContain(GeminiDriver);
    expect(GeminiDriver.driverKind).toBe("gemini");
    expect(GeminiDriver.defaultConfig()).toEqual({
      enabled: false,
      binaryPath: "gemini",
      customModels: [],
    });
    expect(GeminiDriver.metadata.supportsMultipleInstances).toBe(false);
  });
});
