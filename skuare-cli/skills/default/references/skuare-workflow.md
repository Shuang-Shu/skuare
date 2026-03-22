# Skuare Workflow

## Core Rules
- Work from the current workspace and treat local skill files as the source of truth before publish.
- Read before write. If local files already differ from the template or intended change, stop and explain the conflict.
- Prefer `skr` aliases in examples unless the full `skuare` form is clearer.
- Confirm whether the task targets Skill resources or AGENTS.md resources before choosing a command form.
- Decide whether the current command should use configured default source, `remote source`, or an explicit `--server`.
- Validate with the workspace's required checks before claiming completion.

## End-To-End Order
1. Bootstrap the workspace with `skr init`, `skr config`, and `skr skill` when configuration or starter files are missing.
2. Inspect current local state with `skr detail`, file reads, or direct workspace review.
3. Update local dependency files with `skr build` and normalize skill metadata with `skr format` before remote writes.
4. Use `skr list`, `skr peek`, `skr get`, `skr deps`, and `skr remove` for read/install/remove workflows.
5. Use `skr remote source ...` or `--server` to point at the correct registry before remote writes.
6. Use `skr remote publish`, `skr remote update`, `skr remote delete`, or `skr remote migrate` only after local content and target source are confirmed.

## Local Install And Remove Checklist
- Confirm whether the target path is workspace-local or `--global`.
- For `get`, `deps --install`, and `remove --deps`, review overwrite or shared-dependency prompts instead of assuming replacements are safe.
- Prefer `get --wrap` when the root Skill is large and only part of the dependency tree is needed immediately.
- If the task is AGENTS.md-related, switch to `--type agentsmd|agmd` instead of using Skill commands against the wrong resource type.

## Remote Write Checklist
- Confirm target source: named source, default source, or explicit `--server`.
- Confirm resource type, skill directory or AGENTS.md path, resource ID, and intended version.
- For `remote update`, confirm the local directory is the intended publish source because it will rewrite `metadata.version`.
- For `remote migrate`, confirm source and destination order first; use `--dry-run` before a real migration when the destination is not already proven safe.
- After changes, state the exact command, changed files or registry resources, validation performed, and any remaining user action.
