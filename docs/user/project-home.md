# Project Home

Open a Project's **Overview** to see what needs a decision, resume existing work, inspect
live activity, or prepare a new draft. Overview uses the selected physical Project on its
selected execution environment. Projects with the same name or branch on different hosts
remain separate. The checkout chooser changes navigation only.

## Execution context

The context block describes the Project checkout itself, including its canonical path,
branch, HEAD, dirty state and worktree identity when the host supplies them. It never
borrows a Thread's checkout. Git inspection is local and read-only. Freshness and partial
observations remain visible; the inventory is not execution permission or switch approval.

An invalid explicit checkout stays unavailable. Offline hosts retain cached Project
activity and an explanation that work may still be running. Creating a draft requires a
connected host, orchestration permission and valid checkout evidence when supported.
Unknown Git facts are not displayed as clean or idle. Tasks and Missions require Git context.

## Needs you and Resume

Needs you derives attention from canonical Thread flags, Task attention, current review
outcomes, Architect proposals, Mission checkpoints/coordination/run attention, Integration
conflicts and fresh relevant provider blockers. Decisions come first, then failures,
reviews and access. Working sessions and stale provider readiness are not blockers.
Known shared Task/Thread/Mission causes appear once; independent or unknown causes remain
visible. Four items show initially; **Show all** expands the list. Each row opens the
existing authorized surface. Overview never approves or rejects work inline.

Resume has **All**, **Threads**, **Tasks** and **Missions** filters, remembered separately
for each physical Project/environment. All shows an associated Thread once rather than
also listing its Task. Tasks shows the Task itself. Archived and effectively settled
Threads are excluded; snoozed Threads appear only in Threads, with their wake label.
Completed/cancelled Tasks and Missions are excluded. Eight rows show initially, with
in-place expansion for the remainder. Canonical identities and recorded workspace facts
remain available in the rows; opening them only navigates.

Task deep links retain `selectedTask` in ordinary Command Deck mode. Selecting a Task
updates history, so Back/Forward restores that selection. An unknown Task ID does not
select another Task. Integration attention opens the existing Integration section.

## Live activity and permissions

Live now uses canonical Thread session/turn projections, distinguishing starting, working,
waiting and idle sessions. Disconnected activity is explicitly unknown. Saved provider
roles and configured accounts do not create live agent rows. These projections do not
certify that an OS process is alive.

Terminal counts and service discovery use existing APIs only when the current credential
has terminal permission. A missing scope shows an explanation instead of protected data.
The read-only Project inventory does not provide terminal access.

A managed service requires an approved Dev Server profile, its scoped Workbench pane,
a running associated terminal and a linked discovered listener. An external listener at
an explicitly configured scoped Preview target remains **Discovered external server**;
it gains no lifecycle authority. Explicit external attachments show **Attached Preview**.
Absent/replaced listeners show unavailable/stale. Other listeners cannot be assigned to a
Project from a matching port alone; discover and attach them through Workbench.

Service actions open the owning Workbench layout, where existing Preview, Attach, Browser
and Logs controls retain their permissions. Home introduces no Stop/Restart control.
Opening Workbench preserves workspace/pane/terminal identities and running processes.
Closing Preview does not stop a server. The existing explicit terminal close flow still
confirms that it stops the process and clears history; Home does not invoke it.

## Starting work

The launch field opens the existing Chat composer through a local draft on the selected
physical Project root. It explicitly retains the current checkout and never changes Git
or starts an agent turn. Provider preflight is informational; the real composer remains
the final execution boundary. Stale readiness is neither verified usability nor proof of
failure.

**New Task** opens existing Task creation with Title and Objective prefilled. **Plan a
Mission** opens the existing Swarm brief. Both reuse `composerDraftStore`: the route
contains only an opaque `workDraft` ID. Prompt text is not put in URLs or another store.
The destination verifies the draft's environment, Project and root-checkout binding before
reading it. The original composer draft remains recoverable. Nothing is executed or sent
to a paid provider by these handoffs.

The empty Project hero offers starter ideas that only fill the launch field, plus the
existing Workbench, Swarm and Quick thread entry points. Active Projects show operational
cards instead of the hero.

## Keyboard and boundaries

Attention and Resume rows support Tab/Enter and Up/Down. Resume filters form a radio group
with Left/Right and Home/End. Returning from a Home row restores focus when that row is
still available. Status is text as well as color; each section has a semantic heading.
Below 768px the launch bar stays in the content flow so enlarged text cannot cover attention
rows. Desktop retains the docked bar and reserves its measured height when scrolling
focused controls into view. Independent card failures retain the other sections
and offer retry. Delayed queries expose
a loading explanation and retry. Real macOS VoiceOver and founder/design acceptance remain
separate from automated DOM, keyboard, responsive and Electron checks.

Provider recovery uses environment-scoped Provider Settings at this dependency base; E3
Provider Connections is not imported. Branches/Worktrees management, Git coordination,
Notes and Ion migration remain separate milestones. No deployment, integration merge,
Git mutation, provider stop, process termination or paid inference belongs to Home.
