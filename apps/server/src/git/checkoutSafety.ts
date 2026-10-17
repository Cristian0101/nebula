import { GitCommandError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

// E4.S containment: no activity snapshot can authorize a checkout mutation.
// E4.4 must coordinate mutation with every process/session admission path.
export const CHECKOUT_SWITCH_UNAVAILABLE =
  "Checkout switching is temporarily unavailable because workspace ownership and activity cannot be safely coordinated. Open the branch in a new worktree instead.";

export const WORKTREE_REMOVAL_UNAVAILABLE =
  "Worktree removal is temporarily unavailable because workspace ownership and activity cannot be safely coordinated. Keep the worktree until coordinated cleanup is available.";

export function refuseCheckoutMutation(
  operation: string,
  cwd: string,
  detail = CHECKOUT_SWITCH_UNAVAILABLE,
) {
  return Effect.fail(new GitCommandError({ operation, command: "checkout-safety", cwd, detail }));
}
