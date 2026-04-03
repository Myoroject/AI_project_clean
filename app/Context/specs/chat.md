# Feature Spec: Chat / Document Q&A

## Overview
The core interaction loop: user asks a question about their uploaded document, the system retrieves the most relevant evidence blocks, and presents them with page numbers, block types, and source text.

## Endpoint

### `POST /ask`

**Authentication:** Required.

**Input:**
```json
{
  "question": "What was the total revenue in Q3?",
  "doc_id": "uuid-string"          // Optional: can come from URL params or session
}
```

**Response (success):**
```json
{
  "ok": true,
  "answer": "**[1] Page 12** (*table*):\n> Total revenue for Q3 was $4.2M...\n\n**[2] Page 3** (*paragraph*):\n> The company reported strong revenue growth..."
}
```

## Search Pipeline

```
User question: "What was the total revenue?"
    │
    ▼
1. embed_query(question)
   └── BGE prefix: "Represent this sentence for searching relevant passages: " + question
   └── Output: float32 array, shape (384,)
    │
    ▼
2. faiss_search(query_embedding, top_k=30)
   └── HNSW approximate nearest neighbor search
   └── Returns: [(block_id, cosine_sim), ...]
    │
    ▼
3. get_top_k_blocks(doc_id, block_ids)
   └── Fetch full DocumentBlock objects from PostgreSQL
   └── Includes: text, page_number, bbox, block_type
    │
    ▼
4. Deterministic Geometry Reranking
   ├── cosine_sim × 0.60 (base semantic score)
   ├── block_type bonus: table +0.15, paragraph +0.10, header +0.05
   ├── position bonus: body content (y1 50-750) +0.05
   └── area bonus: large (>10K px²) +0.10, medium (>1K) +0.05
    │
    ▼
5. Sort by final_score DESC → return top 5
    │
    ▼
Format as evidence blocks with page numbers and block types
```

## Fallback Behavior

If the retrieval pipeline fails (models not loaded, FAISS empty, DB error):
1. Catch the exception and log it.
2. Fall back to `naive_search_answer()`: keyword matching against full document text.
3. If document text is also unavailable: return `"Document text is still processing or unavailable."`

## Chat UI

### Jinja2 Template (`templates/chat.html`)
- Renders at `/chat/<doc_id>`.
- Shows document preview text (first 2000 chars, configurable via `PREVIEW_LIMIT`).
- Chat window with user/bot message bubbles.
- Input field + Send button.
- AJAX calls to `/ask` with `doc_id` in payload.

### Next.js Analysis Page
- Renders at `/analysis` route.
- Calls `/api/document/<doc_id>` for document data.
- Chat interface component (under development).

## EvidenceBlock Data Structure

```python
@dataclass
class EvidenceBlock:
    block_id: str         # UUID hex
    text: str             # Source text content
    page_number: int      # 1-indexed page
    score: float          # Final reranked score
    cosine_score: float   # Raw ANN cosine similarity
    block_type: str       # paragraph, table, header, etc.
    x1, y1, x2, y2: float  # Bounding box coordinates
```
