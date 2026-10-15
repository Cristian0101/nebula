import "./providerConnections.css";
import { useCallback, useMemo, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, Link } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import {
  EnvironmentId,
  type ProviderInstanceId,
  type ServerProvider,
  type ProviderInstanceConfig,
} from "@t3tools/contracts";
import { deriveProviderReadiness } from "@t3tools/shared/providerReadiness";
import { useActiveEnvironmentId } from "../../state/entities";
import {
  useEnvironments,
  usePrimaryEnvironmentId,
  useEnvironmentConnectionState,
  type EnvironmentPresentation,
} from "../../state/environments";
import { useEnvironmentSessionState } from "../../state/session";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  Sheet,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { ToggleGroup, Toggle } from "../ui/toggle-group";
import { ProviderConnectionsContext } from "./ProviderConnectionsContext";
import { parseProviderConnectionsSearch } from "./providerConnectionsSearch";
import { ProviderConnectionCard } from "./ProviderConnectionCard";
import { ProviderConnectionDetail } from "./ProviderConnectionDetail";
import { deriveProviderConnectionStatus } from "./providerConnectionStatus";
import {
  useProviderAuthenticationAttempt,
  useProviderConnectionAttempts,
} from "./useProviderAuthenticationAttempt";
const lastAutomaticCheck = new Map<string, number>();
const primaryDrivers = ["codex", "cursor", "claudeAgent"];

export function ProviderConnectionsHost({ children }: { children: ReactNode }) {
  const search = useLocation({ select: (l) => l.search });
  const params = parseProviderConnectionsSearch(search);
  const navigate = useNavigate();
  const active = useActiveEnvironmentId();
  const primary = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const origin = useRef<HTMLElement | null>(null);
  const open = useCallback(
    (instanceId?: ProviderInstanceId, environmentId?: EnvironmentId) => {
      if (!params.connections)
        origin.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void navigate({
        to: ".",
        search: (previous) => ({
          ...previous,
          connections: instanceId ?? "all",
          ...((environmentId ?? active ?? primary)
            ? { connectionsEnv: (environmentId ?? active ?? primary)! }
            : {}),
        }),
      });
    },
    [navigate, active, primary, params.connections],
  );
  const close = useCallback(() => {
    void navigate({
      to: ".",
      search: (previous) => {
        const { connections: _c, connectionsEnv: _e, ...rest } = previous;
        return rest;
      },
      replace: true,
    });
  }, [navigate]);
  const environmentId = params.connectionsEnv ?? active ?? primary;
  const environment = environments.find((e) => e.environmentId === environmentId);
  return (
    <ProviderConnectionsContext value={open}>
      {children}
      {environment ? (
        <ConnectionsEnvironment
          key={environment.environmentId}
          environment={environment}
          environments={environments}
          open={params.connections !== undefined}
          selected={params.connections ?? "all"}
          select={(id) => open(id, environment.environmentId)}
          switchHost={(id) => open(undefined, id)}
          close={close}
          origin={origin}
        />
      ) : null}
    </ProviderConnectionsContext>
  );
}

function ConnectionsEnvironment({
  environment,
  environments,
  open,
  selected,
  select,
  switchHost,
  close,
  origin,
}: {
  environment: EnvironmentPresentation;
  environments: EnvironmentPresentation[];
  open: boolean;
  selected: "all" | ProviderInstanceId;
  select: (id?: ProviderInstanceId) => void;
  switchHost: (id: EnvironmentId) => void;
  close: () => void;
  origin: React.RefObject<HTMLElement | null>;
}) {
  const id = environment.environmentId;
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(id)) ?? EMPTY_SERVER_PROVIDERS;
  const displayInstances = useMemo(() => {
    const settings = environment.serverConfig?.settings;
    const legacy = settings?.providers as Record<string, unknown> | undefined;
    return Object.fromEntries(
      providers.map((provider) => [
        provider.instanceId,
        settings?.providerInstances?.[provider.instanceId] ?? {
          driver: provider.driver,
          config: legacy?.[provider.driver],
        },
      ]),
    );
  }, [providers, environment.serverConfig?.settings]);
  const session = useEnvironmentSessionState(id);
  const connection = useEnvironmentConnectionState(id);
  const connected = connection.data?.phase === "connected" && !connection.error;
  const scopes =
    connected && !session.hasError && session.data?.authenticated
      ? (session.data.scopes ?? [])
      : [];
  const canRead = scopes.includes("orchestration:read");
  const canOperate = canRead && scopes.includes("orchestration:operate");
  const canManage = canRead && scopes.includes("access:write");
  const capability =
    environment.serverConfig?.environment.capabilities.providerAuthentication === true;
  const refresh = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
    reportDefect: false,
  });
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  const refreshing = useRef(false);
  const check = useCallback(
    async (instanceId?: ProviderInstanceId) => {
      if (!canOperate || refreshing.current) return;
      refreshing.current = true;
      setChecking(true);
      setCheckMessage("");
      try {
        const result = await refresh({
          environmentId: id,
          input: instanceId ? { instanceId } : {},
        });
        setCheckMessage(
          result._tag === "Success"
            ? "Provider check completed."
            : "The check couldn't finish. Reconnect and try again.",
        );
      } catch {
        setCheckMessage("The check couldn't finish. Reconnect and try again.");
      } finally {
        refreshing.current = false;
        setChecking(false);
      }
    },
    [canOperate, id, refresh],
  );
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, [open]);
  const mirror = useProviderConnectionAttempts((s) => s.attempts);
  const rows = providers.map((provider) => {
    const readiness = deriveProviderReadiness({
      environmentId: id,
      instanceId: provider.instanceId,
      snapshot: { environmentId: id, provider },
      connected,
      now,
    });
    const key = JSON.stringify([
      id,
      provider.instanceId,
      connection.data?.generation,
      connection.data?.phase,
      canManage,
    ]);
    return {
      provider,
      readiness,
      status: deriveProviderConnectionStatus({
        readiness,
        lifecycle: mirror[key] ?? null,
        connected,
        enabled: provider.enabled !== false,
        canManage,
        canOperate,
        capabilityAvailable: capability,
        now,
      }),
    };
  });
  useEffect(() => {
    if (!open || !canOperate) return;
    const stale = providers.some(
      (provider) =>
        provider.enabled !== false &&
        !deriveProviderReadiness({
          environmentId: id,
          instanceId: provider.instanceId,
          snapshot: { environmentId: id, provider },
          connected,
          now: Date.now(),
        }).fresh,
    );
    if (!stale || Date.now() - (lastAutomaticCheck.get(id) ?? 0) < 60000) return;
    lastAutomaticCheck.set(id, Date.now());
    void check();
  }, [open, canOperate, providers, connected, id, check]);
  const [filter, setFilter] = useState("all");
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1920px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1920px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [detailTarget, setDetailTarget] = useState<HTMLDivElement | null>(null);
  const counted = rows.filter(
    (row) => row.provider.enabled !== false && row.status.group !== "disconnected",
  );
  const counts = {
    all: counted.length,
    ready: counted.filter((r) => r.status.group === "ready").length,
    attention: counted.filter(
      (r) => r.status.group === "attention" || r.status.group === "signing-in",
    ).length,
    unverified: counted.filter((r) => r.status.group === "unverified").length,
  };
  const primary = primaryDrivers.flatMap((driver) => {
    const row = rows.find((r) => r.provider.driver === driver && r.provider.enabled !== false);
    return row ? [row] : [];
  });
  const others = rows.filter((row) => !primary.includes(row));
  const matches = (row: (typeof rows)[number]) =>
    filter === "all" ||
    row.status.group === filter ||
    (filter === "attention" && row.status.group === "signing-in");
  const renderCard = (row: (typeof rows)[number], compact = false) => (
    <ProviderConnectionCard
      key={row.provider.instanceId}
      {...row}
      compact={compact}
      now={now}
      onDetails={() => select(row.provider.instanceId)}
      onAction={() => {
        if (row.status.primaryAction === "check") void check(row.provider.instanceId);
        else select(row.provider.instanceId);
      }}
    />
  );
  const list = (
    <div className="space-y-4 p-5 md:p-6">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
        Primary providers
      </p>
      {primary.filter(matches).map((r) => renderCard(r))}
      <p className="pt-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
        Other providers
      </p>
      {others.filter(matches).map((r) => renderCard(r, true))}
      {rows.filter(matches).length === 0 ? (
        <p className="text-sm text-muted-foreground">No providers in this view.</p>
      ) : null}
    </div>
  );
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <SheetPopup
          variant="connections"
          showCloseButton={false}
          finalFocus={() => origin.current}
          aria-label="Provider Connections"
        >
          <SheetHeader className="border-b p-5 md:p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-2">
                <SheetTitle>Provider Connections</SheetTitle>
                <SheetDescription>
                  Official accounts. Verified on your execution host.
                </SheetDescription>
              </div>
              <div className="flex shrink-0 gap-1">
                {canOperate ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={checking}
                    onClick={() => void check()}
                  >
                    {checking ? "Checking…" : "Check all"}
                  </Button>
                ) : null}
                <SheetClose
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Close Provider Connections"
                    />
                  }
                >
                  ×
                </SheetClose>
              </div>
            </div>
          </SheetHeader>
          <div className="space-y-3 border-b px-5 py-4 md:px-6">
            <label
              className="block text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
              htmlFor="connections-host"
            >
              Execution host
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="connections-host"
                value={id}
                onChange={(e) => switchHost(EnvironmentId.make(e.target.value))}
                className="min-w-0 flex-1 rounded-lg border bg-background p-2 text-xs"
              >
                {environments.map((e) => (
                  <option key={e.environmentId} value={e.environmentId}>
                    {e.label}
                  </option>
                ))}
              </select>
              <span className="rounded-md border px-2 py-1 text-[10px] text-muted-foreground">
                {canManage ? "Manage access" : "Read-only"}
              </span>
              <span className="text-xs text-muted-foreground">
                {connected ? "● Connected" : "○ Disconnected"}
              </span>
            </div>
            {!connected ? (
              <p role="status" className="text-xs text-muted-foreground">
                {environment.label} is disconnected. Provider status will refresh after
                reconnecting.{" "}
                <Link to="/settings/connections" onClick={close} className="underline">
                  Connection settings →
                </Link>
              </p>
            ) : !canRead ? (
              <p role="status" className="text-xs text-muted-foreground">
                Viewing readiness requires Read access on this host.
              </p>
            ) : !capability ? (
              <p className="text-xs text-muted-foreground">
                Sign-in from Nebula is unavailable on this older host.
              </p>
            ) : null}
            {!canOperate ? (
              <p className="text-xs text-muted-foreground">
                Checking needs Operate access on {environment.label}.
              </p>
            ) : null}
          </div>
          {canRead ? (
            <>
              <div className="border-b px-5 py-3 md:px-6">
                <ToggleGroup
                  value={[filter]}
                  onValueChange={(value) => setFilter(value[0] ?? "all")}
                  className="grid w-full grid-cols-4 gap-1"
                  aria-label="Filter providers"
                >
                  {(
                    [
                      ["all", "All"],
                      ["ready", "Ready"],
                      ["attention", "Needs attention"],
                      ["unverified", "Not verified"],
                    ] as const
                  ).map(([key, label]) => (
                    <Toggle
                      value={key}
                      key={key}
                      className={`rounded-md px-1 py-2 text-[10px] focus-visible:outline-2 focus-visible:outline-ring ${filter === key ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                    >
                      {label} <span className="font-mono tabular-nums">{counts[key]}</span>
                    </Toggle>
                  ))}
                </ToggleGroup>
              </div>
              <p
                role="status"
                className={checkMessage ? "px-6 pt-2 text-xs text-muted-foreground" : "sr-only"}
              >
                {checkMessage}
              </p>
              <div
                className={`connections-body min-h-0 flex-1 overflow-y-auto ${selected !== "all" ? "connections-detail-selected" : ""}`}
              >
                <div className="connections-list">{list}</div>
                <div ref={setDetailTarget} className="connections-detail" />
              </div>
            </>
          ) : (
            <div className="flex-1" />
          )}
          <SheetFooter className="flex-col! items-start! gap-2! px-5! md:px-6!">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Checks verify sign-in and runtime preflight, never a paid request. Entitlement and
              remaining usage are separate.
            </p>
            <Link to="/settings/providers" onClick={close} className="text-xs underline">
              Advanced Provider Settings →
            </Link>
          </SheetFooter>
        </SheetPopup>
      </Sheet>
      {canRead
        ? rows.map((row) => (
            <ProviderRuntime
              key={row.provider.instanceId}
              {...row}
              environment={environment}
              connected={connected}
              canOperate={canOperate}
              capability={capability}
              open={open}
              selected={
                selected === "all" && wide ? (primary[0]?.provider.instanceId ?? "all") : selected
              }
              target={detailTarget}
              now={now}
              check={() => void check(row.provider.instanceId)}
              back={() => select()}
              close={close}
              instance={
                environment.serverConfig?.settings.providerInstances?.[row.provider.instanceId]
              }
            />
          ))
        : null}
    </>
  );
}
function ProviderRuntime({
  provider,
  readiness,
  status,
  environment,
  canOperate,
  capability,
  open,
  selected,
  target,
  now,
  check,
  back,
  close,
  instance,
}: {
  provider: ServerProvider;
  readiness: ReturnType<typeof deriveProviderReadiness>;
  status: ReturnType<typeof deriveProviderConnectionStatus>;
  environment: EnvironmentPresentation;
  connected: boolean;
  canOperate: boolean;
  capability: boolean;
  open: boolean;
  selected: string;
  target: HTMLDivElement | null;
  now: number;
  check: () => void;
  back: () => void;
  close: () => void;
  instance: ProviderInstanceConfig | undefined;
}) {
  const show = open && target !== null && selected === provider.instanceId;
  const attempt = useProviderAuthenticationAttempt({
    environmentId: environment.environmentId,
    instanceId: provider.instanceId,
    foreground: show,
    instanceRevision: instance,
  });
  const readStatus = attempt.readStatus;
  useEffect(() => {
    if (open && capability && attempt.canManage && provider.enabled !== false) void readStatus();
  }, [open, show, capability, attempt.canManage, provider.enabled, readStatus]);
  return show
    ? createPortal(
        <ProviderConnectionDetail
          provider={provider}
          instance={instance}
          environmentId={environment.environmentId}
          host={environment.label}
          remote={environment.entry.target._tag !== "PrimaryConnectionTarget"}
          readiness={readiness}
          status={status}
          attempt={attempt}
          canOperate={canOperate}
          capability={capability}
          now={now}
          check={check}
          back={back}
          close={close}
        />,
        target,
      )
    : null;
}
