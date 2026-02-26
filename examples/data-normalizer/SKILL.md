---
name: data-normalizer
metadata:
  version: "0.0.1"
  author: "ShuangShu"
description: Normalize mixed-source records into canonical field shapes before validation, indexing, and downstream processing.
---

# Data Normalizer

## Overview
Use this skill to map heterogeneous payloads into a canonical schema and normalized value space.

## Inputs
- Raw records from APIs/files/streams.
- Field mapping rules and default values.

## Processing
- Normalize text and timestamps through dependency primitives.
- Coerce simple scalar types where safe.
- Track dropped and transformed fields.

## Output Contract
- Return normalized records.
- Include field-level transformation summary.
- Flag lossy transformations explicitly.
