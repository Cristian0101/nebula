import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const configPaths = [".env", "infra/relay/.env"];

async function inspect(file) {
  try {
    return await NodeFSP.lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function requireDirectory(info, relative) {
  if (!info?.isDirectory() || info.isSymbolicLink()) {
    throw new Error(
      `${relative}: destination directory is linked or not a directory; inspect manually`,
    );
  }
}

function preserveExisting(info, relative, log) {
  if (!info) return false;
  if (!info.isFile() || info.nlink > 1) {
    throw new Error(
      `${relative}: existing destination may be shared or is not a regular file; inspect manually`,
    );
  }
  log(`${relative}: preserved existing file`);
  return true;
}

/** Seed optional configuration without overwriting existing worktree files. */
export async function setupWorktreeConfig({
  sourceRoot = process.env.T3CODE_PROJECT_ROOT,
  destinationRoot = process.cwd(),
  log = console.log,
} = {}) {
  if (!sourceRoot) throw new Error("T3CODE_PROJECT_ROOT is required");
  const source = await NodeFSP.realpath(sourceRoot);
  const destination = await NodeFSP.realpath(destinationRoot);
  if (source === destination) throw new Error("Source and worktree must be different directories");

  for (const relative of configPaths) {
    try {
      // Refuse linked parents so even a missing destination cannot alias another checkout.
      let parent = destination;
      for (const part of NodePath.dirname(relative).split("/")) {
        if (part === ".") continue;
        parent = NodePath.join(parent, part);
        const info = await inspect(parent);
        if (info) requireDirectory(info, NodePath.relative(destination, parent));
      }
      const target = NodePath.join(destination, relative);
      if (preserveExisting(await inspect(target), relative, log)) continue;

      let input;
      try {
        input = await NodeFSP.open(NodePath.join(source, relative), "r");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        log(`${relative}: optional source missing; skipped`);
        continue;
      }
      try {
        const info = await input.stat();
        if (!info.isFile()) throw new Error(`${relative}: source is not a regular file`);
        await NodeFSP.mkdir(parent, { recursive: true });
        // Stage privately, then publish with an exclusive link. The final file never
        // exposes partial contents and never shares an inode with the source.
        const staging = await NodeFSP.mkdtemp(NodePath.join(parent, ".env.worktree-"));
        const staged = NodePath.join(staging, "config");
        try {
          const output = await NodeFSP.open(staged, "wx", info.mode & 0o600);
          try {
            await output.writeFile(await input.readFile());
          } finally {
            await output.close();
          }
          try {
            await NodeFSP.link(staged, target);
            log(`${relative}: created isolated copy`);
          } catch (error) {
            if (error.code !== "EEXIST") throw error;
            preserveExisting(await inspect(target), relative, log);
          }
        } finally {
          await NodeFSP.unlink(staged).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
          await NodeFSP.rmdir(staging);
        }
      } finally {
        await input.close();
      }
    } catch (error) {
      // Never include filesystem error paths or configuration contents in output.
      // oxlint-disable-next-line preserve-caught-error -- Raw filesystem causes can contain sensitive paths.
      if (error.code) throw new Error(`${relative}: configuration setup failed (${error.code})`);
      throw error;
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === NodeURL.pathToFileURL(NodePath.resolve(process.argv[1])).href
) {
  setupWorktreeConfig().catch((error) => {
    console.error(
      error.code ? "Configuration setup failed; check source/worktree access" : error.message,
    );
    process.exitCode = 1;
  });
}
