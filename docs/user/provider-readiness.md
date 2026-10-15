# Provider readiness and execution context

Expand a provider in **Settings → Providers** to inspect separate facts about its registered driver, executable, authentication, account identity, subscription entitlement, model catalog, and runtime preflight. These facts belong to one provider instance in one environment. They do not grant execution permissions.

**Verified**, **Unavailable**, and **Not verified** describe each fact independently. A completed check expires after five minutes; cached startup data, pending checks, disconnected environments, and older servers without verification metadata remain unverified. Use **Check again** to refresh. A disabled provider may still be installed, but cannot start new Nebula sessions.

Billing is reported as **provider subscription**, **API key / API billing**, **other provider-managed billing**, or **not reported**. Nebula uses structured provider probe evidence, never a display label to guess the route. Codex, Claude, and Cursor report different evidence. A reported subscription route does not establish entitlement, remaining usage, or whether a particular turn is included. Current probes leave subscription entitlement unknown. Grok and other adapters without structured billing evidence remain unknown.

Only a successfully queried provider catalog can verify a selected/default model. Static catalogs and custom model IDs remain unverified. Passing runtime preflight is not proof of a completed turn. Provider authentication and credentials remain owned by the provider; this milestone adds no login or OAuth flow.

In an existing Chat, **Show execution context** displays the environment, project, canonical conversation, repository identity when recorded, current and recorded branches, workspace/worktree, bound Task, live provider session, and permissions. It warns when Git, Task, or live session context differs. A repository or session that is not reported stays unknown. Refresh this read-only view to inspect current state; execution still applies its existing authorization, Task isolation, approval, and review checks.

The context query accepts a canonical thread ID only. The server resolves paths from existing project/Task/thread records and reads local Git status. This display cannot retarget execution or authorize a frontend path. Older servers without the context capability show an explicit unavailable message.

Opening an existing canonical Chat in another supported view preserves that conversation. Opening a provider CLI terminal creates a **separate session**, even when its directory or canvas pane is linked to Chat. The UI does not promise Terminal resume. A recorded Chat continuation means only that the existing adapter retained continuation data; it does not prove that a later resume will succeed. Raw continuation data is never included in this display response.
