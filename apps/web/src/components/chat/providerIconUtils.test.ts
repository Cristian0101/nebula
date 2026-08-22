import { describe, expect, it } from "@effect/vitest";
import { ProviderDriverKind } from "@t3tools/contracts";
import { Gemini } from "../Icons";
import { PROVIDER_ICON_BY_PROVIDER } from "./providerIconUtils";

describe("provider icons", () => {
  it("uses the Gemini mark for the Antigravity provider", () => {
    expect(PROVIDER_ICON_BY_PROVIDER[ProviderDriverKind.make("antigravity")]).toBe(Gemini);
  });
});
