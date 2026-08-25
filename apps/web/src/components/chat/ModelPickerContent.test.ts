import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { resolveInitialModelPickerInstanceId } from "./ModelPickerContent";

function entry(input: {
  readonly instanceId: string;
  readonly status?: ProviderInstanceEntry["status"];
}): ProviderInstanceEntry {
  const instanceId = ProviderInstanceId.make(input.instanceId);
  return {
    instanceId,
    driverKind: ProviderDriverKind.make(input.instanceId),
    displayName: input.instanceId,
    enabled: true,
    installed: true,
    status: input.status ?? "ready",
    isDefault: true,
    isAvailable: true,
    snapshot: {} as ProviderInstanceEntry["snapshot"],
    models: [],
  };
}

describe("resolveInitialModelPickerInstanceId", () => {
  it("opens an unassigned picker on the first ready provider", () => {
    expect(
      resolveInitialModelPickerInstanceId({
        activeInstanceId: "" as ProviderInstanceId,
        lockedProvider: null,
        hasFavorites: false,
        instanceEntries: [entry({ instanceId: "codex" }), entry({ instanceId: "antigravity" })],
      }),
    ).toBe(ProviderInstanceId.make("codex"));
  });

  it("keeps favorites and locked provider behavior authoritative", () => {
    const activeInstanceId = ProviderInstanceId.make("codex");
    const instanceEntries = [entry({ instanceId: "codex" })];
    expect(
      resolveInitialModelPickerInstanceId({
        activeInstanceId,
        lockedProvider: null,
        hasFavorites: true,
        instanceEntries,
      }),
    ).toBe("favorites");
    expect(
      resolveInitialModelPickerInstanceId({
        activeInstanceId,
        lockedProvider: ProviderDriverKind.make("codex"),
        hasFavorites: true,
        instanceEntries,
      }),
    ).toBe(activeInstanceId);
  });
});
