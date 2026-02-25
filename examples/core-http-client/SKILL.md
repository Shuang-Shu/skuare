---
name: core-http-client
metadata:
  version: "1.0.0"
description: Provide reusable HTTP request execution patterns including retries, timeout boundaries, and response sanity checks.
---

# Core HTTP Client

## Overview
Use this foundational skill for robust outbound HTTP request behavior used by ingestion and integration skills.

## Capabilities
- Execute HTTP requests with explicit method/header/body controls.
- Apply bounded retries and timeout policies.
- Surface structured status/body/error diagnostics.

## Output Contract
- Return request summary and response details.
- Distinguish timeout, connect, and server errors.
- Keep logs concise and reproducible.

