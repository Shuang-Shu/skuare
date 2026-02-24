---
name: release-note-writer
version: 1.0.0
description: Turn raw commits and PR notes into concise, user-facing release notes by audience and impact.
---

# Release Note Writer

## Overview
Use this skill to convert engineering change logs into release notes for end users, operators, and developers.

## Inputs Needed
- Change list (PR titles, commit messages, ticket links).
- Target audience (users, admins, developers).
- Version and release date.
- Breaking changes and migration steps.

## Writing Rules
- Group by impact, not by internal team.
- Keep bullets concrete and action-oriented.
- Call out breaking changes early.
- Avoid internal-only jargon where possible.

## Sections Template
- Highlights
- Improvements
- Fixes
- Breaking Changes
- Upgrade Notes

## Output Contract
- A short summary paragraph.
- Structured bullets by section.
- Clear migration/rollback guidance if needed.

