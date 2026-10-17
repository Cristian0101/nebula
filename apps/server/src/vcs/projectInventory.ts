import * as NodeCrypto from "node:crypto";
import type {
  ProjectInventoryIssue,
  ProjectInventoryWorktree,
  ProjectObservation,
} from "@t3tools/contracts";
import * as Cache from "effect/Cache";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";
import type { GitVcsDriver } from "./GitVcsDriver.ts";

export const INVENTORY_LIMITS = {
  refs: 10_000,
  worktrees: 512,
  bytes: 2 * 1024 * 1024,
  timeoutMs: 5_000,
} as const;
export const inventoryHash = (...values: readonly string[]) =>
  NodeCrypto.createHash("sha256")
    .update(values.map((value) => `${Buffer.byteLength(value)}:${value}`).join(""))
    .digest("hex");
export interface InventoryRef {
  readonly fullRefName: string;
  readonly name: string;
  readonly kind: "local" | "remote-tracking";
  readonly headSha: string;
  readonly committedAt: string | null;
  readonly upstreamRef: string | null;
}
export type InventoryWorktree = Omit<ProjectInventoryWorktree, "workspaceKey">;
export interface GitInventorySnapshot {
  readonly id: string;
  readonly refs: readonly InventoryRef[];
  readonly worktrees: readonly InventoryWorktree[];
  readonly observations: readonly ProjectObservation[];
  readonly issues: readonly ProjectInventoryIssue[];
}
export interface GitInventory {
  readonly root: string;
  readonly commonDir: string;
  readonly gitDir: string;
  readonly snapshot: GitInventorySnapshot;
  readonly identityObservedAt: string;
  readonly cache: "live" | "cached";
  readonly refresh: "not-requested" | "refreshed" | "coalesced";
}
export interface WorkspaceGitObservation {
  readonly headSha: string | null;
  readonly branchRef: string | null;
  readonly detached: boolean;
  readonly trackedChanges: number;
  readonly untrackedCount: number;
}
const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

/** Git 2.50.1: NUL-delimited attributes, empty NUL attribute terminates a record.
 * Paths and reasons can contain newlines. Never split porcelain -z by lines.
 * Unknown attributes retain known fields but mark the observation unsupported.
 */
export function parseInventoryWorktrees(output: string, truncated = false) {
  const records: Array<Omit<InventoryWorktree, "realPath" | "availability" | "membership">> = [];
  const issues = new Set<ProjectInventoryIssue>();
  if (truncated) issues.add("truncated");
  if (output && !output.endsWith("\0\0")) issues.add("malformed-output");
  const blocks = output.split("\0\0");
  // The final element is empty only for a completely terminated record.
  blocks.pop();
  const paths = new Set<string>();
  for (const [recordIndex, block] of blocks.entries()) {
    if (records.length === INVENTORY_LIMITS.worktrees) {
      issues.add("scan-limit");
      break;
    }
    const fields = block.split("\0");
    const first = fields.shift();
    if (!first?.startsWith("worktree ") || first.length === 9) {
      issues.add("malformed-output");
      continue;
    }
    const path = first.slice(9);
    if (paths.has(path)) {
      issues.add("malformed-output");
      continue;
    }
    paths.add(path);
    let headSha: string | null = null;
    let branchRef: string | null = null;
    let headState: InventoryWorktree["headState"] = "incomplete";
    let detached = false,
      locked = false,
      prunable = false,
      bare = false;
    const seen = new Set<string>();
    for (const field of fields) {
      const space = field.indexOf(" ");
      const key = space < 0 ? field : field.slice(0, space);
      const value = space < 0 ? "" : field.slice(space + 1);
      if (seen.has(key)) {
        issues.add("malformed-output");
        continue;
      }
      seen.add(key);
      switch (key) {
        case "HEAD":
          if (!oid.test(value)) issues.add("malformed-output");
          else if (/^0+$/.test(value)) headState = "unborn";
          else {
            headSha = value;
            headState = "resolved";
          }
          break;
        case "branch":
          if (
            !value.startsWith("refs/heads/") ||
            ["\0", "\n", "\r", "\t"].some((character) => value.includes(character))
          )
            issues.add("malformed-output");
          else branchRef = value;
          break;
        case "detached":
          detached = true;
          if (value) issues.add("malformed-output");
          break;
        case "bare":
          bare = true;
          if (value) issues.add("malformed-output");
          break;
        case "locked":
          locked = true;
          break;
        case "prunable":
          prunable = true;
          break;
        default:
          issues.add("unsupported-output");
      }
    }
    if ((!bare && (!seen.has("HEAD") || (!branchRef && !detached))) || (branchRef && detached))
      issues.add("malformed-output");
    records.push({
      path,
      isMain: recordIndex === 0,
      headSha,
      branchRef,
      headState,
      detached,
      locked,
      prunable,
      bare,
    });
  }
  if (!records.length && !issues.size) issues.add("malformed-output");
  return { records, issues: [...issues] };
}

export function parseInventoryRefs(output: string, truncated = false) {
  const refs: InventoryRef[] = [];
  const issues = new Set<ProjectInventoryIssue>();
  if (truncated) issues.add("truncated");
  if (output && !output.endsWith("\n")) issues.add("malformed-output");
  const seen = new Set<string>();
  if (output.split("\n").length - 1 > INVENTORY_LIMITS.refs) issues.add("scan-limit");
  for (const line of output.split("\n").slice(0, -1)) {
    if (refs.length === INVENTORY_LIMITS.refs) {
      issues.add("scan-limit");
      break;
    }
    const parts = line.split("\0");
    const [fullRefName, headSha, timestamp, upstream, symref] = parts;
    if (
      parts.length !== 5 ||
      !fullRefName ||
      !headSha ||
      !oid.test(headSha) ||
      seen.has(fullRefName)
    ) {
      issues.add("malformed-output");
      continue;
    }
    seen.add(fullRefName);
    if (symref) continue; // remote HEAD is a symbolic alias, not a branch tip
    const kind = fullRefName.startsWith("refs/heads/")
      ? "local"
      : fullRefName.startsWith("refs/remotes/")
        ? "remote-tracking"
        : null;
    if (!kind) {
      issues.add("malformed-output");
      continue;
    }
    const seconds = Number(timestamp);
    const validDate =
      timestamp && Number.isSafeInteger(seconds) && Math.abs(seconds) < 8_640_000_000_000;
    if (timestamp && !validDate) issues.add("malformed-output");
    refs.push({
      fullRefName,
      name: fullRefName.slice(kind === "local" ? 11 : 13),
      kind,
      headSha,
      committedAt: validDate ? DateTime.formatIso(DateTime.makeUnsafe(seconds * 1000)) : null,
      upstreamRef: upstream || null,
    });
  }
  return { refs, issues: [...issues] };
}

export const inventoryNow = Effect.map(DateTime.now, DateTime.formatIso);
export const inventoryObservation = (
  subject: ProjectObservation["subject"],
  source: ProjectObservation["source"],
  observedAt: string | null,
  completeness: ProjectObservation["completeness"] = "complete",
): ProjectObservation => ({ subject, source, observedAt, cache: "live", ageMs: 0, completeness });

/** Observation helper owned by GitVcsDriver. No registry, persistence, hosting lookup or mutation. */
export const makeGitInventory = (execute: GitVcsDriver["Service"]["execute"]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const admission = yield* Semaphore.make(2);
    const read = (cwd: string, args: readonly string[], bytes: number = INVENTORY_LIMITS.bytes) =>
      execute({
        operation: "GitVcsDriver.projectInventory",
        cwd,
        args: [
          "--no-optional-locks",
          "-c",
          "core.fsmonitor=false",
          "-c",
          "core.untrackedCache=false",
          ...args,
        ],
        allowNonZeroExit: true,
        timeoutMs: INVENTORY_LIMITS.timeoutMs,
        maxOutputBytes: bytes,
        appendTruncationMarker: true,
        env: { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
      });
    const realPath = (value: string) => fs.realPath(value).pipe(Effect.orElseSucceed(() => null));
    const identify = (cwd: string) =>
      Effect.gen(function* () {
        const root = yield* realPath(cwd);
        if (!root) return null;
        const values = yield* Effect.forEach(
          ["--show-toplevel", "--git-common-dir", "--absolute-git-dir"],
          (flag) =>
            read(root, ["rev-parse", "--path-format=absolute", flag], 16_384).pipe(
              Effect.map((result) =>
                result.exitCode === 0 && !result.stdoutTruncated && result.stdout.endsWith("\n")
                  ? result.stdout.slice(0, -1)
                  : null,
              ),
            ),
          { concurrency: 2 },
        );
        const [top, common, gitDir] = values;
        if (!top || !common || !gitDir || (yield* realPath(top)) !== root) return null;
        const commonDir = yield* realPath(common);
        const canonicalGitDir = yield* realPath(gitDir);
        return commonDir && canonicalGitDir ? { root, commonDir, gitDir: canonicalGitDir } : null;
      });
    const scan = (commonDir: string) =>
      Effect.gen(function* () {
        const refsResult = yield* read(commonDir, [
          "--git-dir",
          commonDir,
          "for-each-ref",
          `--count=${INVENTORY_LIMITS.refs + 1}`,
          "--sort=refname",
          "--format=%(refname)%00%(objectname)%00%(committerdate:unix)%00%(upstream)%00%(symref)",
          "refs/heads",
          "refs/remotes",
        ]).pipe(Effect.option);
        const refsAt = yield* inventoryNow;
        const wtResult = yield* read(commonDir, [
          "--git-dir",
          commonDir,
          "worktree",
          "list",
          "--porcelain",
          "-z",
        ]).pipe(Effect.option);
        const worktreesAt = yield* inventoryNow;
        const refs =
          refsResult._tag === "Some" && refsResult.value.exitCode === 0
            ? parseInventoryRefs(refsResult.value.stdout, refsResult.value.stdoutTruncated)
            : { refs: [], issues: ["git-unavailable" as const] };
        const worktrees =
          wtResult._tag === "Some" && wtResult.value.exitCode === 0
            ? parseInventoryWorktrees(wtResult.value.stdout, wtResult.value.stdoutTruncated)
            : {
                records: [],
                issues: [
                  wtResult._tag === "Some" && wtResult.value.exitCode === 129
                    ? ("unsupported-output" as const)
                    : ("git-unavailable" as const),
                ],
              };
        const records = yield* Effect.forEach(
          worktrees.records,
          (record) =>
            Effect.gen(function* () {
              if (!path.isAbsolute(record.path)) {
                worktrees.issues.push("malformed-output");
                return null;
              }
              const stat = yield* fs.stat(record.path).pipe(Effect.result);
              const canonical = yield* realPath(record.path);
              const availability: InventoryWorktree["availability"] =
                canonical && stat._tag === "Success" && stat.success.type === "Directory"
                  ? "present"
                  : stat._tag === "Failure" && stat.failure.reason._tag === "NotFound"
                    ? "missing"
                    : "unavailable";
              return {
                ...record,
                realPath: canonical,
                availability,
                membership: "registered" as const,
              };
            }),
          { concurrency: 4 },
        );
        const observedAt = yield* inventoryNow;
        const issues = [...new Set([...refs.issues, ...worktrees.issues])];
        if (records.some((entry) => entry?.availability === "unavailable"))
          issues.push("workspace-unavailable");
        return {
          id: inventoryHash(
            commonDir,
            observedAt,
            refsResult._tag === "Some" ? refsResult.value.stdout : "",
            wtResult._tag === "Some" ? wtResult.value.stdout : "",
          ),
          refs: refs.refs,
          worktrees: records.filter((record) => record !== null),
          issues,
          observations: [
            inventoryObservation(
              "refs",
              "local-git",
              refs.issues.includes("git-unavailable") ? null : refsAt,
              refs.issues.includes("git-unavailable")
                ? "unavailable"
                : refs.issues.length
                  ? "partial"
                  : "complete",
            ),
            inventoryObservation(
              "worktrees",
              "local-git",
              worktrees.records.length ? worktreesAt : null,
              worktrees.issues.includes("unsupported-output")
                ? "unsupported"
                : worktrees.issues.includes("git-unavailable")
                  ? "unavailable"
                  : worktrees.issues.length
                    ? "partial"
                    : "complete",
            ),
            inventoryObservation(
              "paths",
              "filesystem",
              observedAt,
              issues.includes("workspace-unavailable") ? "partial" : "complete",
            ),
          ],
        } satisfies GitInventorySnapshot;
      });
    const cache = yield* Cache.makeWith(scan, {
      capacity: 64,
      timeToLive: () => Duration.seconds(15),
    });
    const refreshCache = yield* Cache.makeWith(
      (commonDir: string) =>
        Cache.refresh(cache, commonDir).pipe(Effect.andThen(Cache.get(cache, commonDir))),
      { capacity: 64, timeToLive: () => Duration.seconds(5) },
    );
    const observe = (input: { readonly cwd: string; readonly refresh?: boolean }) =>
      admission.withPermit(
        Effect.gen(function* () {
          const identity = yield* identify(input.cwd);
          if (!identity) return null;
          const identityObservedAt = yield* inventoryNow;
          const selectedCache = input.refresh ? refreshCache : cache;
          const previous = yield* Cache.getOption(selectedCache, identity.commonDir);
          const snapshot = yield* Cache.get(selectedCache, identity.commonDir);
          const loaded = Option.isNone(previous);
          return {
            ...identity,
            identityObservedAt,
            snapshot,
            cache: loaded ? ("live" as const) : ("cached" as const),
            refresh: !input.refresh
              ? ("not-requested" as const)
              : loaded
                ? ("refreshed" as const)
                : ("coalesced" as const),
          };
        }),
      );
    const inspect = (input: { readonly cwd: string; readonly commonDir: string }) =>
      admission.withPermit(
        Effect.gen(function* () {
          const identity = yield* identify(input.cwd);
          if (!identity || identity.commonDir !== input.commonDir) return null;
          const result = yield* read(identity.root, [
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=all",
            "--ignore-submodules=all",
            "-z",
          ]);
          if (result.exitCode !== 0 || result.stdoutTruncated) return null;
          let headSha: string | null = null,
            branchRef: string | null = null,
            detached = false,
            trackedChanges = 0,
            untrackedCount = 0;
          const fields = result.stdout.split("\0");
          if (fields.pop() !== "") return null;
          let sawHead = false,
            sawBranch = false;
          for (let i = 0; i < fields.length; i++) {
            const field = fields[i]!;
            if (field.startsWith("# branch.oid ")) {
              const value = field.slice(13);
              if (value !== "(initial)" && !oid.test(value)) return null;
              headSha = value === "(initial)" ? null : value;
              sawHead = true;
            } else if (field.startsWith("# branch.head ")) {
              const value = field.slice(14);
              detached = value === "(detached)";
              branchRef = detached ? null : `refs/heads/${value}`;
              sawBranch = true;
            } else if (field.startsWith("# branch.upstream ") || field.startsWith("# branch.ab "))
              continue;
            else if (field.startsWith("? ")) untrackedCount++;
            else if (/^[12u] /.test(field)) {
              trackedChanges++;
              if (field.startsWith("2 ") && fields[++i] === undefined) return null;
            } else return null;
          }
          return sawHead && sawBranch
            ? {
                ...identity,
                git: {
                  headSha,
                  branchRef,
                  detached,
                  trackedChanges,
                  untrackedCount,
                } satisfies WorkspaceGitObservation,
                observedAt: yield* inventoryNow,
              }
            : null;
        }),
      );
    const invalidate = (commonDir: string) =>
      realPath(commonDir).pipe(
        Effect.flatMap((resolved) =>
          resolved
            ? Effect.all(
                [Cache.invalidate(cache, resolved), Cache.invalidate(refreshCache, resolved)],
                { discard: true },
              )
            : Effect.void,
        ),
      );
    return { observe, inspect, invalidate };
  });
