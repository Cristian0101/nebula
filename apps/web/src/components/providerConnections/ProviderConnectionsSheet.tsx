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
import { useProviderConnectionsEnvironment } from "./useProviderConnectionsEnvironment";
import {
  useEnvironments,
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
import { LockIcon } from "lucide-react";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../ui/empty";
const lastAutomaticCheck = new Map<string, number>();
const primaryDrivers = ["codex", "cursor", "claudeAgent"];

function connectionsReturnFocus(origin: React.RefObject<HTMLElement | null>) {
  // The originating sidebar control can disappear at a responsive breakpoint.
  return origin.current?.isConnected
    ? origin.current
    : document.querySelector<HTMLElement>('button[aria-label="Toggle main sidebar"]');
}

export function ProviderConnectionsHost({ children }: { children: ReactNode }) {
  const search = useLocation({ select: (l) => l.search });
  const params = parseProviderConnectionsSearch(search);
  const navigate = useNavigate();
  const selectedEnvironment = useProviderConnectionsEnvironment();
  const { environments } = useEnvironments();
  const origin = useRef<HTMLElement | null>(null);
  const [initialFilter, setInitialFilter] = useState("all");
  const [modelSelection, setModelSelection] = useState<{
    instanceId: ProviderInstanceId;
    environmentId: EnvironmentId;
    model: string;
  } | null>(null);
  const open = useCallback(
    (
      instanceId?: ProviderInstanceId,
      environmentId?: EnvironmentId,
      selectedModel?: string,
      filter?: "attention",
    ) => {
      if (!params.connections) setInitialFilter(filter ?? "all");
      const hostId = environmentId ?? selectedEnvironment;
      if (!hostId) return;
      if (instanceId && hostId && selectedModel)
        setModelSelection({ instanceId, environmentId: hostId, model: selectedModel });
      else if (!params.connections) setModelSelection(null);
      if (!params.connections)
        origin.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void navigate({
        to: ".",
        search: (previous) => ({
          ...previous,
          connections: instanceId ?? "all",
          connectionsEnv: hostId,
        }),
      });
    },
    [navigate, selectedEnvironment, params.connections],
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
  const environmentId = params.connectionsEnv ?? selectedEnvironment;
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
          modelSelection={modelSelection}
          initialFilter={initialFilter}
        />
      ) : params.connections ? (
        <Sheet
          open
          onOpenChange={(value) => {
            if (!value) close();
          }}
        >
          <SheetPopup variant="connections" finalFocus={() => connectionsReturnFocus(origin)}>
            <SheetHeader>
              <SheetTitle className="text-lg">Provider connections</SheetTitle>
              <SheetDescription>
                The selected execution host is no longer available. Choose a host to continue.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-2 p-6">
              {environments.map((host) => (
                <Button
                  key={host.environmentId}
                  variant="outline"
                  onClick={() => open(undefined, host.environmentId)}
                >
                  {host.label}
                </Button>
              ))}
            </div>
          </SheetPopup>
        </Sheet>
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
  modelSelection,
  initialFilter,
}: {
  environment: EnvironmentPresentation;
  environments: EnvironmentPresentation[];
  open: boolean;
  selected: "all" | ProviderInstanceId;
  select: (id?: ProviderInstanceId) => void;
  switchHost: (id: EnvironmentId) => void;
  close: () => void;
  origin: React.RefObject<HTMLElement | null>;
  initialFilter: string;
  modelSelection: {
    instanceId: ProviderInstanceId;
    environmentId: EnvironmentId;
    model: string;
  } | null;
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
    !session.hasError && session.data?.authenticated ? (session.data.scopes ?? []) : [];
  const canRead = scopes.includes("orchestration:read");
  const canOperate = connected && canRead && scopes.includes("orchestration:operate");
  const canManage = connected && canRead && scopes.includes("access:write");
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
    async (instanceId?: ProviderInstanceId, automaticIds?: readonly ProviderInstanceId[]) => {
      if (!canOperate || refreshing.current) return;
      refreshing.current = true;
      setChecking(true);
      setCheckMessage("");
      try {
        let succeeded = true;
        for (const target of automaticIds ?? [instanceId]) {
          const result = await refresh({
            environmentId: id,
            input: target ? { instanceId: target } : {},
          });
          if (result._tag !== "Success") succeeded = false;
        }
        setCheckMessage(
          succeeded
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
    const selectedModel =
      modelSelection?.environmentId === id && modelSelection.instanceId === provider.instanceId
        ? modelSelection.model
        : provider.models.find((model) => model.isDefault)?.slug;
    const modelLabel =
      provider.models.find((model) => model.slug === selectedModel)?.name ?? selectedModel;
    const readiness = deriveProviderReadiness({
      environmentId: id,
      instanceId: provider.instanceId,
      snapshot: { environmentId: id, provider },
      connected,
      now,
      selectedModel,
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
      modelLabel,
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
    const timestamp = Date.now();
    const stale = providers
      .filter(
        (provider) =>
          provider.enabled !== false &&
          !deriveProviderReadiness({
            environmentId: id,
            instanceId: provider.instanceId,
            snapshot: { environmentId: id, provider },
            connected,
            now: timestamp,
          }).fresh &&
          timestamp - (lastAutomaticCheck.get(`${id}:${provider.instanceId}`) ?? 0) >= 60000,
      )
      .map((provider) => provider.instanceId);
    if (!stale.length || refreshing.current) return;
    for (const instanceId of stale) lastAutomaticCheck.set(`${id}:${instanceId}`, timestamp);
    void check(undefined, stale);
  }, [open, canOperate, providers, connected, id, check]);
  const [filter, setFilter] = useState(initialFilter);
  useEffect(() => {
    if (open) setFilter(initialFilter);
  }, [open, initialFilter]);
  const [beginIntent, setBeginIntent] = useState<{
    instanceId: ProviderInstanceId;
    generation: unknown;
    revision: ProviderInstanceConfig | undefined;
  } | null>(null);
  const validBeginIntent =
    beginIntent !== null &&
    connected &&
    canManage &&
    beginIntent.generation === connection.data?.generation &&
    beginIntent.revision === displayInstances[beginIntent.instanceId];
  useEffect(() => {
    if (beginIntent && !validBeginIntent) setBeginIntent(null);
  }, [beginIntent, validBeginIntent]);
  useEffect(() => {
    if (!open) setBeginIntent(null);
  }, [open]);
  const title = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) scroller.current?.scrollTo(0, 0);
  }, [open, selected]);
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1920px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1920px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    // Responsive detail portals can remove the focused heading. Recover inside
    // the existing modal after its children finish moving, without restarting it.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const popup = title.current?.closest('[role="dialog"]');
        if (popup && !popup.contains(document.activeElement)) {
          title.current?.focus({ preventScroll: true });
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, wide]);
  const lastDetail = useRef<string | null>(null);
  const previouslyOpen = useRef(false);
  useEffect(() => {
    const wasOpen = previouslyOpen.current;
    previouslyOpen.current = open;
    if (selected !== "all") {
      lastDetail.current = selected;
      return;
    }
    if (!wasOpen || !lastDetail.current || !open) return;
    // Let the dialog finish recovering focus from the removed detail portal first.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>(
            `[data-connection-instance="${CSS.escape(lastDetail.current ?? "")}"]`,
          )
          ?.focus({ preventScroll: true });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, open]);
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
    const row =
      rows.find((r) => r.provider.driver === driver && r.provider.enabled !== false) ??
      rows.find((r) => r.provider.driver === driver);
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
      environmentId={id}
      checking={checking}
      onDetails={() => {
        setBeginIntent(null);
        select(row.provider.instanceId);
      }}
      onAction={() => {
        if (row.status.primaryAction === "check") void check(row.provider.instanceId);
        else {
          setBeginIntent(
            row.status.primaryAction === "sign-in"
              ? {
                  instanceId: row.provider.instanceId,
                  generation: connection.data?.generation,
                  revision: displayInstances[row.provider.instanceId],
                }
              : null,
          );
          select(row.provider.instanceId);
        }
      }}
    />
  );
  const list = (
    <div className="space-y-4 p-5 md:p-6">
      {!rows.some((row) => row.provider.enabled !== false) ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No providers enabled on {environment.label}</EmptyTitle>
            <EmptyDescription>
              Enable a provider in Provider Settings to get started.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/settings/providers" search={{ environment: id }} />}
          >
            Open Provider Settings
          </Button>
        </Empty>
      ) : null}
      {primary.some(matches) ? (
        <h2 className="text-xs font-medium text-muted-foreground">Primary providers</h2>
      ) : null}
      {primary.filter(matches).map((r) => renderCard(r))}
      {others.some(matches) ? (
        <h2 className="pt-2 text-xs font-medium text-muted-foreground">Other providers</h2>
      ) : null}
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
          finalFocus={() => connectionsReturnFocus(origin)}
          initialFocus={() =>
            document.querySelector<HTMLElement>("[data-connection-attention]:not(:disabled)") ??
            title.current
          }
          aria-label="Provider Connections"
        >
          <SheetHeader className="border-b px-5 py-4 md:px-6">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-2">
                <SheetTitle ref={title} tabIndex={-1} className="text-lg outline-none">
                  Provider connections
                </SheetTitle>
                <SheetDescription className="sr-only">
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
          <div className="connections-scope space-y-2 border-b px-5 py-3 md:px-6">
            <label
              className="block text-xs font-medium text-muted-foreground"
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
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
                {!canManage ? <LockIcon aria-hidden className="size-3" /> : null}
                {canManage ? "Manage access" : "Read-only"}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${connected ? "bg-current" : "border border-current"}`}
                />
                {connected ? "Connected" : "Disconnected"}
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
              <div
                className={`border-b px-5 py-3 md:px-6 ${selected !== "all" && !wide ? "hidden" : ""}`}
              >
                <ToggleGroup
                  value={[filter]}
                  onValueChange={(value) => setFilter(value[0] ?? "all")}
                  className="grid w-full grid-cols-[repeat(4,minmax(max-content,1fr))] gap-1 overflow-x-auto"
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
                      className={`shrink-0 rounded-md px-2 py-2 text-xs focus-visible:outline-2 focus-visible:outline-ring ${filter === key ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                    >
                      {label} <span className="font-mono tabular-nums">{counts[key]}</span>
                    </Toggle>
                  ))}
                </ToggleGroup>
              </div>
              <p role="status" className="sr-only">
                {checkMessage}
              </p>
              <div
                ref={scroller}
                className={`connections-body min-h-0 flex-1 overflow-y-auto ${selected !== "all" ? "connections-detail-selected" : ""}`}
              >
                <div className="connections-list">{list}</div>
                <div ref={setDetailTarget} className="connections-detail">
                  {selected !== "all" &&
                  !providers.some((provider) => provider.instanceId === selected) ? (
                    <div className="space-y-3 p-6">
                      <h2 className="text-lg font-semibold">Instance unavailable</h2>
                      <p className="text-sm text-muted-foreground">
                        This provider instance no longer exists on {environment.label}.
                      </p>
                      <Button variant="outline" onClick={() => select()}>
                        Back to all providers
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1" />
          )}
          <SheetFooter className="flex-col! items-start! gap-2! px-5! md:px-6!">
            <p className="text-xs leading-relaxed text-foreground">
              Preflight checks never send a paid request. Entitlement and usage stay separate.
            </p>
            <Link
              to="/settings/providers"
              search={{ environment: id }}
              className="text-xs underline"
            >
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
              instance={displayInstances[row.provider.instanceId]}
              beginRequested={
                validBeginIntent && beginIntent?.instanceId === row.provider.instanceId
              }
              onBeginHandled={() => setBeginIntent(null)}
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
  modelLabel,
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
  beginRequested,
  onBeginHandled,
}: {
  provider: ServerProvider;
  modelLabel?: string | undefined;
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
  beginRequested: boolean;
  onBeginHandled: () => void;
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
          modelLabel={modelLabel}
          status={status}
          attempt={attempt}
          canOperate={canOperate}
          capability={capability}
          now={now}
          check={check}
          back={back}
          close={close}
          beginRequested={beginRequested}
          onBeginHandled={onBeginHandled}
        />,
        target,
      )
    : null;
}
