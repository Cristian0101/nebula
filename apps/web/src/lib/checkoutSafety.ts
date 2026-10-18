// E4.S: keep client affordances aligned with the server's suspended mutations.
export const PULL_UNAVAILABLE =
  "Pull is temporarily unavailable while checkout safety is being coordinated. Keep this checkout until coordinated updates are available.";
export const CHECKOUT_SWITCH_UNAVAILABLE =
  "Checkout switching is temporarily unavailable. Open the branch in a new worktree instead.";
export const WORKTREE_REMOVAL_UNAVAILABLE =
  "Workspace removal is temporarily unavailable while checkout safety is being coordinated. Keep the workspace; the branch and committed work are preserved.";
