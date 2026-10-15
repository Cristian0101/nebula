import * as NodeCrypto from "node:crypto";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import golden from "./__fixtures__/json-compatibility.json" with { type: "json" };

// Recorded with raw JSON.stringify on main 4981af2, before the B0 migration.
// Keep opaque encoding: a struct codec or key sorting changes historical evidence.
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const sparseArray: unknown[] = [undefined, null, undefined, 0, -0, false, "é\n😀"];
Reflect.deleteProperty(sparseArray, 2);
const values = [
  {
    commitSha: "0123456789abcdef",
    tree: ["README.md", "src/", "src/main.ts"],
    paths: ["README.md", "src/main.ts"],
    resources: [
      { id: "r", name: "Manifest", enabled: true, patterns: ["package.json"], description: null },
    ],
  },
  [{ id: "r", name: "Manifest", enabled: true, patterns: ["package.json"], description: null }],
  {
    qualityPolicy: { gates: [{ id: "test", command: "vp test", enabled: true, required: true }] },
    reviewPolicy: null,
  },
  {
    reviewPolicy: null,
    qualityPolicy: { gates: [{ required: true, enabled: true, command: "vp test", id: "test" }] },
  },
  {},
  { optional: undefined },
  { optional: null },
  { optional: false },
  { optional: "" },
  sparseArray,
  ["b", "a"],
  ["a", "b"],
  { z: 1, a: 2, "10": "ten", "2": "two", nested: { b: null, a: undefined } },
  {
    generatedAt: "2026-08-23T12:10:00.000Z",
    elapsedMilliseconds: 600000,
    finalValidation: "ready",
    remainingRisks: [],
    finalGateResults: [],
  },
];

it.effect("preserves persisted JSON bytes and every pairwise equality decision", () =>
  Effect.gen(function* () {
    const encoded = yield* Effect.forEach(values, (value) => encodeJson(value));
    expect(encoded).toEqual(golden.map((entry) => entry.bytes));
    expect(
      encoded.map((bytes) => NodeCrypto.createHash("sha256").update(bytes).digest("hex")),
    ).toEqual(golden.map((entry) => entry.sha256));
    for (let left = 0; left < encoded.length; left++) {
      for (let right = 0; right < encoded.length; right++) {
        expect(encoded[left] === encoded[right]).toBe(golden[left]?.bytes === golden[right]?.bytes);
      }
    }
  }),
);
