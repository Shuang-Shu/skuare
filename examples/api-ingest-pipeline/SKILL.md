---
name: api-ingest-pipeline
metadata:
  version: "1.0.0"
description: Fetch upstream API payloads, normalize records, validate schema, and output ingestion-ready batches.
---

# API Ingest Pipeline

## Overview
Use this mid-layer skill to orchestrate API pull -> normalize -> validate workflow as a single ingestion pipeline.

## Workflow
1. Pull paginated payloads from upstream API.
2. Normalize records to canonical schema.
3. Validate normalized records.
4. Emit accepted/rejected batches.

## Output Contract
- Return accepted batch.
- Return rejected records with reasons.
- Include source request metadata for traceability.
