import { useId } from "react";
import { WORKTREE_REMOVAL_UNAVAILABLE } from "../lib/checkoutSafety";
import { Button } from "./ui/button";

export function WorkspaceRemovalUnavailable() {
  const reasonId = useId();
  return (
    <div className="max-w-sm space-y-1.5">
      <Button size="xs" variant="outline" disabled aria-describedby={reasonId}>
        Remove workspace
      </Button>
      <p id={reasonId} className="text-xs text-muted-foreground">
        {WORKTREE_REMOVAL_UNAVAILABLE}
      </p>
    </div>
  );
}
