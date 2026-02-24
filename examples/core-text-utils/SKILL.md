---
name: core-text-utils
version: 1.0.0
description: Provide low-level text normalization, token cleanup, and content slicing primitives for upper-layer skills.
---

# Core Text Utils

## Overview
Use this foundational skill for deterministic text cleanup and chunking behaviors shared by higher-level pipelines.

## Capabilities
- Normalize whitespace and punctuation.
- Strip obvious boilerplate markers.
- Split long text into stable chunks by size and boundary.

## Output Contract
- Return cleaned text blocks.
- Preserve semantic meaning.
- Provide deterministic chunk order.

