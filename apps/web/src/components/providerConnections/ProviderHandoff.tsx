import { useState } from "react";
import type { ProviderAuthenticationStatus } from "@t3tools/contracts";
import { ensureLocalApi } from "../../localApi";
import { Button } from "../ui/button";
import { officialHandoffHost } from "./providerSignInCopy";

export function ProviderHandoff({ status }: { status: ProviderAuthenticationStatus }) {
  // A new attempt gets a new mounted private-code view.
  return <PrivateHandoff key={status.attemptId} status={status} />;
}
function PrivateHandoff({ status }: { status: ProviderAuthenticationStatus }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const handoff = status.handoff;
  const host = handoff ? officialHandoffHost(handoff.url, status.driver) : null;
  if (!handoff || !host || !status.expiresAt || Date.parse(status.expiresAt) <= Date.now())
    return null;
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        onClick={() => {
          void ensureLocalApi()
            .shell.openExternal(handoff.url)
            .catch(() => setFailed(true));
        }}
      >
        {handoff.userCode
          ? "Open verification page"
          : status.driver === "codex"
            ? "Open ChatGPT sign-in"
            : "Open Cursor sign-in"}{" "}
        ↗
      </Button>
      <p className="text-xs text-muted-foreground">{host}</p>
      {failed ? <p role="status">The sign-in page could not open. Try again.</p> : null}
      {handoff.userCode ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code
              aria-label={revealed ? "Private device code" : "Device code hidden"}
              className="rounded-lg border bg-muted px-4 py-3 font-mono text-xl tracking-widest"
            >
              {revealed ? handoff.userCode : "••••-••••"}
            </code>
            <Button
              size="sm"
              variant="outline"
              aria-pressed={revealed}
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? "Hide code" : "Show code"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(handoff.userCode ?? "").then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              Copy code
            </Button>
          </div>
          <p className="text-xs text-muted-foreground" role="status">
            {copied
              ? `Copied. Paste it only at ${host}.`
              : `Enter this code only at ${host}. Don't share it.`}
          </p>
        </>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Finish signing in there. This page updates by itself.
      </p>
    </div>
  );
}
