# upload_flow.py (simplified)
import io
import uuid
from app.redis_client import put_doc_text, build_chunks_from_redis
from app.ingest_db import insert_document, insert_chunks_bulk
from typing import Optional
from pypdf import PdfReader


def handle_text_upload(
    user_id: Optional[str],
    filename: str,
    text: str,
    pdf_bytes: Optional[bytes] = None,
) -> str:
    """
    Create doc_id, compute metadata (size_bytes, total_pages for PDFs),
    store text/chunks, and insert document metadata into DB.

    This ensures total_pages is computed from the actual uploaded bytes.
    """

    # 1) Create doc id
    doc_id = str(uuid.uuid4())
    # 2) Compute size_bytes (prefer file bytes if present)
    if pdf_bytes:
        size_bytes = len(pdf_bytes)
    else:
        # fallback: size of text in bytes
        size_bytes = len((text or "").encode("utf-8"))

    # 3) Compute total_pages if this is a PDF and bytes are present
    total_pages = None
    if pdf_bytes:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            total_pages = len(reader.pages)
            print(f"[handle_text_upload] doc_id={doc_id} computed total_pages={total_pages} for {filename}")
        except Exception as e:
            print(f"[handle_text_upload] Warning: failed to read PDF for {filename}: {e}")
            total_pages = None
    else:
        print(f"[handle_text_upload] No pdf_bytes provided for {filename}; total_pages will be NULL")

    ok = put_doc_text(doc_id, text)
    if not ok:
        # update document status to error (you can implement update)
        raise RuntimeError("Failed to store text in Redis")
        

    # 4) (Your existing logic) store raw text in Redis / chunk / embed etc.
    # Example: put_doc_text(doc_id, text)
    try:
        # your existing calls — keep these (pseudo)
        # put_doc_text(doc_id, text)
        # create chunks, embeddings, etc.
        pass
    except Exception as e:
        print(f"[handle_text_upload] Warning: storage/embedding step failed: {e}")

    # 5) Insert metadata into DB using insert_document. Pass total_pages and size_bytes.
    # insert_document should accept total_pages param (your current insert_document does)
    insert_document(
        doc_id=doc_id,
        user_id=user_id,
        filename=filename,
        size_bytes=size_bytes,
        storage="redis",
        total_pages=total_pages,
        pdf_bytes=None,   # Optional: not needed now because we've computed total_pages here
    )

    # 6) return doc_id to caller
    return doc_id
