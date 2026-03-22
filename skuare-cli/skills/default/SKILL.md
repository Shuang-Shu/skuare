---
name: "__SKUARE_SKILL_NAME__"
metadata:
  version: "__SKUARE_APP_VERSION__"
  author: "__SKUARE_SKILL_AUTHOR__"
description: "Operate the current Skuare CLI end to end in the current workspace. Use when the task is to initialize `skr`/`skuare`, manage remote sources, inspect or install Skills/AGENTS.md, remove local installs, publish or migrate registries, or update local skill dependency files."
---

# __SKUARE_SKILL_NAME__

Use `skr` or `skuare` for complete Skuare CLI work in the current workspace.

## Workflow
1. Read `references/usage-guide.md` to identify the correct command family for the task.
2. Read `references/command-map.md` to choose the exact command form, flags, install scope, and resource type.
3. Re-read `references/skuare-workflow.md` before any operation that writes local files, removes installs, overwrites content, or changes a remote registry.
4. Prefer local inspection, config checks, and narrow reads before remote writes or migrations.
5. Report the exact commands used, install/write scope, changed files, and validation status.

## Reference Loading
- Read `references/usage-guide.md` for the full application usage flow: bootstrap, config, local skill authoring, remote queries, install/remove, AGENTS.md operations, remote source management, and migration.
- Read `references/command-map.md` when you need exact command selection, flag selection, or resource-type switching.
- Re-read `references/skuare-workflow.md` before risky operations such as overwrite, `get --wrap`, `deps --install`, `remove --deps`, `remote publish`, `remote update`, `remote delete`, or `remote migrate`.
