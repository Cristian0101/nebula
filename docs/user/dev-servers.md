# Run a workspace Dev Server

Dev Server profiles are explicit, local approvals. Open **Project settings → Dev Servers** and provide:

- a profile name;
- the exact one-line command to execute;
- `.` or a project-relative working directory;
- an optional preferred port;
- an optional preview URL.

Nebula does not execute package scripts it merely discovers. Saving the profile records your approval; starting it later executes exactly that command in a dedicated terminal.

For a current-checkout Thread, the working directory is resolved beneath the Project root. For an isolated Task-backed Thread, the same relative directory is resolved beneath that Task worktree. Absolute paths and parent traversal are rejected. Starting an approved profile on Global Terminal Center is optional; isolated worktree servers must be launched from Project Terminal Center so ownership is explicit.

The inspector provides **Start**, **Stop**, **Restart**, **Preview**, and **Logs**. Status comes from live terminal metadata, so an app restart cannot preserve a stale Running badge. Hiding a node, finishing a provider turn, or changing layouts does not stop the server. Stop is always explicit. Nebula also blocks another Nebula-managed profile on the same environment when it is already using the preferred port.
