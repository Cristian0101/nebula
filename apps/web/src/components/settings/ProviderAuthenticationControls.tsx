import type { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import {
  useProviderAuthenticationAttempt,
  authenticationActive,
} from "../providerConnections/useProviderAuthenticationAttempt";
import { RECOVERY_COPY } from "../providerConnections/providerReadinessCopy";
import { ProviderHandoff } from "../providerConnections/ProviderHandoff";
import { Button } from "../ui/button";

export function ProviderAuthenticationControls({
  environmentId,
  instanceId,
  instanceRevision,
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly instanceRevision?: unknown;
}) {
  const { status, busy, error, canManage, begin, cancel, refresh } =
    useProviderAuthenticationAttempt({ environmentId, instanceId, instanceRevision });
  const active = authenticationActive(status);
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
                ? `${status.state.replaceAll("-", " ")} — ${RECOVERY_COPY[status.reason]}`
                : "Check status to verify this instance and discover its supported login flow."}
          </p>
          {status?.guidance ? <p className="text-muted-foreground">{status.guidance}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="outline" disabled={busy} onClick={() => void refresh()}>
              Check status
            </Button>
            {!active
              ? status?.ceremonies.map((ceremony) => (
                  <Button
                    key={ceremony}
                    size="xs"
                    variant="outline"
                    disabled={busy || status.state === "not-installed"}
                    onClick={() => void begin(ceremony)}
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
              <Button size="xs" variant="outline" disabled={busy} onClick={() => void cancel()}>
                Cancel
              </Button>
            ) : null}
          </div>
          {active && status?.handoff ? <ProviderHandoff status={status} /> : null}
        </>
      )}
    </div>
  );
}
