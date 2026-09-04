import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeChildProcess from "node:child_process";
import { setupWorktreeConfig } from "./setup-worktree-config.mjs";

const paths = [".env", "infra/relay/.env"];
async function fixture(t) {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "Nebula Test ' $;&[]-"));
  t.after(() => NodeFSP.rm(root, { recursive: true, force: true }));
  const sourceRoot = NodePath.join(root, "source repo");
  const destinationRoot = NodePath.join(root, "worktree one");
  for (const dir of [sourceRoot, destinationRoot])
    await NodeFSP.mkdir(NodePath.join(dir, "infra/relay"), { recursive: true });
  const messages = [];
  return { sourceRoot, destinationRoot, log: (message) => messages.push(message), messages, root };
}
async function seed(root) {
  for (const relative of paths)
    await NodeFSP.writeFile(NodePath.join(root, relative), "TEST_VALUE=worktree-fixture\n", {
      mode: 0o600,
    });
}

for (const relative of paths) {
  NodeTest.test(
    `${relative}: independent copies, repeated setup, two worktrees, deletion and reseeding`,
    async (t) => {
      const f = await fixture(t);
      await seed(f.sourceRoot);
      await setupWorktreeConfig(f);
      const source = NodePath.join(f.sourceRoot, relative);
      const target = NodePath.join(f.destinationRoot, relative);
      NodeAssert.equal((await NodeFSP.lstat(target)).isSymbolicLink(), false);
      NodeAssert.equal((await NodeFSP.lstat(target)).nlink, 1);
      NodeAssert.equal(await NodeFSP.readFile(target, "utf8"), "TEST_VALUE=worktree-fixture\n");
      const second = NodePath.join(f.root, "worktree two");
      await NodeFSP.mkdir(second);
      await setupWorktreeConfig({ ...f, destinationRoot: second });
      await NodeFSP.writeFile(target, "TEST_VALUE=local-edit\n");
      NodeAssert.equal(await NodeFSP.readFile(source, "utf8"), "TEST_VALUE=worktree-fixture\n");
      NodeAssert.equal(
        await NodeFSP.readFile(NodePath.join(second, relative), "utf8"),
        "TEST_VALUE=worktree-fixture\n",
      );
      await NodeFSP.writeFile(source, "TEST_VALUE=source-edit\n");
      await setupWorktreeConfig(f);
      NodeAssert.equal(await NodeFSP.readFile(target, "utf8"), "TEST_VALUE=local-edit\n");
      NodeAssert.equal(
        await NodeFSP.readFile(NodePath.join(second, relative), "utf8"),
        "TEST_VALUE=worktree-fixture\n",
      );
      await NodeFSP.rm(target);
      await setupWorktreeConfig(f);
      NodeAssert.equal(await NodeFSP.readFile(target, "utf8"), "TEST_VALUE=source-edit\n");
      NodeAssert.equal(
        f.messages.some((message) => message.includes("TEST_VALUE")),
        false,
      );
    },
  );

  NodeTest.test(`${relative}: preserve existing regular file and its permissions`, async (t) => {
    const f = await fixture(t);
    await seed(f.sourceRoot);
    const target = NodePath.join(f.destinationRoot, relative);
    await NodeFSP.writeFile(target, "TEST_VALUE=user-owned\n", { mode: 0o400 });
    const before = await NodeFSP.lstat(target);
    await setupWorktreeConfig(f);
    NodeAssert.equal(await NodeFSP.readFile(target, "utf8"), "TEST_VALUE=user-owned\n");
    NodeAssert.equal((await NodeFSP.lstat(target)).mode, before.mode);
  });

  for (const kind of ["symlink", "dangling symlink", "hardlink", "directory"]) {
    NodeTest.test(`${relative}: refuse existing ${kind} without changing it`, async (t) => {
      const f = await fixture(t);
      await seed(f.sourceRoot);
      const source = NodePath.join(f.sourceRoot, relative);
      const target = NodePath.join(f.destinationRoot, relative);
      if (kind === "directory") await NodeFSP.mkdir(target);
      else if (kind === "hardlink") await NodeFSP.link(source, target);
      else await NodeFSP.symlink(kind === "symlink" ? source : `${source}-missing`, target);
      const before = await NodeFSP.lstat(target);
      await NodeAssert.rejects(setupWorktreeConfig(f), /existing destination/);
      NodeAssert.equal((await NodeFSP.lstat(target)).ino, before.ino);
      NodeAssert.equal(await NodeFSP.readFile(source, "utf8"), "TEST_VALUE=worktree-fixture\n");
    });
  }

  NodeTest.test(
    `${relative}: copy never broadens POSIX permissions`,
    {
      // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone Node test checks filesystem permission semantics.
      skip: NodeOS.platform() === "win32",
    },
    async (t) => {
      const f = await fixture(t);
      const source = NodePath.join(f.sourceRoot, relative);
      const target = NodePath.join(f.destinationRoot, relative);
      for (const mode of [0o644, 0o640, 0o600, 0o400]) {
        await NodeFSP.writeFile(source, "TEST_VALUE=permissions\n");
        await NodeFSP.chmod(source, mode);
        await setupWorktreeConfig(f);
        NodeAssert.equal((await NodeFSP.lstat(target)).mode & 0o777, mode & 0o600);
        await NodeFSP.rm(target);
        await NodeFSP.chmod(source, 0o600);
      }
    },
  );
}

NodeTest.test("missing optional sources skip without creating links or parents", async (t) => {
  const f = await fixture(t);
  await NodeFSP.rm(NodePath.join(f.destinationRoot, "infra"), { recursive: true });
  await setupWorktreeConfig(f);
  await setupWorktreeConfig(f);
  NodeAssert.deepEqual(await NodeFSP.readdir(f.destinationRoot), []);
  NodeAssert.equal(f.messages.length, 4);
});

NodeTest.test("linked relay parent is refused without touching source", async (t) => {
  const f = await fixture(t);
  await seed(f.sourceRoot);
  await NodeFSP.rm(NodePath.join(f.destinationRoot, "infra"), { recursive: true });
  await NodeFSP.symlink(
    NodePath.join(f.sourceRoot, "infra"),
    NodePath.join(f.destinationRoot, "infra"),
    "dir",
  );
  await NodeAssert.rejects(setupWorktreeConfig(f), /destination directory is linked/);
  NodeAssert.equal(
    await NodeFSP.readFile(NodePath.join(f.sourceRoot, "infra/relay/.env"), "utf8"),
    "TEST_VALUE=worktree-fixture\n",
  );
});

NodeTest.test(
  "partial setup resumes safely after a relay conflict is resolved manually",
  async (t) => {
    const f = await fixture(t);
    await seed(f.sourceRoot);
    const relay = NodePath.join(f.destinationRoot, "infra/relay/.env");
    await NodeFSP.symlink(NodePath.join(f.sourceRoot, "infra/relay/.env"), relay);
    await NodeAssert.rejects(setupWorktreeConfig(f));
    await NodeFSP.writeFile(NodePath.join(f.destinationRoot, ".env"), "TEST_VALUE=valuable\n");
    await NodeFSP.rm(relay);
    await setupWorktreeConfig(f);
    NodeAssert.equal(
      await NodeFSP.readFile(NodePath.join(f.destinationRoot, ".env"), "utf8"),
      "TEST_VALUE=valuable\n",
    );
    NodeAssert.equal(
      (await NodeFSP.readdir(NodePath.join(f.destinationRoot, "infra/relay"))).length,
      1,
    );
  },
);

NodeTest.test("source symlinks are dereferenced into independent files", async (t) => {
  const f = await fixture(t);
  const real = NodePath.join(f.root, "external-fixture");
  await NodeFSP.writeFile(real, "TEST_VALUE=external\n");
  await NodeFSP.symlink(real, NodePath.join(f.sourceRoot, ".env"));
  await setupWorktreeConfig(f);
  await NodeFSP.writeFile(NodePath.join(f.destinationRoot, ".env"), "TEST_VALUE=local\n");
  NodeAssert.equal(await NodeFSP.readFile(real, "utf8"), "TEST_VALUE=external\n");
});

NodeTest.test(
  "CLI uses environment paths literally, reports conflicts and missing root without secrets",
  async (t) => {
    const f = await fixture(t);
    await seed(f.sourceRoot);
    const script = NodeURL.fileURLToPath(new URL("./setup-worktree-config.mjs", import.meta.url));
    const run = (source = f.sourceRoot) =>
      NodeChildProcess.spawnSync(process.execPath, [script], {
        cwd: f.destinationRoot,
        env: { ...process.env, T3CODE_PROJECT_ROOT: source },
        encoding: "utf8",
      });
    NodeAssert.equal(run().status, 0);
    NodeAssert.equal(run().status, 0);
    NodeAssert.equal(run("").status, 1);
    await NodeFSP.rm(NodePath.join(f.destinationRoot, ".env"));
    await NodeFSP.symlink(
      NodePath.join(f.sourceRoot, ".env"),
      NodePath.join(f.destinationRoot, ".env"),
    );
    const result = run();
    NodeAssert.equal(result.status, 1);
    NodeAssert.match(result.stderr, /inspect manually/);
    NodeAssert.equal((result.stdout + result.stderr).includes("TEST_VALUE"), false);
  },
);

NodeTest.test(
  "same checkout is rejected and setup command keeps installation and cache warming",
  async (t) => {
    const f = await fixture(t);
    await NodeAssert.rejects(
      setupWorktreeConfig({ ...f, destinationRoot: f.sourceRoot }),
      /different directories/,
    );
    const config = JSON.parse(
      await NodeFSP.readFile(new URL("../t3.json", import.meta.url), "utf8"),
    );
    NodeAssert.equal(
      config.scripts.find((entry) => entry.runOnWorktreeCreate).command,
      "vp i && node scripts/setup-worktree-config.mjs && node apps/web/scripts/warm-dep-cache.ts",
    );
  },
);

NodeTest.test(
  "interruption before publication exposes no partial destination and rerun recovers",
  async (t) => {
    const f = await fixture(t);
    await seed(f.sourceRoot);
    const helper = new URL("./setup-worktree-config.mjs", import.meta.url).href;
    const child = NodeChildProcess.spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    fs.promises.link = async () => process.exit(86);
    syncBuiltinESMExports();
    const { setupWorktreeConfig } = await import(${JSON.stringify(helper)});
    await setupWorktreeConfig();
  `,
      ],
      {
        cwd: f.destinationRoot,
        env: { ...process.env, T3CODE_PROJECT_ROOT: f.sourceRoot },
        encoding: "utf8",
      },
    );
    NodeAssert.equal(child.status, 86);
    await NodeAssert.rejects(NodeFSP.lstat(NodePath.join(f.destinationRoot, ".env")), {
      code: "ENOENT",
    });
    await setupWorktreeConfig(f);
    NodeAssert.equal(
      await NodeFSP.readFile(NodePath.join(f.destinationRoot, ".env"), "utf8"),
      "TEST_VALUE=worktree-fixture\n",
    );
    NodeAssert.equal(
      await NodeFSP.readFile(NodePath.join(f.sourceRoot, ".env"), "utf8"),
      "TEST_VALUE=worktree-fixture\n",
    );
  },
);

NodeTest.test("concurrent destination creation never overwrites user configuration", async (t) => {
  const f = await fixture(t);
  await seed(f.sourceRoot);
  const helper = new URL("./setup-worktree-config.mjs", import.meta.url).href;
  const child = NodeChildProcess.spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const originalLink = fs.promises.link;
    fs.promises.link = async (from, to) => {
      await fs.promises.writeFile(to, 'TEST_VALUE=concurrent-user\\n', { flag: 'wx' });
      return originalLink(from, to);
    };
    syncBuiltinESMExports();
    const { setupWorktreeConfig } = await import(${JSON.stringify(helper)});
    await setupWorktreeConfig();
  `,
    ],
    {
      cwd: f.destinationRoot,
      env: { ...process.env, T3CODE_PROJECT_ROOT: f.sourceRoot },
      encoding: "utf8",
    },
  );
  NodeAssert.equal(child.status, 0);
  for (const relative of paths) {
    NodeAssert.equal(
      await NodeFSP.readFile(NodePath.join(f.destinationRoot, relative), "utf8"),
      "TEST_VALUE=concurrent-user\n",
    );
  }
});

NodeTest.test(
  "full setup command preserves shell-special paths with fixture install and cache steps",
  async (t) => {
    if (NodeChildProcess.spawnSync("bash", ["--version"]).error) return t.skip("bash unavailable");
    const f = await fixture(t);
    await seed(f.sourceRoot);
    await NodeFSP.mkdir(NodePath.join(f.destinationRoot, "scripts"));
    await NodeFSP.copyFile(
      new URL("./setup-worktree-config.mjs", import.meta.url),
      NodePath.join(f.destinationRoot, "scripts/setup-worktree-config.mjs"),
    );
    await NodeFSP.mkdir(NodePath.join(f.destinationRoot, "apps/web/scripts"), { recursive: true });
    await NodeFSP.writeFile(
      NodePath.join(f.destinationRoot, "apps/web/scripts/warm-dep-cache.ts"),
      "console.log('fixture cache step');\n",
    );
    const bin = NodePath.join(f.root, "fixture bin");
    await NodeFSP.mkdir(bin);
    await NodeFSP.writeFile(NodePath.join(bin, "vp"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    const config = JSON.parse(
      await NodeFSP.readFile(new URL("../t3.json", import.meta.url), "utf8"),
    );
    const command = config.scripts.find((entry) => entry.runOnWorktreeCreate).command;
    for (const shell of ["bash", "zsh"]) {
      if (NodeChildProcess.spawnSync(shell, ["--version"]).error) continue;
      const result = NodeChildProcess.spawnSync(
        shell,
        ["-c", 'export PATH="$NEBULA_FIXTURE_PATH"; ' + command],
        {
          cwd: f.destinationRoot,
          env: {
            ...process.env,
            NEBULA_FIXTURE_PATH: `${bin}${NodePath.delimiter}${NodePath.dirname(process.execPath)}${NodePath.delimiter}${process.env.PATH}`,
            T3CODE_PROJECT_ROOT: f.sourceRoot,
          },
          encoding: "utf8",
        },
      );
      NodeAssert.equal(result.status, 0);
      NodeAssert.match(result.stdout, /fixture cache step/);
      NodeAssert.equal(result.stdout.includes("TEST_VALUE"), false);
    }
    for (const relative of paths)
      NodeAssert.equal((await NodeFSP.lstat(NodePath.join(f.destinationRoot, relative))).nlink, 1);
  },
);
