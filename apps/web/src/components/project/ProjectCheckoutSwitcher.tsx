import { useState } from "react";
import { CheckIcon, ChevronDownIcon, MonitorIcon, ServerIcon } from "lucide-react";
import { encodeProjectCheckout } from "../../projectNavigation";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

export function ProjectCheckoutSwitcher({
  group,
  checkout,
  onSelect,
}: {
  group: SidebarProjectSnapshot;
  checkout: string | undefined;
  onSelect: (checkout: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { environments } = useEnvironments();
  const primaryId = usePrimaryEnvironmentId();
  const selected = group.memberProjects.find(
    (member) =>
      encodeProjectCheckout({ environmentId: member.environmentId, projectId: member.id }) ===
      checkout,
  );
  const label = selected?.environmentLabel ?? selected?.environmentId;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="min-w-0 max-w-full"
            aria-label={
              selected
                ? `Select checkout. Current checkout ${selected.title} on ${label}`
                : "Select checkout"
            }
          />
        }
      >
        {selected?.environmentId === primaryId ? <MonitorIcon /> : <ServerIcon />}
        <span className="min-w-0 truncate">
          {selected ? `${label} · ${selected.title}` : "Select checkout"}
        </span>
        <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverPopup
        align="start"
        className="w-96 max-w-[calc(100vw-2rem)]"
        aria-label="Select physical checkout"
      >
        <p className="mb-1 text-sm font-medium">Select checkout</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Changes your view. To switch a Git branch, use the separate Git workflow. Nothing starts
          or stops here.
        </p>
        <div
          className="max-h-80 space-y-1 overflow-auto"
          role="group"
          aria-label="Physical checkouts"
        >
          {group.memberProjects.map((member) => {
            const value = encodeProjectCheckout({
              environmentId: member.environmentId,
              projectId: member.id,
            });
            const environment = environments.find(
              (entry) => entry.environmentId === member.environmentId,
            );
            const local = member.environmentId === primaryId;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={value === checkout}
                className="flex w-full min-w-0 items-start gap-2 rounded-md p-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setOpen(false);
                  onSelect(value);
                }}
              >
                {local ? (
                  <MonitorIcon className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <ServerIcon className="mt-0.5 size-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {member.environmentLabel ?? member.environmentId} ·{" "}
                    {local ? "Local host" : "Remote host"}
                  </span>
                  <span className="block truncate">
                    {member.title} · {member.id}
                  </span>
                  <span
                    className="block truncate font-mono text-xs text-muted-foreground"
                    dir="rtl"
                  >
                    {"\u200e" + member.workspaceRoot}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {environment?.connection.phase === "connected"
                      ? "Connected"
                      : (environment?.connection.phase ?? "Unavailable")}
                  </span>
                </span>
                {value === checkout ? (
                  <CheckIcon className="size-4 shrink-0" aria-label="Selected" />
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
