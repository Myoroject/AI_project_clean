# DocuMind — Product Brief

## What Are We Building

**DocuMind** is an **Analytical Document Search Engine Platform** — a search-intelligent system that doesn't just locate information buried inside documents, but *educates the user* so they extract maximum value from every page, chart, and data point.

### The Core Promise

Most document search tools tell you **where** something is. DocuMind tells you **what it means**.

- **For charts and visuals** → DocuMind doesn't just point to a chart on page 7. It tells the user what the chart *is saying* — the trend direction, the inflection points, the story behind the data.
- **For tables and numbers** → A dedicated **Mathematical Agent** examines the numbers, the spacing, the column relationships, and *makes sense of it*. It interprets percentage changes, spots anomalies, and provides context — not just raw digits.
- **For text and paragraphs** → Geometry-aware semantic search pinpoints the *exact block of text* relevant to the user's question, with bounding box coordinates for citation.

### The User Experience

A user uploads a document (PDF, DOCX, image, or text file). The platform:

1. **Extracts** full text with geometry-aware block-level precision (bounding boxes, page positions, block types).
2. **Chunks** the content semantically using NLP (spaCy sentence boundaries + overlapping windows).
3. **Embeds** each block using a local BGE-small-en-v1.5 model (384-dimensional vectors, cosine-ready).
4. **Indexes** the embeddings in a FAISS HNSW vector store for sub-40ms ANN retrieval.
5. **Reranks** results using deterministic geometry-based scoring (block type priority, page position, block area).
6. **Presents** evidence-first answers — showing the user the exact source text, page number, and block type.

> **The LLM is for explanation, not for retrieval.** Evidence is found deterministically. The LLM only wraps it in natural language. This makes the system explainable, auditable, and trustworthy.

---

## Why We Are Building This

### The Origin Story — SBI Systems

This project was born from real-world frustration experienced during work at **SBI (State Bank of India)**, specifically across three enterprise systems:

| System | Full Name | Purpose |
|--------|-----------|---------|
| **LOS** | Loan Origination System | Client onboarding, proposal creation |
| **LMS** | Loan Management System | Invoice booking, disbursement, remittance |
| **ERP** | Enterprise Resource Planning | Accounting, financial reporting |

### The Problem Observed

Across all three systems, whenever the finance company had to make a **key decision** — approving a loan, scheduling a disbursement, reconciling accounts — someone had to **manually dig through stacks of important documents**.

- **Hours wasted** sifting through paperwork to find a single data point.
- **Cognitive overload** — people felt they weren't getting to their *other* important work.
- **Human error risk** — fatigue from repetitive document searches led to missed information.
- **No institutional memory** — the same document would be searched multiple times by different people for the same question.

### The Insight

> *"If I can build something that is engaging and simple to use, people can quickly pinpoint exactly the information they need — and get back to the work that actually matters."*

### The Design Philosophy

1. **Engaging, not boring** — The UI is dark, modern, premium. It should feel like a tool you *want* to use, not one you're forced to.
2. **Simple, not simplistic** — Upload a document, ask a question, get an answer with evidence. No training required.
3. **Intelligent, not magical** — Every answer cites its source. Users can verify. The system is transparent.
4. **Free, not cheap** — We use local LLMs (no API costs) and open-source models. The product is free because the mission is to democratize document intelligence.

---

## Who Is This For

### Primary Users
- **Financial analysts** who review loan applications, credit reports, and financial statements daily.
- **Operations teams** who need to find specific clauses, amounts, or dates inside compliance documents.
- **Decision makers** who need quick summaries of key metrics without reading 50-page reports.

### Secondary Users
- **Researchers** who need to extract and compare data across multiple academic papers.
- **Legal professionals** who search contracts and regulatory filings for specific terms.
- **Anyone** who has ever wished they could "just ask a question" about a PDF.

---

## Mission & Vision

### Mission
Eliminate the time and cognitive burden of manually searching through documents by providing an analytical search engine that understands document structure, interprets data, and presents evidence-backed answers.

### Vision
A world where every professional has an AI-powered reading assistant — free, local, private, and intelligent — that turns document *reading* into document *understanding*.

---

## Key Differentiators

| Feature | Traditional Search | DocuMind |
|---------|-------------------|----------|
| Search method | Keyword matching | Semantic + geometry-aware search |
| Result format | "Found on page 7" | Exact text block with page, type, and bounding box |
| Chart understanding | None | Mathematical agent interprets trends and values |
| Table understanding | None | Numeric density analysis + structural parsing |
| Data privacy | Cloud-dependent | Fully local — no API calls, no data leaves your machine |
| Cost | API fees per query | Free — local LLMs and open-source models |
| Explainability | Black box | Evidence-first: every answer cites its source |

---

## Core Principles (Non-Negotiable)

1. **Evidence First** — Never generate an answer without showing the source text.
2. **Geometry Matters** — Use bounding boxes and page position as first-class signals, not just text content.
3. **Deterministic Retrieval** — Vector search + deterministic reranking. No randomness in the pipeline.
4. **Local Everything** — BGE embeddings run locally. FAISS runs locally. No cloud dependencies for core search.
5. **Sub-3 Second Upload** — The user should see their document ready within 3 seconds of upload (embedding is deferred to background).
6. **Transparent Architecture** — Every component is auditable. No hidden magic.
