# Shared Resources

Architect can reference only enabled Shared Resources already configured for the Project. A suggested missing policy is shown as a resource-policy gap; Architect never creates resources or acquires leases. Runtime lease enforcement remains authoritative when a Task later starts.

Shared Resources let a Project name repository paths that should have only one active Task editor at a
time. Examples include `package.json` plus a lockfile, migration directories, generated schemas, or a
shared contract surface. Each definition has a name, optional description, one or more safe
repository-relative glob patterns, an enabled state, and the exclusive mode.

## Requirements and leases

A Task explicitly lists the resources it requires. On start, the server atomically acquires all of
them. If any enabled resource is held by another Task, no lease is acquired and Nebula identifies the
holder. Leases remain held across restart while their Task remains active. Completion and cancellation
release them; startup records releases for stale held leases owned by terminal Tasks.

Mission dependency readiness and resource readiness are separate. Releasing a lease makes a waiting
Task resource-ready, but a human must still start it. Nebula does not automatically schedule, retry, or
advance waves.

## Compliance and ownership requests

Nebula evaluates the Task's actual Git change set against every enabled Shared Resource. Editing a
matching path without that Task's held lease is a resource violation even when ordinary ownership
allows the path. A fresh valid result is required before review or completion.

When a Builder needs another path, a human can create an ownership expansion request or create one
from a violation. Requests record the exact proposed rules, reason, source, timestamps, and approve,
deny, or cancel outcome. Approval expands canonical ownership. If the path intersects a Shared
Resource, the UI separately offers to add the requirement; approval never grants a lease by itself.

## Limits

Definitions, exclusive Task leases, Mission blocking, compliance, and human-approved requests are
implemented. Provider-generated requests, automatic resource scheduling, automatic wave advancement,
Architect planning, automatic Mission decomposition, provider routing, distributed locks, and Swarm
Mode are not implemented.
