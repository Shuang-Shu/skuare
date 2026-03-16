---
name: "__SKUARE_SKILL_NAME__"
metadata:
  version: "__SKUARE_APP_VERSION__"
  author: "__SKUARE_SKILL_AUTHOR__"
description: "Operate Skuare CLI workflows in the current workspace. Use when the task is to inspect local skills, build dependency files, install remote skills, inspect wrapped dependencies, or publish/update/delete skills with `skr` or `skuare`."
---

# __SKUARE_SKILL_NAME__

Use `skr` or `skuare` for Skuare skill work in the current workspace.

## Workflow
1. Read `references/skuare-workflow.md` before editing local skill files or running write commands.
2. Use the smallest command that completes the task. Prefer local inspection and formatting before remote writes.
3. Report the exact command path used, changed files, and validation status.

## Reference Loading
- Read `references/command-map.md` when you need command selection, install scope, or publish/update behavior.
- Re-read `references/skuare-workflow.md` before risky operations such as overwrite, publish, update, delete, or dependency installs.
