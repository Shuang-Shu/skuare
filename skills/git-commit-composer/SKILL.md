---
name: git-commit-composer
description: Summarize git diff changes, craft accurate commit messages, and execute a safe commit workflow.
---

# git-commit-composer

## Overview
Use this skill to turn raw git changes into a high-quality commit in one flow:
1) describe diff,
2) generate commit message,
3) create commit.

## Inputs Needed
- Target branch and task context.
- Current changes (`git status`, `git diff`, `git diff --staged`).
- Optional commit style preference (free-form or Conventional Commits).

## Workflow
1. Inspect working tree.
- Run `git status --short` to list changed files.
- If nothing is staged, inspect `git diff`; if staged exists, prioritize `git diff --staged`.

2. Build a diff summary.
- Summarize what changed, why it changed, and user-visible impact.
- Call out risk points: breaking behavior, config changes, migrations, test impact.

3. Prepare commit scope.
- Stage only relevant files (`git add <files>`).
- Re-check staged diff with `git diff --staged` to avoid unrelated changes.

4. Draft commit message.
- Subject line: imperative mood, <= 72 chars.
- Body (optional): why, what, and risk/compatibility notes.
- When requested, use Conventional Commits format: `<type>(<scope>): <subject>`.

5. Execute commit.
- Run `git commit -m "<subject>"`.
- If body is needed, use multiple `-m` flags.
- Return commit hash and final message.

## Safety Rules
- Never include unrelated files in staged set.
- Never use destructive git commands (`reset --hard`, `checkout --`, etc.) unless explicitly requested.
- If diff contains mixed concerns, split into multiple commits and messages.

## Output Contract
- Diff Summary: concise explanation of functional change.
- Proposed Commit Message:
  - Subject
  - Body (if needed)
- Commit Result:
  - Executed command
  - Commit hash
  - Included file list

