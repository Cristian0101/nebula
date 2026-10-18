import type { ScopedProjectRef } from "@t3tools/contracts";
import { type DraftId, useComposerDraftStore } from "../../../composerDraftStore";

/** Reuse composer drafts for route handoff; URLs contain an opaque ID, never the prompt. */
export function readProjectHomePrefill(
  ref: ScopedProjectRef,
  workDraft: string | undefined,
): string | null {
  if (!workDraft) return null;
  const store = useComposerDraftStore.getState();
  const draft = store.getDraftSession(workDraft as DraftId);
  if (
    !draft ||
    draft.promotedTo ||
    draft.environmentId !== ref.environmentId ||
    draft.projectId !== ref.projectId ||
    draft.worktreePath !== null ||
    draft.startFromOrigin
  )
    return null;
  return store.getComposerDraft(workDraft as DraftId)?.prompt ?? null;
}
