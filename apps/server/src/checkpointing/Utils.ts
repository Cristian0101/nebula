import * as NodeCrypto from "node:crypto";

import * as Encoding from "effect/Encoding";
import { CheckpointRef, ProjectId, type ThreadId } from "@t3tools/contracts";

export const CHECKPOINT_REFS_PREFIX = "refs/t3/checkpoints";

const MAX_CHECKPOINT_REF_PATH_SEGMENT_LENGTH = 200;

export function boundedGitRefPathSegment(encoded: string, digestSource: string): string {
  if (encoded.length <= MAX_CHECKPOINT_REF_PATH_SEGMENT_LENGTH) {
    return encoded;
  }

  return `sha256-${NodeCrypto.createHash("sha256").update(digestSource, "utf8").digest("base64url")}`;
}

export function checkpointRefPathSegment(value: string): string {
  const encoded = Encoding.encodeBase64Url(value);
  // Keep existing short ref names stable while bounding nested Mission/Replan IDs
  // below common filesystem component limits for loose Git refs.
  return boundedGitRefPathSegment(encoded, value);
}

export function checkpointRefForThreadTurn(threadId: ThreadId, turnCount: number): CheckpointRef {
  return CheckpointRef.make(
    `${CHECKPOINT_REFS_PREFIX}/${checkpointRefPathSegment(threadId)}/turn/${turnCount}`,
  );
}

export function resolveThreadWorkspaceCwd(input: {
  readonly thread: {
    readonly projectId: ProjectId;
    readonly worktreePath: string | null;
  };
  readonly projects: ReadonlyArray<{
    readonly id: ProjectId;
    readonly workspaceRoot: string;
  }>;
}): string | undefined {
  const worktreeCwd = input.thread.worktreePath ?? undefined;
  if (worktreeCwd) {
    return worktreeCwd;
  }

  return input.projects.find((project) => project.id === input.thread.projectId)?.workspaceRoot;
}
