# Changes Log

## 30/3/2026

Summary: Added the first table-aware ingestion and retrieval foundation for DocMind, including async processing, structured table storage, unified embeddings, and executive summary artifacts for this implementation pass.

- Added queue-backed async processing and document status refresh in `app/upload_flow.py`, replacing the old one-off background embedding trigger with persisted jobs.
- Added raw PDF byte persistence helpers in `app/redis_client.py` so queued workers can reopen the original source file after upload.
- Added new table pipeline storage in `app/table_store.py`, including `document_tables`, page detection logs, extraction failure logs, unified `embeddings`, and processing job tables.
- Added page-level table detection, Camelot extraction, validation, markdown conversion, numeric normalization, provenance attachment, and row/full-table embedding generation in `app/table_pipeline.py`.
- Added the background worker loop in `app/processing_worker.py` to process `embed_blocks` and `extract_tables` jobs asynchronously.
- Updated app startup in `app/__init__.py` to start the document processing worker outside pytest runs.
- Reworked unified retrieval in `retrieval.py` so search can hydrate both standard text blocks and table results from the shared embeddings layer.
- Added and updated retrieval tests in `app/tests/test_retrieval.py` for unified embedding search and hydrated table-row results.
- Added new table-related dependencies in `app/requirements.txt` for Camelot and pandas support.
- Added executive summary report artifacts in `reports/table-aware-ingestion-executive-summary.html`, `reports/table-aware-ingestion-executive-summary.pdf`, and `reports/table-aware-ingestion-executive-summary.md`.

Notes:
- `/ask` still returns top retrieved evidence directly; Groq answer synthesis was intentionally left for a later step.
- Executable verification was partially blocked because the machine did not expose a working Python launcher and the checked-in virtual environment points to a missing interpreter.

## 31/3/2026

Summary: Tightened the table-aware pipeline after reviewing a real uploaded annual report, fixing embedding traceability, making table extraction a required job, and reducing the chance that coarse table blobs from `document_blocks` appear in semantic retrieval.

- Added explicit `block_id`, `table_id`, and `row_index` columns to the unified `embeddings` table in `app/table_store.py` so embeddings can be traced back directly to `document_blocks` and `document_tables`.
- Updated `insert_embeddings()` and `get_embedding_candidates()` in `app/table_store.py` to store and return the new linkage fields for downstream retrieval and debugging.
- Updated block embedding records in `app/processing_worker.py` to populate `block_id` explicitly for `document_block` embeddings.
- Added stronger filtering for table-like multiline numeric blobs in `app/processing_worker.py` so values like the annual-report page-5 income stack are less likely to leak into block retrieval as unstructured evidence.
- Updated table and row embedding records in `app/table_pipeline.py` to populate `table_id` and `row_index` explicitly for `document_table` and `document_table_row` embeddings.
- Updated retrieval hydration in `retrieval.py` to prefer explicit `block_id` and `table_id` linkage when reconstructing search results from the shared embeddings table.
- Marked `extract_tables` as a required job in `app/upload_flow.py` so missing table extraction is no longer treated as optional in `document_processing_jobs`.

Notes:
- The observed annual-report issue was reviewed against `C:\Users\JAMES\Downloads\Annual-Report-for-the-Financial-Year-2023-2024.pdf`.
- These fixes apply to new processing runs; already-ingested documents will need reprocessing or re-uploading to reflect the new schema and job behavior.

## 1/4/2026

Summary: Added the first selective image-understanding pipeline for PDFs, including async visual detection, OCR over detected image regions, heuristic chart summarization, separate visual storage, failure logging, and retrieval integration with the shared embeddings layer.

- Extended the shared schema in `app/table_store.py` with `document_visuals`, `visual_processing_failures`, and explicit `visual_id` linkage in `embeddings`.
- Added visual storage helpers in `app/table_store.py` for inserting, updating, deleting, and fetching visual records plus visual-specific failure logs.
- Added selective visual detection in `app/visual_pipeline.py` using PyMuPDF image regions, image-area thresholds, and low-text checks so only meaningful image-heavy regions are processed.
- Added OCR processing in `app/visual_pipeline.py` using region-based Tesseract extraction, normalized OCR lines, OCR confidence capture, and visual embeddings for OCR text and OCR lines.
- Added heuristic chart interpretation in `app/visual_pipeline.py` to generate a lightweight chart summary, chart type hint, axis labels, trend direction, and failure logging when semantic meaning cannot be inferred.
- Updated the async worker in `app/processing_worker.py` with new job types: `detect_visuals`, `process_visual_ocr`, and `process_chart_summary`.
- Updated upload orchestration in `app/upload_flow.py` so visual detection is queued in parallel with table extraction and block embeddings without blocking the upload path.
- Updated unified retrieval in `retrieval.py` so text blocks, tables, OCR-derived visuals, and chart summaries can be returned in one ranked result list.
- Added tests in `app/tests/test_retrieval.py` and `app/tests/test_visual_pipeline.py` for visual hydration and chart-summary heuristics.

Notes:
- For v1, the implementation chose local OCR with Tesseract plus heuristic chart summarization to keep processing asynchronous, selective, and dependency-light.
- Visual failures are logged per page/visual region in `visual_processing_failures` and do not mark the whole document as failed, which preserves partial document searchability.

## 3/4/2026

Summary: Added a thin Groq-backed answer-synthesis layer on top of the existing retrieval pipeline, with grounded citations, clarification handling, API-usage caps, and graceful fallback to the current raw-evidence behavior.

- Added `app/llm_service.py` as a provider-shaped answer layer that caps evidence before sending it to Groq, builds grounded prompts, asks clarification questions for ambiguous queries, and falls back to raw evidence when the LLM is disabled or unavailable.
- Kept retrieval untouched in `app/routes.py` while updating `/ask` to synthesize over retrieved evidence, return `answer_source` and machine-readable LLM metadata, and preserve the existing ranked `citations`, `results`, and `search_id` contract.
- Preserved the existing retrieval-exception path in `app/routes.py` by continuing to fall back to `naive_search_answer()` and labeling that path explicitly as `fallback:naive_search`.
- Added Groq configuration defaults to `.env.example` and local `.env`, including model, token, timeout, evidence-cap, and clarification-threshold controls.
- Added `groq` to `app/requirements.txt` for the official Groq Python SDK integration.
- Added `app/tests/test_llm_service.py` for synthesis, clarification, truncation, and provider-fallback coverage, plus updated `app/tests/test_routes.py` for the new `/ask` response metadata.

Notes:
- The default model is `llama-3.3-70b-versatile`, with env overrides left in place for future tuning.
- To avoid overusing the Groq free tier, this pass caps both the number of evidence blocks and the total evidence characters sent per request instead of increasing retrieval depth.
