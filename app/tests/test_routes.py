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
