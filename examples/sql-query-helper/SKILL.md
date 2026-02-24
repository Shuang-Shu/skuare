---
name: sql-query-helper
version: 1.0.0
description: Help users design, optimize, and verify SQL queries with clear assumptions and safe defaults.
---

# SQL Query Helper

## Overview
Use this skill when the user needs help writing SQL for analytics, reporting, debugging, or performance tuning.

## Input Checklist
- Clarify SQL dialect (PostgreSQL, MySQL, SQLite, BigQuery).
- Confirm table names and key columns.
- Confirm expected output shape and row limits.
- Ask for sample rows when schema is unclear.

## Query Strategy
- Start from a minimal working query.
- Add filters and joins incrementally.
- Prefer explicit join conditions and selected columns.
- Use CTEs for readability when logic is multi-step.

## Optimization Notes
- Check indexes on filter and join keys.
- Avoid `SELECT *` in large tables.
- Push predicates early.
- Validate execution plans before and after changes.

## Output Contract
- Return final SQL.
- Explain assumptions and edge cases.
- Include a quick verification query when relevant.

