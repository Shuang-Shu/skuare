---
name: api-debugger
version: 1.0.0
description: Diagnose API integration failures by tracing request/response details, auth, and environment differences.
---

# API Debugger

## Overview
Use this skill to troubleshoot HTTP API issues such as 4xx/5xx errors, timeouts, schema mismatches, and auth failures.

## Triage Flow
1. Capture exact request (method, URL, headers, payload).
2. Capture exact response (status, headers, body).
3. Compare expected vs actual contract.
4. Isolate environment-specific differences.
5. Propose smallest reproducible fix.

## Common Root Causes
- Wrong base URL or path prefix.
- Missing/expired auth token.
- Content-Type mismatch.
- Clock skew affecting signatures.
- Unhandled null/optional fields.

## Suggested Artifacts
- Minimal curl reproduction.
- Sanitized request/response logs.
- Contract diff against API spec.

## Output Contract
- Probable root cause ranked by confidence.
- Reproduction command.
- Fix plan and validation checklist.

