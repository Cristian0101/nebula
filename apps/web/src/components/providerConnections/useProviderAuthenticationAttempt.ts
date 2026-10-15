import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
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
import type { AuthenticationMetadata } from "./providerConnectionStatus";

/** Volatile presentation metadata only. No persist middleware, handoff, account, or guidance. */
export const useProviderConnectionAttempts = create<{
  attempts: Record<string, AuthenticationMetadata>;
}>(() => ({ attempts: {} }));
const pending = new Set<string>();
const lastPoll = new Map<string, number>();
export function authenticationMetadata(
  status: ProviderAuthenticationStatus,
): AuthenticationMetadata {
  const { handoff: _handoff, guidance: _guidance, ...metadata } = status;
  return metadata;
}
export function authenticationActive(
  status: Pick<ProviderAuthenticationStatus, "state"> | null | undefined,
) {
  return status?.state === "in-progress" || status?.state === "waiting-for-user";
}
export function useProviderAuthenticationAttempt({
  environmentId,
  instanceId,
  foreground = true,
  instanceRevision,
}: {
  environmentId: EnvironmentId;
  instanceId: ProviderInstanceId;
  foreground?: boolean;
  instanceRevision?: unknown;
}) {
  const session = useEnvironmentSessionState(environmentId);
  const connection = useEnvironmentConnectionState(environmentId);
  const canManage =
    connection.data?.phase === "connected" &&
    !connection.error &&
    !session.hasError &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes(AuthAccessWriteScope) === true;
  const key = JSON.stringify([
    environmentId,
    instanceId,
    connection.data?.generation,
    connection.data?.phase,
    canManage,
  ]);
  const fence = useRef({ key, revision: instanceRevision, generation: 0 });
  // Fence synchronously: a late promise cannot land between a reset render and its effect.
  if (fence.current.key !== key || fence.current.revision !== instanceRevision) {
    fence.current = { key, revision: instanceRevision, generation: fence.current.generation + 1 };
  }
  const generation = fence.current.generation;
  const metadata = useProviderConnectionAttempts((s) => s.attempts[key]);
  const [local, setLocal] = useState<{
    generation: number;
    status: ProviderAuthenticationStatus;
  } | null>(null);
  const [busyGeneration, setBusy] = useState<number | null>(null);
  const [errorGeneration, setError] = useState<number | null>(null);
  const command = useAtomCommand(serverEnvironment.providerAuthentication, {
    reportFailure: false,
    reportDefect: false,
  });
  const visible = useRef(foreground);
  visible.current = foreground;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      fence.current.generation += 1;
    };
  }, []);
  useEffect(() => {
    setLocal(null);
    setBusy(null);
    setError(null);
    return () => {
      useProviderConnectionAttempts.setState((s) => {
        const attempts = { ...s.attempts };
        delete attempts[key];
        return { attempts };
      });
      lastPoll.delete(key);
    };
  }, [key, instanceRevision]);
  useEffect(() => {
    if (!foreground) setLocal(null);
  }, [foreground]);
  const run = useCallback(
    async (
      operation: ProviderAuthenticationInput["operation"],
      ceremony?: ProviderAuthenticationInput["ceremony"],
    ) => {
      if (!canManage || pending.has(key)) return;
      const current = fence.current.generation;
      const previous = useProviderConnectionAttempts.getState().attempts[key];
      if (operation === "cancel" && !previous?.attemptId) return;
      pending.add(key);
      setBusy(current);
      setError(null);
      if (operation === "cancel") setLocal(null);
      const input = {
        environmentId,
        instanceId,
        operation,
        ...(ceremony ? { ceremony } : {}),
        ...(previous?.attemptId ? { attemptId: previous.attemptId } : {}),
      };
      try {
        const result = await command({ environmentId, input });
        if (!mounted.current || fence.current.generation !== current || fence.current.key !== key)
          return;
        if (
          result._tag !== "Success" ||
          result.value.environmentId !== environmentId ||
          result.value.instanceId !== instanceId
        ) {
          setLocal(null);
          setError(current);
          return;
        }
        const value = result.value;
        // A cancel must never replace a newer attempt. Status/refresh may discover one.
        if (
          operation === "cancel" &&
          value.attemptId !== previous?.attemptId &&
          value.reason !== "stale-attempt"
        ) {
          setLocal(null);
          setError(current);
          return;
        }
        const active =
          authenticationActive(value) &&
          value.expiresAt !== null &&
          Date.parse(value.expiresAt) > Date.now();
        const sanitized = { ...value, handoff: active && visible.current ? value.handoff : null };
        useProviderConnectionAttempts.setState((s) => ({
          attempts: { ...s.attempts, [key]: authenticationMetadata(sanitized) },
        }));
        setLocal(visible.current ? { generation: current, status: sanitized } : null);
      } catch {
        if (mounted.current && fence.current.generation === current) {
          setLocal(null);
          setError(current);
        }
      } finally {
        pending.delete(key);
        if (mounted.current && fence.current.generation === current) setBusy(null);
      }
    },
    [canManage, command, environmentId, instanceId, key, instanceRevision],
  );
  const active = authenticationActive(metadata);
  useEffect(() => {
    if (!active || !metadata?.expiresAt || !canManage) return;
    const timer = window.setTimeout(
      () => {
        fence.current.generation += 1;
        setLocal(null);
        setBusy(null);
        useProviderConnectionAttempts.setState((s) => ({
          attempts: {
            ...s.attempts,
            [key]: { ...metadata, state: "expired", reason: "timeout", expiresAt: null },
          },
        }));
      },
      Math.max(0, Date.parse(metadata.expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [active, metadata, canManage, key]);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  useEffect(() => {
    const onChange = () => setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  useEffect(() => {
    if (!active || !canManage || errorGeneration === generation) return;
    const delay = foreground && documentVisible ? 1000 : 5000;
    const timer = window.setInterval(() => {
      if (Date.now() - (lastPoll.get(key) ?? 0) < delay - 100 || pending.has(key)) return;
      lastPoll.set(key, Date.now());
      void run("status");
    }, delay);
    return () => window.clearInterval(timer);
  }, [active, canManage, documentVisible, foreground, generation, errorGeneration, key, run]);
  const localStatus =
    canManage && foreground && local?.generation === fence.current.generation ? local.status : null;
  const status = canManage
    ? (localStatus ?? (metadata ? { ...metadata, handoff: null, guidance: null } : null))
    : null;
  return {
    status,
    canManage,
    busy: busyGeneration === fence.current.generation,
    error: errorGeneration === fence.current.generation,
    phase:
      busyGeneration === fence.current.generation
        ? "preparing"
        : active
          ? "active"
          : status
            ? "outcome"
            : "idle",
    begin: (ceremony: ProviderAuthenticationInput["ceremony"]) => run("begin", ceremony),
    cancel: () => run("cancel"),
    refresh: () => run("refresh"),
    readStatus: useCallback(() => run("status"), [run]),
  };
}
export type ProviderAuthenticationAttempt = ReturnType<typeof useProviderAuthenticationAttempt>;
