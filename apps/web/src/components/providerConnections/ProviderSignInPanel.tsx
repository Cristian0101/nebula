import { useEffect, useState } from "react";
import type { ProviderInstanceConfig, ServerProvider } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { ProviderHandoff } from "./ProviderHandoff";
import type { ProviderAuthenticationAttempt } from "./useProviderAuthenticationAttempt";
import { authenticationActive } from "./useProviderAuthenticationAttempt";
import { LIFECYCLE_COPY, RECOVERY_COPY } from "./providerReadinessCopy";
import { CLAUDE_ELIGIBILITY, OVERRIDE_NAMES, signInCopy } from "./providerSignInCopy";
export function AttemptCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return (
    <>
      <span
        role="timer"
        aria-live="off"
        className="font-mono text-xs tabular-nums text-muted-foreground"
      >
        Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
      </span>
      <span className="sr-only" role="status">
        {left === 0
          ? "Sign-in expired"
          : left <= 60
            ? "Sign-in expires in less than one minute"
            : ""}
      </span>
    </>
  );
}
export function ProviderSignInPanel({
  provider,
  host,
  remote,
  instance,
  attempt,
  done,
}: {
  provider: ServerProvider;
  host: string;
  remote: boolean;
  instance: ProviderInstanceConfig | undefined;
  attempt: ProviderAuthenticationAttempt;
  done: () => void;
}) {
  const { status, canManage, busy, error, begin, cancel, refresh, readStatus } = attempt;
  const copy = signInCopy(provider.driver);
  const active = authenticationActive(status);
  const config =
    instance?.config && typeof instance.config === "object"
      ? (instance.config as Record<string, unknown>)
      : {};
  const executable =
    typeof config.binaryPath === "string"
      ? config.binaryPath
      : provider.driver === "claudeAgent"
        ? "claude (default executable)"
        : "Default configured executable";
  const configDir = typeof config.homePath === "string" ? config.homePath : "Default (not set)";
  const ceremonies = status?.ceremonies ?? [];
  const preferred = remote && ceremonies.includes("device-code") ? "device-code" : ceremonies[0];
  const retry = () => {
    if (preferred) void begin(preferred);
    else void readStatus();
  };
  return (
    <section
      aria-label="Official provider sign-in"
      className="space-y-4 rounded-xl border bg-muted/35 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Sign in to {provider.displayName ?? provider.driver}
        </h3>
        {active && status?.expiresAt ? <AttemptCountdown expiresAt={status.expiresAt} /> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Execution host: {host} · Instance: {provider.instanceId}
      </p>
      {!canManage ? (
        <p role="status" className="text-sm text-muted-foreground">
          Needs Manage access. Signing in requires Manage access on {host}. Readiness stays visible.
        </p>
      ) : (
        <>
          <p role="status" className="text-sm">
            {error
              ? "Status unavailable. Reconnect to the host, then retry."
              : busy
                ? "Preparing sign-in…"
                : status
                  ? LIFECYCLE_COPY[status.state]
                  : "Check status to discover the supported official sign-in flow."}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {status && status.reason !== "none" ? RECOVERY_COPY[status.reason] : copy.description}
          </p>
          {status?.reason === "api-override" ? (
            <p className="break-words text-xs text-muted-foreground">
              Review one of: {(OVERRIDE_NAMES[provider.driver] ?? []).join(", ")}. Key helpers can
              also take precedence.
            </p>
          ) : null}
          {provider.driver === "cursor" ? (
            <p className="break-all font-mono text-xs">Executable: {executable}</p>
          ) : null}
          {provider.driver === "codex" && remote ? (
            <p className="text-xs text-muted-foreground">
              Browser sign-in finishes on {host}. Prefer a device code when your browser is on
              another machine.
            </p>
          ) : null}
          {active && status ? (
            <>
              <ProviderHandoff status={status} />
              {provider.driver === "claudeAgent" ? (
                <ol className="list-decimal space-y-3 pl-5 text-sm">
                  <li>Open your own terminal on {host}.</li>
                  <li>
                    Use this instance's configuration:
                    <dl className="mt-2 space-y-2 text-xs">
                      <dt className="text-muted-foreground">Executable</dt>
                      <dd className="break-all font-mono">{executable}</dd>
                      <dt className="text-muted-foreground">CLAUDE_CONFIG_DIR</dt>
                      <dd className="break-all font-mono">{configDir}</dd>
                    </dl>
                  </li>
                  <li>
                    Run <code className="font-mono">auth login</code> with that executable.
                  </li>
                  <li>Finish the prompts in your terminal and browser.</li>
                  <li>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void refresh()}
                    >
                      Check sign-in status
                    </Button>
                  </li>
                </ol>
              ) : null}
              <p className="text-xs text-muted-foreground">Waiting for you…</p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !status.attemptId}
                onClick={() => void cancel()}
              >
                {provider.driver === "claudeAgent" ? "Stop tracking" : "Cancel"}
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {status?.state === "authenticated" ? (
                <>
                  <p className="w-full text-sm">
                    Signed in on {host}. Signing in doesn't guarantee a model or included usage.
                  </p>
                  <Button size="sm" onClick={done}>
                    Done
                  </Button>
                </>
              ) : null}
              {preferred &&
              status?.reason !== "api-override" &&
              status?.state !== "not-installed" &&
              status?.state !== "unsupported" ? (
                <Button size="sm" disabled={busy} onClick={retry}>
                  {status?.state === "expired"
                    ? "Start a new sign-in"
                    : status?.state === "failed"
                      ? "Try again"
                      : preferred === "device-code"
                        ? "Sign in with a device code"
                        : copy.label}
                </Button>
              ) : null}
              {ceremonies.length > 1
                ? ceremonies
                    .filter((c) => c !== preferred)
                    .map((c) => (
                      <Button
                        key={c}
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void begin(c)}
                      >
                        {c === "device-code" ? "Use a device code instead" : "Use browser login"}
                      </Button>
                    ))
                : null}
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
                {error ? "Retry status" : "Check status"}
              </Button>
            </div>
          )}
        </>
      )}
      {provider.driver === "claudeAgent" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{CLAUDE_ELIGIBILITY}</p>
      ) : null}
      {provider.driver === "cursor" ? (
        <p className="text-xs text-muted-foreground">X Subscription migration: Unknown</p>
      ) : null}
    </section>
  );
}
