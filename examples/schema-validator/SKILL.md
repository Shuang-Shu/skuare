---
name: schema-validator
metadata:
  version: "1.0.0"
description: Validate records against target schema contracts and emit actionable validation diagnostics for repair flows.
---

# Schema Validator

## Overview
Use this skill to enforce schema constraints and produce machine-friendly validation reports.

## Validation Scope
- Required field presence.
- Type expectations.
- Enum/range/pattern constraints.

## Output Contract
- Return pass/fail summary.
- Return per-record violations.
- Group failures by error category for quick triage.
