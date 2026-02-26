---
name: report-generator
metadata:
  version: "0.0.1"
  author: "ShuangShu"
description: Build structured operational reports from normalized and validated datasets with clear summaries and drill-down sections.
---

# Report Generator

## Overview
Use this mid-layer skill to generate periodic reports from processed data while preserving validation context.

## Sections
- Executive Summary
- Data Quality Snapshot
- Key Metrics
- Exceptions and Anomalies

## Output Contract
- Return report markdown.
- Include data quality counters.
- Attach anomaly list with record identifiers.
