---
name: core-time-utils
metadata:
  version: "1.0.0"
description: Provide time parsing, timezone normalization, and timestamp window calculations for event-oriented workflows.
---

# Core Time Utils

## Overview
Use this foundational skill for consistent timestamp parsing and interval calculations across dependent workflows.

## Capabilities
- Parse mixed datetime formats.
- Normalize timezone offsets to canonical UTC representation.
- Compute rolling windows and boundary-aligned buckets.

## Output Contract
- Return normalized timestamps.
- Return computed ranges with explicit timezone assumptions.
- Avoid ambiguous date arithmetic.

