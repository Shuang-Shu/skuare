---
name: alert-router
metadata:
  version: "1.0.0"
description: Route ingestion anomalies to downstream channels with severity policies, schedule windows, and deduplication controls.
---

# Alert Router

## Overview
Use this upper-layer skill to evaluate pipeline anomalies and route notifications based on severity and time policies.

## Routing Rules
- Map severity to channel and escalation path.
- Suppress duplicates within configurable windows.
- Respect maintenance windows and local time policies.

## Output Contract
- Return routed alert plan.
- Return suppressed alert summary.
- Include reason codes for each routing decision.
