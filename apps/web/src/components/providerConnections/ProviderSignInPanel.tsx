import { Link } from "@tanstack/react-router";
import { LockIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
      <span className="sr-only" role={left === 0 ? "alert" : "status"}>
        {left === 0
          ? "Sign-in attempt timed out"
          : left <= 60
            ? "Sign-in expires in less than one minute"
            : ""}
      </span>
    </>
  );
}
function CopyValue({
  label,
  value,
  copyable = true,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border bg-background p-2 font-mono text-xs">
          {value}
        </code>
        {copyable ? (
          <Button
            variant="outline"
            size="xs"
            onClick={() => void navigator.clipboard.writeText(value)}
          >
            Copy {label === "CLAUDE_CONFIG_DIR" ? "configuration directory" : "executable"}
          </Button>
        ) : null}
      </dd>
    </div>
  );
}
export function ProviderSignInPanel({
  provider,
  host,
  remote,
  instance,
  attempt,
  done,
  beginRequested = false,
  onBeginHandled,
  primaryStartInStatus = false,
}: {
  provider: ServerProvider;
  host: string;
  remote: boolean;
  instance: ProviderInstanceConfig | undefined;
  attempt: ProviderAuthenticationAttempt;
  done: () => void;
  beginRequested?: boolean;
  onBeginHandled?: () => void;
  primaryStartInStatus?: boolean;
}) {
  const { status, canManage, busy, error, begin, cancel, refresh, readStatus } = attempt;
  const copy = signInCopy(provider.driver);
  const panel = useRef<HTMLElement>(null);
  const consumed = useRef(false);
  const [startedHere, setStartedHere] = useState(false);
  const active = authenticationActive(status);
  useEffect(() => {
    setStartedHere(false);
  }, [instance, canManage]);
  useEffect(() => {
    if (!status && attempt.phase !== "preparing") setStartedHere(false);
  }, [status, attempt.phase]);
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
  const canBegin =
    status?.reason !== "api-override" &&
    status?.state !== "not-installed" &&
    status?.state !== "unsupported" &&
    provider.enabled !== false;
  const preferred = remote && ceremonies.includes("device-code") ? "device-code" : ceremonies[0];
  const start = (ceremony: Parameters<typeof begin>[0]) => {
    setStartedHere(true);
    void begin(ceremony);
  };
  // A card's explicit sign-in action survives the status read, then is consumed once.
  // The intent contains no ceremony material and never enters URL or shared state.
  useEffect(() => {
    if (!beginRequested) {
      consumed.current = false;
      return;
    }
    if (consumed.current || busy || !status) return;
    if (!canManage || !canBegin || active || error || !preferred) {
      consumed.current = true;
      onBeginHandled?.();
      return;
    }
    consumed.current = true;
    onBeginHandled?.();
    setStartedHere(true);
    void begin(preferred);
  }, [
    beginRequested,
    busy,
    status,
    canManage,
    canBegin,
    active,
    error,
    preferred,
    begin,
    onBeginHandled,
  ]);
  const state = status?.state;
  const attemptId = status?.attemptId;
  const hasHandoff = status?.handoff !== null && status?.handoff !== undefined;
  useEffect(() => {
    if (!startedHere) return;
    const target = active
      ? (panel.current?.querySelector<HTMLElement>("[data-handoff-focus='code']") ??
        panel.current?.querySelector<HTMLElement>(
          "[data-handoff-focus='open'], [data-sign-in-focus='check']",
        ))
      : panel.current?.querySelector<HTMLElement>(
          "[data-sign-in-focus='done'], [data-sign-in-focus='retry']",
        );
    (target ?? panel.current)?.focus({ preventScroll: true });
  }, [state, attemptId, attempt.phase, hasHandoff, error, startedHere, active]);
  const success = state === "authenticated" && (startedHere || attemptId != null);
  const retryState = state === "failed" || state === "cancelled" || state === "expired";
  const showStart =
    preferred && canBegin && (!primaryStartInStatus || retryState || state === "authenticated");
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Official provider sign-in"
      className="space-y-4 rounded-xl border bg-muted/35 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Account and sign-in</h3>
        {active && status?.expiresAt ? <AttemptCountdown expiresAt={status.expiresAt} /> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Execution host: {host} · Instance: {provider.instanceId}
      </p>
      {!canManage ? (
        <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
          <LockIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          Needs Manage access. Signing in requires Manage access on {host}. Readiness stays visible.
        </p>
      ) : (
        <>
          <p
            role={error || state === "failed" || state === "expired" ? "alert" : "status"}
            className="text-sm"
          >
            {error
              ? "Status unavailable. Reconnect to the host, then retry."
              : provider.enabled === false
                ? "Enable this provider in Provider Settings to sign in."
                : attempt.phase === "preparing"
                  ? "Preparing sign-in…"
                  : status
                    ? status.state === "not-installed"
                      ? "Provider setup required"
                      : LIFECYCLE_COPY[status.state]
                    : "Loading sign-in options…"}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {provider.enabled === false
              ? RECOVERY_COPY.disabled
              : status && status.reason !== "none"
                ? RECOVERY_COPY[status.reason]
                : copy.description}
          </p>
          {status?.reason === "api-override" ? (
            <p className="break-words text-xs text-muted-foreground">
              Review one of: {(OVERRIDE_NAMES[provider.driver] ?? []).join(", ")}. Key helpers can
              also take precedence.
            </p>
          ) : null}
          {provider.driver === "claudeAgent" && state === "cancelled" ? (
            <p className="text-xs text-muted-foreground">
              Nebula stopped tracking. Cancel the CLI sign-in yourself in your terminal.
            </p>
          ) : null}
          {provider.driver === "cursor" && !success ? (
            <dl>
              <CopyValue label="Executable" value={executable} />
            </dl>
          ) : null}
          {provider.driver === "codex" && remote ? (
            <p className="text-xs text-muted-foreground">
              Browser sign-in finishes on {host}. Prefer a device code when your browser is on
              another machine.
            </p>
          ) : null}
          {status &&
          ["unsupported", "api-override", "disabled", "missing-executable"].includes(
            status.reason,
          ) ? (
            <Link
              to="/settings/providers"
              search={{ instance: provider.instanceId, environment: status.environmentId }}
              className="inline-block text-sm underline"
            >
              {status.reason === "disabled"
                ? "Enable in Provider Settings"
                : "Review in Provider Settings"}{" "}
              →
            </Link>
          ) : null}
          {active && status && !error ? (
            <>
              {provider.driver !== "claudeAgent" ? (
                <ProviderHandoff status={status} />
              ) : (
                <ol className="list-decimal space-y-3 pl-5 text-sm">
                  <li>Open your own terminal on {host}.</li>
                  <li>
                    Use this instance's configuration:
                    <dl className="mt-2 space-y-3">
                      <CopyValue label="Executable" value={executable} />
                      <CopyValue
                        label="CLAUDE_CONFIG_DIR"
                        value={configDir}
                        copyable={configDir !== "Default (not set)"}
                      />
                    </dl>
                  </li>
                  <li>
                    Run <code className="font-mono">auth login</code> with that executable.
                  </li>
                  <li>Finish the prompts in your terminal and browser.</li>
                  <li>
                    <Button
                      data-sign-in-focus="check"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void refresh()}
                    >
                      Check sign-in status
                    </Button>
                  </li>
                </ol>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !status.attemptId}
                onClick={() => void cancel()}
              >
                {provider.driver === "claudeAgent" ? "Stop tracking" : "Cancel"}
              </Button>
            </>
          ) : success ? (
            <div className="flex flex-wrap gap-2">
              <p className="w-full text-sm">
                Signed in on {host}. Signing in doesn't guarantee a model or included usage.
              </p>
              <Button data-sign-in-focus="done" size="sm" onClick={done}>
                Done
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const readiness = document.querySelector<HTMLElement>(
                    "[data-provider-connection-readiness]",
                  );
                  readiness?.focus({ preventScroll: true });
                  readiness?.scrollIntoView({ block: "start" });
                }}
              >
                View readiness
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {error ? (
                <Button
                  data-sign-in-focus="retry"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void readStatus()}
                >
                  Retry status
                </Button>
              ) : showStart ? (
                <Button
                  data-sign-in-focus="retry"
                  size="sm"
                  variant={state === "authenticated" ? "outline" : "default"}
                  disabled={busy}
                  onClick={() => start(preferred)}
                >
                  {state === "authenticated"
                    ? "Sign in again"
                    : state === "expired"
                      ? "Start a new sign-in"
                      : retryState
                        ? "Try again"
                        : preferred === "device-code"
                          ? "Sign in with a device code"
                          : copy.label}
                </Button>
              ) : null}
              {!error && canBegin && ceremonies.length > 1
                ? ceremonies
                    .filter((c) => c !== preferred)
                    .map((c) => (
                      <Button
                        key={c}
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => start(c)}
                      >
                        {c === "device-code" ? "Use a device code instead" : "Use browser login"}
                      </Button>
                    ))
                : null}
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
