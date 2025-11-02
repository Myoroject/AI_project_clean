AI Document Search & Extraction

Product-ready, privacy-first document intelligence for internal teams.
Built to search, summarize, and query confidential documents without sending data to public AI services — ideal for BFSI and compliance-heavy environments.

✨ Key Features

Secure ingestion of PDFs/Docs (local storage; data never leaves your machine)

Text extraction + fast keyword & semantic search

Summaries of long documents (local pipeline; no external API calls)

Simple and clean Flask-based UI

PostgreSQL-backed metadata storage and auditability

Think of it as “Ctrl + F on steroids” — upload 2+ reports and instantly jump to sections relevant to cash flows, limits, sanction terms, or financial covenants.

🏗️ Architecture (High-Level)
[Upload UI] → [Flask API] → [Extractor (Local)] → [Embedding/Index] → [Search + Summaries] → [Results]
                                  │
                             [PostgreSQL]


Local file storage for raw docs & extracted text

Embeddings + Vector Index for semantic search

PostgreSQL for document metadata and auditability

💻 Tech Stack

Language: Python

Backend: Flask

Frontend: HTML + CSS

Database: PostgreSQL

Search: Embeddings + Local Vector Index

Storage: Local (privacy-first)

🚀 Getting Started (Run Locally)
1️⃣ Clone the Repository
git clone git@github.com:Myoroject/AI_project_clean.git
cd AI_project_clean

2️⃣ Setup Python Environment
python -m venv .venv
.\.venv\Scripts\Activate    # Windows
pip install -r app/requirements.txt

3️⃣ Configure Environment Variables

Create a .env file inside the app/ folder:

DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<db_name>
SECRET_KEY=change_me
# Optional:
# REDIS_URL=redis://localhost:6379/0

4️⃣ Initialize the Database

Example (if using psql):

psql -U postgres -c "CREATE DATABASE your_db_name"


Apply schema if you have SQL scripts or migrations.

5️⃣ Run the App
flask --app app/routes.py run --debug


Then open:
http://127.0.0.1:5000

🔒 Why Privacy-First?

This project was built to keep confidential financial documents (sanction letters, financials, positioning, PII) fully secure and inside the bank’s internal environment.

No document is ever sent to external AI services.
All summarization & search runs locally.

📘 Mini Case Study (PM Lens)

Context: At SBI Factors, end-to-end workflows — from Lead → Sanction → Disbursement — demand detailed document scrutiny.

Problem: BFSI teams cannot upload sensitive docs to public AI tools due to PII, compliance, and confidentiality constraints.

Hypothesis: A local, privacy-first AI document assistant can cut document review time significantly without compromising data security.

Approach: Started with the core pain point and built an MVP (Ingest → Extract → Search → Summarize) before expanding into Q&A and intelligence layers.

🗺️ Roadmap
✅ Current Capabilities

Local document ingestion, extraction, and text search

Summaries without external API usage

PostgreSQL-based metadata and tracking

Basic Web UI

🔜 Coming Soon

LLM-based Q&A (Llama) — local inference, compliant with BFSI restrictions

Better chunking & retrieval: hybrid search, semantic windows, and overlap tuning

Relevancy tuning and ranking

RBAC + Audit Logs for enterprise

Batch ingestion and async processing

Dockerized deployment + CI/CD

📂 Project Structure
AI_project_clean/
├─ app/
│  ├─ templates/        # UI Pages
│  ├─ static/           # CSS, Assets
│  ├─ routes.py         # Flask Routes
│  ├─ requirements.txt  # Python Dependencies
│  ├─ wsgi.py           # App Entrypoint
│  └─ ...
├─ ai_document.py
├─ ai_document_working.py
├─ db.py / db_test.py
├─ .gitignore
├─ .gitattributes
└─ README.md

👤 About the Author

James Nazareth — Product Manager with Technical Execution

A PM who builds.
I identify real workflow pain points, design feasible product solutions, and implement MVPs with hands-on technical execution.

Focus Areas:
AI for BFSI, privacy-first systems, internal automation tools, and intelligent document processing.

If you're reviewing this project: start with
ai_document.py, app/routes.py, and app/requirements.txt.

Feedback & collaborations welcome (with sanitized data only).
