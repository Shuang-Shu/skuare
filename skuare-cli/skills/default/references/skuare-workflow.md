# Skuare Workflow

## Core Rules
- Work from the current workspace and treat local skill files as the source of truth before publish.
- Read before write. If local files already differ from the template or intended change, stop and explain the conflict.
- Prefer `skr` aliases in examples unless the full `skuare` form is clearer.
- Validate with the workspace's required checks before claiming completion.

## Local-First Order
1. Inspect current files with `skr detail`, shell reads, or direct file review.
2. Update local dependencies with `skr build` when dependency manifests must change.
3. Format or validate local content before remote operations.
4. Use `skr get` or `skr deps --install` only when local installation is required.
5. Use `skr publish`, `skr update`, or `skr delete` only after local content is ready.

## Write Operation Checklist
- Confirm target skill directory, `skill_id`, and intended version.
- Check whether the command writes to workspace scope or `--global`.
- For overwrite-sensitive installs, review the preview instead of assuming replacement is safe.
- After changes, state what was validated and what still requires user action.
