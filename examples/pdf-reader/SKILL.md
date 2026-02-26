---
name: pdf-reader
metadata:
  version: "0.0.1"
  author: "ShuangShu"
description: Read and analyze PDF files, extract text by page range, and produce structured summaries with citations. Use when a user asks to read, summarize, compare, or QA against PDF documents, including long reports, papers, contracts, manuals, and scanned PDFs.
---


# PDF Reader

## Overview
Use this skill to read PDF content safely and reproducibly, then return concise answers with page-level evidence.

## Quick Workflow
1. Confirm target files and scope.
2. Extract text from the PDF (full file or page range).
3. Clean obvious noise (headers/footers, broken line wraps) without changing meaning.
4. Produce structured output with page citations.
5. If extraction quality is poor, switch to OCR-capable tooling and state limitations.

## Extraction Strategy
Use the fastest available method first, then fallback:

1. `pdftotext` (if installed) for quick extraction:
```bash
pdftotext -layout input.pdf -
```

2. Python `pypdf` for controlled page-by-page extraction:
```python
from pypdf import PdfReader
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages, start=1):
    text = page.extract_text() or ""
    print(f"\\n--- Page {i} ---\\n{text}")
```

3. If text is mostly empty, treat as scanned PDF and use OCR workflow (for example `ocrmypdf` + extraction), then clearly mark OCR uncertainty.

## Output Contract
Always return:
- `结论`: 直接回答用户问题。
- `依据`: 关键证据点，附页码（如 `p.12`）。
- `不确定性`: 缺失页、识别错误、扫描噪声等风险。
- `后续建议`: 仅在确有必要时给 1-2 条下一步。

## Long PDF Handling
- Read in chunks (for example 20-50 pages each pass).
- Keep a running note of entities, terms, and contradictions.
- When asked to compare sections, cite both page positions explicitly.
- Do not claim facts that cannot be located in extracted text.

## Safety and Quality
- Preserve meaning; do not "fix" numbers, dates, or legal terms without evidence.
- Keep quotations short and exact when required.
- If page numbering in document differs from PDF index, explain mapping explicitly.
