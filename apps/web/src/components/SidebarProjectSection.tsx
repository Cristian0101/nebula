import { useAtomValue } from "@effect/atom-react";
import { allEnvironmentProjectIdentitiesKnownAtom } from "../state/shell";
import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  MonitorIcon,
  ServerIcon,
} from "lucide-react";
import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import {
  PROJECT_DESTINATIONS,
  encodeProjectCheckout,
  resolveProjectCheckout,
} from "../projectNavigation";
import { useThreadShells } from "../state/entities";
import { useUiStateStore } from "../uiStateStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useSidebar } from "./ui/sidebar";

export function SidebarProjectSection({ groups }: { groups: readonly SidebarProjectSnapshot[] }) {
  const navigate = useNavigate();
  const identitiesKnown = useAtomValue(allEnvironmentProjectIdentitiesKnownAtom);
  const params = useParams({ strict: false });
  const location = useLocation();
  const threads = useThreadShells();
  const last = useUiStateStore((state) => state.activeProjectNavigation);
  const remembered = useUiStateStore((state) => state.projectNavigationByKey);
  const expanded = useUiStateStore((state) => state.projectExpandedById);
  const setExpanded = useUiStateStore((state) => state.setProjectExpanded);
  const remember = useUiStateStore((state) => state.rememberProjectNavigation);
  const primaryId = usePrimaryEnvironmentId();
  const { isMobile, setOpenMobile } = useSidebar();
  const thread = threads.find(
    (candidate) =>
      candidate.id === params.threadId && candidate.environmentId === params.environmentId,
  );
  const draft = useComposerDraftStore((state) =>
    params.draftId ? state.getDraftSession(params.draftId as DraftId) : null,
  );
  const activeConversation = thread ?? draft;
  const threadGroup = activeConversation
    ? groups.find((group) =>
        group.memberProjects.some(
          (member) =>
            member.id === activeConversation.projectId &&
            member.environmentId === activeConversation.environmentId,
        ),
      )
    : null;
  const activeKey = params.projectKey ?? threadGroup?.projectKey ?? last?.projectKey;
  useEffect(() => {
    if (!activeConversation || !threadGroup) return;
    remember({
      projectKey: threadGroup.projectKey,
      checkout: encodeProjectCheckout({
        environmentId: activeConversation.environmentId,
        projectId: activeConversation.projectId,
      }),
      destination: remembered?.[threadGroup.projectKey]?.destination ?? "overview",
      lastResolvedCheckout: encodeProjectCheckout({
        environmentId: activeConversation.environmentId,
        projectId: activeConversation.projectId,
      }),
    });
  }, [remember, remembered, activeConversation, threadGroup]);
  const open = (
    group: SidebarProjectSnapshot,
    destination = remembered?.[group.projectKey]?.destination ?? "overview",
  ) => {
    const selected = resolveProjectCheckout({
      allowRepresentative: identitiesKnown,
      group,
      rememberedCheckout: remembered?.[group.projectKey]?.checkout,
    });
    const checkout =
      params.projectKey === group.projectKey && location.search.checkout !== undefined
        ? location.search.checkout
        : selected.checkout;
    const target = PROJECT_DESTINATIONS.find((entry) => entry.id === destination)!;
    if (isMobile) setOpenMobile(false);
    void navigate({
      to: target.to,
      params: { projectKey: group.projectKey },
      search: checkout !== undefined ? { checkout } : {},
    });
  };
  return (
    <section className="min-w-0 border-b border-sidebar-border px-2 py-2" aria-label="Projects">
      <h2 className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Projects
      </h2>
      <div
        className="max-h-[36dvh] space-y-1 overflow-y-auto"
        onKeyDown={(event) => {
          const heading =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>("[data-project-heading]")
              : null;
          if (!heading) return;
          const headings = [
            ...event.currentTarget.querySelectorAll<HTMLElement>("[data-project-heading]"),
          ];
          const index = headings.indexOf(heading);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            headings[
              (index + (event.key === "ArrowDown" ? 1 : headings.length - 1)) % headings.length
            ]
              ?.querySelector<HTMLButtonElement>("[data-project-title]")
              ?.focus();
          }
          if (
            (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
            activeKey !== undefined &&
            heading.dataset.projectHeading === activeKey
          ) {
            event.preventDefault();
            setExpanded(activeKey, event.key === "ArrowRight");
          }
        }}
      >
        {groups.map((group) => {
          const active = activeKey === group.projectKey;
          const show = active && expanded[group.projectKey] !== false;
          const checkout =
            active && params.projectKey
              ? location.search.checkout
              : remembered?.[group.projectKey]?.checkout;
          const selected = resolveProjectCheckout({
            allowRepresentative: identitiesKnown,
            group,
            ...(checkout !== undefined ? { explicitCheckout: checkout } : {}),
          });
          const labelId = `project-label-${encodeURIComponent(group.projectKey)}`;
          return (
            <div
              key={group.projectKey}
              className="min-w-0 rounded-md"
              data-active-project={active || undefined}
            >
              <div
                data-project-heading={group.projectKey}
                className={`flex min-w-0 items-center rounded-md ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
              >
                <button
                  type="button"
                  aria-expanded={show}
                  aria-label={`${show ? "Collapse" : "Expand"} ${group.displayName}`}
                  className="grid size-8 shrink-0 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11"
                  onClick={() => (active ? setExpanded(group.projectKey, !show) : open(group))}
                >
                  {show ? (
                    <ChevronDownIcon className="size-3.5" />
                  ) : (
                    <ChevronRightIcon className="size-3.5" />
                  )}
                </button>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        id={labelId}
                        data-project-title=""
                        className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md pr-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
                        onClick={() => open(group)}
                      />
                    }
                  >
                    <FolderIcon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-medium">{group.displayName}</span>
                    {group.environmentPresence !== "local-only" ? (
                      <ServerIcon className="size-3 shrink-0 text-muted-foreground" />
                    ) : null}
                  </TooltipTrigger>
                  <TooltipPopup side="right" className="max-w-80">
                    <div className="space-y-1">
                      <strong>{group.displayName}</strong>
                      {group.memberProjects.map((member) => (
                        <p key={`${member.environmentId}:${member.id}`} className="break-all">
                          {member.environmentLabel ?? member.environmentId} ·{" "}
                          {member.environmentId === primaryId ? "Local host" : "Remote host"}
                          <br />
                          {member.workspaceRoot}
                        </p>
                      ))}
                    </div>
                  </TooltipPopup>
                </Tooltip>
              </div>
              {active ? (
                <p className="ml-9 flex min-w-0 items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
                  {selected.member?.environmentId === primaryId ? (
                    <MonitorIcon className="size-3 shrink-0" />
                  ) : (
                    <ServerIcon className="size-3 shrink-0" />
                  )}
                  <span className="truncate">
                    {selected.member
                      ? `${selected.member.environmentLabel ?? selected.member.environmentId} · ${selected.member.title}`
                      : selected.reason}
                  </span>
                </p>
              ) : null}
              {show ? (
                <div
                  role="group"
                  aria-labelledby={labelId}
                  className="ml-7 border-l border-sidebar-border py-1 pl-2"
                >
                  {PROJECT_DESTINATIONS.map((entry) => {
                    const current =
                      params.projectKey === group.projectKey &&
                      (entry.id === "overview"
                        ? !/\/(terminal-center|command-deck|branches|settings)$/.test(
                            location.pathname,
                          )
                        : location.pathname.endsWith(entry.to.split("/").at(-1)!));
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        aria-current={current ? "page" : undefined}
                        className={`block min-h-8 w-full rounded-sm border-l-2 px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 ${current ? "border-primary bg-sidebar-accent text-sidebar-accent-foreground" : "border-transparent text-muted-foreground hover:bg-sidebar-accent"}`}
                        onClick={() => open(group, entry.id)}
                      >
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
