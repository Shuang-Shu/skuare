---
name: observability-orchestrator
version: 1.0.0
description: Coordinate ingestion, reporting, and alert routing into a full observability workflow with end-to-end traceability.
---

# Observability Orchestrator

## Overview
Use this top-layer skill to run end-to-end operational observability: ingest data, generate reports, and route actionable alerts.

## End-to-End Flow
1. Trigger `api-ingest-pipeline` to collect and validate data.
2. Trigger `report-generator` to produce business and quality summaries.
3. Trigger `alert-router` to distribute urgent anomalies.
4. Aggregate execution trace and outcome summary.

## Output Contract
- Return orchestration summary (success, partial, failed).
- Return linked artifacts (ingestion summary, report path, alert decisions).
- Return follow-up actions for unresolved anomalies.
