import { useCallback, useEffect, useRef, useState } from "react";
import {
  AuthAccessWriteScope,
  type EnvironmentId,
  type ProviderInstanceId,
  type ProviderAuthenticationInput,
  type ProviderAuthenticationStatus,
} from "@t3tools/contracts";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentSessionState } from "../../state/session";
import { useEnvironmentConnectionState } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";

const MESSAGES: Record<ProviderAuthenticationStatus["reason"], string> = {
  none: "Authentication and subscription entitlement are separate facts.",
  disabled: "Enable this provider instance before signing in.",
  unsupported:
    "Interactive login is not supported by this provider or installed protocol. Use its official tools, then refresh readiness.",
  "environment-mismatch": "The execution environment changed. Check its identity and retry.",
  "instance-unavailable": "This provider instance is unavailable. Check its configuration.",
  "missing-executable": "Install the official CLI or correct this instance's executable path.",
  "login-required": "Sign in with the provider's official flow on this execution host.",
  "process-failed":
    "The official login process failed. Check the CLI version, network and provider configuration, then retry.",
  timeout: "This login attempt expired. Start a new attempt.",
  "verification-failed":
    "Fresh account verification could not be completed. Check status before relying on the connection.",
  cancelled: "This attempt was cancelled. Shared provider authentication was not logged out.",
  "stale-attempt": "The attempt changed. Check status before cancelling again.",
  "api-override":
    "An API or external credential override is configured. Review it on the execution host before choosing an account or billing route. Nebula will not remove it automatically.",
  "provider-restarted":
    "The provider restarted or has not yet been checked. Request fresh verification.",
};

export function ProviderAuthenticationControls({
  environmentId,
  instanceId,
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
}) {
  const session = useEnvironmentSessionState(environmentId);
  const connection = useEnvironmentConnectionState(environmentId);
  const canManage =
    connection.data?.phase === "connected" &&
    !connection.error &&
    !session.hasError &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes(AuthAccessWriteScope) === true;
  // A transport generation owns its volatile renderer state. Cached session scopes
  // can survive a disconnect; they must not keep a previous ceremony visible.
  return (
    <ProviderAuthenticationAttemptControls
      key={JSON.stringify([
        environmentId,
        instanceId,
        connection.data?.generation,
        connection.data?.phase,
        canManage,
      ])}
      environmentId={environmentId}
      instanceId={instanceId}
      canManage={canManage}
    />
  );
}

function ProviderAuthenticationAttemptControls({
  environmentId,
  instanceId,
  canManage,
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly canManage: boolean;
}) {
  const command = useAtomCommand(serverEnvironment.providerAuthentication, {
    reportFailure: false,
    reportDefect: false,
  });
  const [status, setStatus] = useState<ProviderAuthenticationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [environmentId, instanceId],
  );
  const run = useCallback(
    async (
      operation: ProviderAuthenticationInput["operation"],
      ceremony?: ProviderAuthenticationInput["ceremony"],
      attemptId?: string,
    ) => {
      if (inFlight.current || !canManage) return;
      inFlight.current = true;
      setBusy(true);
      setError(false);
      const current = generation.current;
      if (operation === "cancel")
        setStatus((previous) => (previous ? { ...previous, handoff: null } : null));
      const result = await command({
        environmentId,
        input: {
          environmentId,
          instanceId,
          operation,
          ...(ceremony ? { ceremony } : {}),
          ...(attemptId ? { attemptId } : {}),
        },
      });
      inFlight.current = false;
      if (generation.current !== current) return;
      setBusy(false);
      if (
        result._tag === "Success" &&
        result.value.environmentId === environmentId &&
        result.value.instanceId === instanceId
      ) {
        setStatus(result.value);
      } else {
        // Never surface an RPC cause or keep ceremony data after transport failure.
        setStatus(null);
        setError(true);
      }
    },
    [canManage, command, environmentId, instanceId],
  );
  const active = status?.state === "in-progress" || status?.state === "waiting-for-user";
  useEffect(() => {
    if (!active || !status?.expiresAt) return;
    const timer = window.setTimeout(
      () => {
        generation.current += 1;
        setBusy(false);
        setStatus((previous) =>
          previous
            ? { ...previous, state: "expired", reason: "timeout", handoff: null, expiresAt: null }
            : null,
        );
      },
      Math.max(0, Date.parse(status.expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [active, status?.expiresAt]);
  useEffect(() => {
    if (!active || !canManage) return;
    const timer = window.setTimeout(() => void run("status"), 1000);
    return () => window.clearTimeout(timer);
  }, [active, canManage, run, status]);

  return (
    <div className="space-y-2 text-xs" aria-label="Provider authentication">
      <p className="font-medium">Official provider sign-in</p>
      <p className="break-all text-muted-foreground">
        Execution environment: {status?.environmentLabel ?? environmentId} · Instance: {instanceId}.
        Complete login on that host; other environments have separate authentication.
      </p>
      {!canManage ? (
        <p className="text-muted-foreground">
          Account management requires Manage access permission for this environment.
        </p>
      ) : (
        <>
          <p role="status">
            {error
              ? "Authentication status is unavailable. Reconnect to the environment and retry."
              : status
                ? `${status.state.replaceAll("-", " ")} — ${MESSAGES[status.reason]}`
                : "Check status to verify this instance and discover its supported login flow."}
          </p>
          {status?.guidance ? <p className="text-muted-foreground">{status.guidance}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="outline" disabled={busy} onClick={() => void run("refresh")}>
              Check status
            </Button>
            {!active
              ? status?.ceremonies.map((ceremony) => (
                  <Button
                    key={ceremony}
                    size="xs"
                    variant="outline"
                    disabled={busy || status.state === "not-installed"}
                    onClick={() => void run("begin", ceremony)}
                  >
                    {ceremony === "device-code"
                      ? "Use device code"
                      : ceremony === "terminal"
                        ? "Continue official login"
                        : status.driver === "codex"
                          ? "Sign in with ChatGPT"
                          : status.state === "authenticated"
                            ? "Reconnect"
                            : "Sign in"}
                  </Button>
                ))
              : null}
            {active && status?.attemptId ? (
              <Button
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() => void run("cancel", undefined, status.attemptId ?? undefined)}
              >
                Cancel
              </Button>
            ) : null}
          </div>
          {active && status?.handoff ? (
            <div className="space-y-1">
              <a
                className="underline"
                href={status.handoff.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                Continue in the provider's official browser login
              </a>
              {status.handoff.userCode ? (
                <p>
                  Enter this private one-time code: <code>{status.handoff.userCode}</code>. Do not
                  share it.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
