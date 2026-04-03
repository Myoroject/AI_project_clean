import importlib
import sys
from dataclasses import dataclass
from types import SimpleNamespace


def test_search_passes_full_query_vector_to_unified_embeddings(monkeypatch):
    captured = {}

    @dataclass
    class FakeBlock:
        block_id: str
        doc_id: str
        page_number: int
        text: str
        x1: float
        y1: float
        x2: float
        y2: float
        cx: float
        cy: float
        width: float
        height: float
        block_type: str
        parent_block_id: str | None = None
        created_at: str | None = None

    def fake_embed_query(query):
        assert query == "Find the best block"
        return [0.11, 0.22, 0.33]

    def fake_get_embedding_candidates(doc_id, query_emb, k):
        captured["doc_id"] = doc_id
        captured["query_emb"] = query_emb
        captured["k"] = k
        return [
            {
                "entity_type": "document_block",
                "entity_id": "block-1",
                "parent_entity_id": None,
                "page_number": 1,
                "block_type": "paragraph",
                "content_text": "Best match",
                "metadata": {},
                "cosine_sim": 0.93,
            }
        ]

    def fake_get_top_k_blocks(doc_id, block_ids, k=1):
        return [
            FakeBlock(
                block_id="block-1",
                doc_id=doc_id,
                page_number=1,
                text="Best match",
                x1=0.0,
                y1=100.0,
                x2=200.0,
                y2=200.0,
                cx=100.0,
                cy=150.0,
                width=200.0,
                height=100.0,
                block_type="paragraph",
            )
        ]

    monkeypatch.setitem(sys.modules, "embedding_service", SimpleNamespace(embed_query=fake_embed_query))
    monkeypatch.setitem(sys.modules, "block_extractor", SimpleNamespace(get_top_k_blocks=fake_get_top_k_blocks))
    monkeypatch.setitem(
        sys.modules,
        "app.table_store",
        SimpleNamespace(
            get_embedding_candidates=fake_get_embedding_candidates,
            get_document_table=lambda table_id: None,
            get_document_visual=lambda visual_id: None,
        ),
    )

    if "retrieval" in sys.modules:
        del sys.modules["retrieval"]

    retrieval = importlib.import_module("retrieval")
    results = retrieval.search("doc-123", "Find the best block", top_k=2)

    assert captured["doc_id"] == "doc-123"
    assert captured["query_emb"] == [0.11, 0.22, 0.33]
    assert captured["k"] == 10
    assert len(results) == 1
    assert results[0].text == "Best match"
    assert results[0].block_type == "paragraph"


def test_search_hydrates_table_row_candidate_to_full_table(monkeypatch):
    def fake_embed_query(query):
        assert query == "What is revenue in 2025?"
        return [0.4, 0.5, 0.6]

    def fake_get_embedding_candidates(doc_id, query_emb, k):
        return [
            {
                "entity_type": "document_table_row",
                "entity_id": "table-1:row:1",
                "parent_entity_id": "table-1",
                "page_number": 7,
                "block_type": "table",
                "content_text": "row match",
                "metadata": {"row_text": "| Revenue | 2000 | 3000 |"},
                "cosine_sim": 0.97,
            }
        ]

    def fake_get_document_table(table_id):
        assert table_id == "table-1"
        return {
            "table_id": "table-1",
            "page_number": 7,
            "caption_text": "Financial Overview",
            "heading_text": "Statement of Operations",
            "raw_markdown": "| Metric | 2024 | 2025 |\n| --- | --- | --- |\n| Revenue | 2000 | 3000 |",
            "bbox_x1": 10.0,
            "bbox_y1": 120.0,
            "bbox_x2": 300.0,
            "bbox_y2": 260.0,
        }

    monkeypatch.setitem(sys.modules, "embedding_service", SimpleNamespace(embed_query=fake_embed_query))
    monkeypatch.setitem(sys.modules, "block_extractor", SimpleNamespace(get_top_k_blocks=lambda *args, **kwargs: []))
    monkeypatch.setitem(
        sys.modules,
        "app.table_store",
        SimpleNamespace(
            get_embedding_candidates=fake_get_embedding_candidates,
            get_document_table=fake_get_document_table,
            get_document_visual=lambda visual_id: None,
        ),
    )

    if "retrieval" in sys.modules:
        del sys.modules["retrieval"]

    retrieval = importlib.import_module("retrieval")
    results = retrieval.search("doc-789", "What is revenue in 2025?", top_k=3)

    assert len(results) == 1
    assert results[0].block_id == "table-1"
    assert results[0].block_type == "table"
    assert "Highlighted row" in results[0].text
    assert "Financial Overview" in results[0].text
    assert "| Revenue | 2000 | 3000 |" in results[0].text


def test_search_hydrates_visual_line_candidate(monkeypatch):
    def fake_embed_query(query):
        assert query == "What does the chart say?"
        return [0.1, 0.2, 0.3]

    def fake_get_embedding_candidates(doc_id, query_emb, k):
        return [
            {
                "entity_type": "document_visual_line",
                "entity_id": "visual-1:line:2",
                "parent_entity_id": "visual-1",
                "visual_id": "visual-1",
                "page_number": 12,
                "block_type": "chart",
                "content_text": "Revenue increased",
                "metadata": {"line_text": "Revenue 2020 2021 2022"},
                "cosine_sim": 0.91,
            }
        ]

    def fake_get_document_visual(visual_id):
        assert visual_id == "visual-1"
        return {
            "visual_id": "visual-1",
            "page_number": 12,
            "block_type": "chart",
            "bbox_x1": 20.0,
            "bbox_y1": 100.0,
            "bbox_x2": 420.0,
            "bbox_y2": 300.0,
            "visual_summary": "Revenue increased steadily from 2020 to 2022.",
            "ocr_text": "2020 100\n2021 140\n2022 180",
        }

    monkeypatch.setitem(sys.modules, "embedding_service", SimpleNamespace(embed_query=fake_embed_query))
    monkeypatch.setitem(sys.modules, "block_extractor", SimpleNamespace(get_top_k_blocks=lambda *args, **kwargs: []))
    monkeypatch.setitem(
        sys.modules,
        "app.table_store",
        SimpleNamespace(
            get_embedding_candidates=fake_get_embedding_candidates,
            get_document_table=lambda table_id: None,
            get_document_visual=fake_get_document_visual,
        ),
    )

    if "retrieval" in sys.modules:
        del sys.modules["retrieval"]

    retrieval = importlib.import_module("retrieval")
    results = retrieval.search("doc-visual", "What does the chart say?", top_k=3)

    assert len(results) == 1
    assert results[0].block_id == "visual-1"
    assert results[0].block_type == "chart"
    assert "Revenue increased steadily" in results[0].text
    assert "Highlighted OCR line" in results[0].text
