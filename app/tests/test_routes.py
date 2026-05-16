import sys
from types import SimpleNamespace

import pytest

from app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_index_redirects_to_nextjs(client):
    resp = client.get("/")
    assert resp.status_code == 302
    assert resp.headers["Location"] == "http://localhost:3000"


def test_dashboard_stats_requires_authentication(client):
    response = client.get("/api/dashboard/stats")

    assert response.status_code == 401
    payload = response.get_json()
    assert payload["ok"] is False
    assert payload["error"] == "Authentication required."


def test_dashboard_stats_returns_aggregated_metrics(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.get_dashboard_stats",
        lambda email: {
            "document_count": 24,
            "pages_processed": 1840,
            "documents_this_week": 3,
            "pages_this_week": 340,
            "questions_asked": 142,
            "questions_this_week": 28,
        },
    )

    with client.session_transaction() as sess:
        sess["user_id"] = "user@example.com"

    response = client.get("/api/dashboard/stats")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload == {
        "ok": True,
        "stats": {
            "documents": 24,
            "questions_asked": 142,
            "pages_processed": 1840,
            "time_saved_display": "47h 20m",
        },
        "trends": {
            "documents_this_week": 3,
            "questions_this_week": 28,
            "pages_this_week": 340,
            "time_saved_this_week": "9h 20m",
        },
    }


def test_ask_returns_top_answer_but_preserves_ranked_results(client, monkeypatch):
    class FakeEvidence:
        def __init__(self, block_id, text, page_number, score, cosine_score, block_type):
            self.block_id = block_id
            self.text = text
            self.page_number = page_number
            self.score = score
            self.cosine_score = cosine_score
            self.block_type = block_type
            self.x1 = 1.0
            self.y1 = 2.0
            self.x2 = 3.0
            self.y2 = 4.0

        def to_dict(self):
            return {
                "block_id": self.block_id,
                "text": self.text,
                "page_number": self.page_number,
                "score": self.score,
                "cosine_score": self.cosine_score,
                "block_type": self.block_type,
                "bbox": [self.x1, self.y1, self.x2, self.y2],
            }

    evidence = [
        FakeEvidence("block-1", "Primary answer", 2, 0.98, 0.94, "paragraph"),
        FakeEvidence("block-2", "Secondary answer", 4, 0.91, 0.88, "table"),
    ]

    def fake_search(doc_id, query, top_k=4):
        assert doc_id == "doc-123"
        assert query == "What is the answer?"
        assert top_k == 4
        return evidence

    monkeypatch.setitem(sys.modules, "retrieval", SimpleNamespace(search=fake_search))
    monkeypatch.setattr("app.routes.insert_search_results", lambda doc_id, query, results: "search-xyz")
    monkeypatch.setattr(
        "app.routes.synthesize_answer",
        lambda query, evidence: {
            "answer": "Cited answer [1]",
            "answer_source": "groq:llama-3.3-70b-versatile",
            "llm_enabled": True,
            "llm_model": "llama-3.3-70b-versatile",
            "llm_available": True,
            "llm_error_code": None,
            "llm_fallback_reason": None,
        },
    )

    with client.session_transaction() as sess:
        sess["user_id"] = "user@example.com"
        sess["doc_id"] = "doc-123"

    resp = client.post(
        "/ask",
        json={"question": "What is the answer?", "doc_id": "doc-123"},
    )

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True
    assert payload["answer"] == "Cited answer [1]"
    assert payload["answer_source"] == "groq:llama-3.3-70b-versatile"
    assert payload["llm_enabled"] is True
    assert payload["llm_available"] is True
    assert payload["search_id"] == "search-xyz"
    assert len(payload["results"]) == 2
    assert payload["results"][0]["rank"] == 1
    assert payload["results"][1]["rank"] == 2
    assert payload["citations"][0]["block_id"] == "block-1"
    assert payload["citations"][1]["block_id"] == "block-2"


def test_upload_accepts_unauthenticated_demo_uploads(client, monkeypatch):
    captured = {}

    def fake_handle_text_upload(user_id, filename, text, pdf_bytes=None):
        captured["user_id"] = user_id
        captured["filename"] = filename
        captured["text"] = text
        return "demo-doc-1"

    monkeypatch.setattr("app.routes.handle_text_upload", fake_handle_text_upload)

    response = client.post(
        "/upload",
        data={"filename": "notes.txt", "text": "demo body"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["ok"] is True
    assert payload["doc_id"] == "demo-doc-1"
    assert captured["user_id"] is None
    assert captured["filename"] == "notes.txt"
    assert captured["text"] == "demo body"


def test_ask_allows_unauthenticated_demo_documents(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.get_document_record",
        lambda doc_id: {"doc_id": doc_id, "user_id": None, "filename": "Demo.pdf"},
    )
    monkeypatch.setitem(
        sys.modules,
        "retrieval",
        SimpleNamespace(search=lambda doc_id, query, top_k=4: []),
    )
    monkeypatch.setattr(
        "app.routes.synthesize_answer",
        lambda query, evidence: {
            "answer": "Demo answer",
            "answer_source": "fallback:test",
            "llm_enabled": False,
            "llm_model": None,
            "llm_available": False,
            "llm_error_code": None,
            "llm_fallback_reason": None,
        },
    )

    response = client.post(
        "/ask",
        json={"question": "What is this?", "doc_id": "demo-doc-2"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["ok"] is True
    assert payload["answer"] == "Demo answer"


def test_document_api_returns_metadata_for_unauthenticated_demo_documents(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.get_document_record",
        lambda doc_id: {
            "doc_id": doc_id,
            "user_id": None,
            "filename": "FY25-Report.pdf",
            "size_bytes": 2048,
            "status": "processing",
            "total_pages": 14,
        },
    )
    monkeypatch.setattr("app.routes.get_doc_text", lambda doc_id: "Document preview text")
    monkeypatch.setattr(
        "app.routes.get_document_asset_counts",
        lambda doc_id: {"table_count": 3, "chart_count": 2},
    )

    response = client.get("/api/document/demo-doc-3")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["ok"] is True
    assert payload["filename"] == "FY25-Report.pdf"
    assert payload["size"] == 2048
    assert payload["status"] == "processing"
    assert payload["total_pages"] == 14
    assert payload["table_count"] == 3
    assert payload["chart_count"] == 2


def test_document_summary_api_returns_generated_summary(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.get_document_record",
        lambda doc_id: {
            "doc_id": doc_id,
            "user_id": None,
            "filename": "TATA-FY23.pdf",
            "status": "ready",
            "total_pages": 18,
        },
    )
    monkeypatch.setattr(
        "app.routes.generate_document_summary",
        lambda doc_id, filename, total_pages: {
            "overview": "Financials of TATA for FY23 with major operating metrics and risks.",
            "overview_citations": [{"page": 2, "block_id": "block-1", "label": "Page 2"}],
            "bullets": [
                {"text": "Revenue and margin trends are highlighted early in the report.", "citations": [{"page": 2, "block_id": "block-1", "label": "Page 2"}]},
            ],
            "evidence": [],
        },
    )

    response = client.get("/api/document/demo-doc-4/summary")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["ok"] is True
    assert payload["status"] == "ready"
    assert "TATA" in payload["summary"]["overview"]
    assert payload["summary"]["bullets"][0]["citations"][0]["page"] == 2


def test_document_outline_api_returns_pages_tables_and_figures(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.get_document_record",
        lambda doc_id: {
            "doc_id": doc_id,
            "user_id": None,
            "filename": "Outline.pdf",
            "status": "ready",
            "total_pages": 2,
        },
    )

    block_one = SimpleNamespace(page_number=1, block_type="header", text="Executive Summary")
    block_two = SimpleNamespace(page_number=1, block_type="paragraph", text="Revenue expanded across key business lines.")
    block_three = SimpleNamespace(page_number=2, block_type="paragraph", text="Risk factors and balance sheet details.")
    monkeypatch.setattr("app.routes.get_blocks_for_document", lambda doc_id: [block_one, block_two, block_three])
    monkeypatch.setattr(
        "app.routes.get_document_tables_outline",
        lambda doc_id: [
            {"table_id": "table-1", "page_number": 1, "table_index": 1, "heading_text": "Income Statement", "caption_text": "", "row_count": 4, "column_count": 3, "raw_markdown": "| A | B |"},
        ],
    )
    monkeypatch.setattr(
        "app.routes.get_document_visuals_outline",
        lambda doc_id: [
            {"visual_id": "visual-1", "page_number": 2, "visual_index": 1, "block_type": "chart", "visual_summary": "Revenue trend chart", "ocr_text": "", "metadata": {}},
        ],
    )

    response = client.get("/api/document/demo-doc-5/outline")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["ok"] is True
    assert payload["pages"][0]["title"] == "Executive Summary"
    assert payload["pages"][0]["table_count"] == 1
    assert payload["pages"][1]["figure_count"] == 1
    assert payload["tables"][0]["title"] == "Income Statement"
    assert payload["figures"][0]["block_type"] == "chart"


def test_document_page_content_api_returns_blocks(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.get_document_record",
        lambda doc_id: {
            "doc_id": doc_id,
            "user_id": None,
            "filename": "Pages.pdf",
            "status": "ready",
            "total_pages": 3,
        },
    )
    monkeypatch.setattr(
        "app.routes.get_page_blocks",
        lambda doc_id, page_number: [
            {"block_id": "block-10", "text": "Revenue increased 12%.", "block_type": "paragraph"},
            {"block_id": "block-11", "text": "Operating margin improved.", "block_type": "paragraph"},
        ],
    )

    response = client.get("/api/document/demo-doc-6/page/2")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["ok"] is True
    assert payload["page_number"] == 2
    assert len(payload["blocks"]) == 2
    assert "Revenue increased" in payload["page_text"]
