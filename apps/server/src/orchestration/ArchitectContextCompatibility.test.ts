import * as NodeCrypto from "node:crypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  collectArchitectContextFiles,
  collectArchitectContextTree,
} from "./ArchitectPlanGeneration.ts";

it.layer(NodeServices.layer)("Architect collection compatibility", (it) => {
  it.effect("retains ordering, protected exclusions, depth and symlink behavior", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-b0-tree-" });
      for (const name of ["z", "a/b/c/d/e", ".git", "node_modules", "secrets", "dist"]) {
        yield* fs.makeDirectory(path.join(root, name), { recursive: true });
        yield* fs.writeFileString(path.join(root, name, "file.txt"), "fixture");
      }
      for (const name of ["README.md", "credentials.json", ".env.local", "id_rsa", "cert.pem"]) {
        yield* fs.writeFileString(path.join(root, name), "fixture");
      }
      yield* fs.symlink(path.join(root, "a"), path.join(root, "dir-link"));
      yield* fs.symlink(path.join(root, "README.md"), path.join(root, "file-link"));
      yield* fs.symlink(path.join(root, "missing"), path.join(root, "broken-link"));
      const tree = yield* collectArchitectContextTree(root);
      expect(tree).toMatchSnapshot();
      const files = yield* collectArchitectContextFiles(root, [
        "file-link",
        "dir-link",
        "broken-link",
        "missing",
      ]);
      expect(files).toEqual({ included: ["README.md"], text: "FILE: README.md\nfixture" });
      expect(yield* collectArchitectContextTree(path.join(root, "missing"))).toEqual([]);
    }),
  );

  it.effect("retains the 300-entry traversal cutoff", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-b0-count-" });
      for (let index = 304; index >= 0; index--) {
        yield* fs.writeFileString(path.join(root, `file-${String(index).padStart(3, "0")}`), "");
      }
      const tree = yield* collectArchitectContextTree(root);
      expect(tree).toHaveLength(300);
      expect(tree[0]).toBe("file-000");
      expect(tree.at(-1)).toBe("file-299");
    }),
  );

  it.effect("retains individual/total byte budgets and binary exclusion", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-b0-bytes-" });
      for (const name of ["a", "b", "c", "d", "e"]) {
        yield* fs.writeFileString(path.join(root, name), name.repeat(64 * 1024));
      }
      yield* fs.writeFileString(path.join(root, "large"), "x".repeat(64 * 1024 + 1));
      yield* fs.writeFile(path.join(root, "binary"), new Uint8Array([65, 0, 66]));
      const files = yield* collectArchitectContextFiles(root, [
        "e",
        "d",
        "c",
        "b",
        "a",
        "a",
        "large",
        "binary",
      ]);
      expect({
        included: files.included,
        bytes: Buffer.byteLength(files.text),
        fingerprint: NodeCrypto.createHash("sha256").update(files.text).digest("hex"),
      }).toMatchSnapshot();
      yield* fs.writeFileString(path.join(root, "unicode"), "é😀\n");
      const unicode = yield* collectArchitectContextFiles(root, ["unicode"]);
      expect(unicode).toEqual({ included: ["unicode"], text: "FILE: unicode\né😀\n" });
    }),
  );
});
