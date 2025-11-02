from __future__ import annotations
from flask import (
    Blueprint, render_template, render_template_string, request,
    jsonify, session, redirect, url_for, flash
)
from werkzeug.utils import secure_filename
from jinja2 import TemplateNotFound
import io, os
from uuid import uuid4
from app.upload_flow import handle_text_upload
from app.redis_client import put_doc_text, get_doc_text, clear_doc, redis_healthy
from typing import Optional

from app.storage import (
    ALLOWED_EXT, PREVIEW_LIMIT, ext_of, is_allowed, read_text_file,
    extract_docx_text, extract_pdf_text, ocr_image_to_text, naive_search_answer,
)

bp = Blueprint("routes", __name__)

# ---------- UI renderer ----------
def render_index(display_text: str, filemeta: dict | None, doc_id: str | None = None):
    return render_template(
        "index.html",
        extracted_text=display_text,
        filemeta=filemeta,
        doc_id=doc_id,
    )


# ---------- Routes ----------
@bp.route("/")
def index():
    doc_id = session.get("doc_id")
    filemeta = session.get("filemeta")
    display_text = ""

    if doc_id:
        display_text = get_doc_text(doc_id) or ""

    if not display_text:
        display_text = session.get("extracted_text", "")

    return render_index(display_text, filemeta, doc_id)


from .storage import human_size


@bp.route("/upload", methods=["POST"])
def upload():
    # 1) Try JSON body first
    if request.is_json:
        payload = request.get_json(silent=True) or {}
        user_id = payload.get("user_id")
        filename = payload.get("filename")
        text = payload.get("text")
        if text:
            doc_id = handle_text_upload(user_id, filename or "payload.txt", text)
            # redirect to the chat path that accepts doc_id
            return redirect(f"/chat/{doc_id}")

    # 2) Try form fields (application/x-www-form-urlencoded)
    user_id = request.form.get("user_id")
    filename = request.form.get("filename")
    text = request.form.get("text")
    if text:
        doc_id = handle_text_upload(user_id, filename or "form.txt", text)
        return redirect(f"/chat/{doc_id}")

    # 3) Try multipart file upload (file upload via browser / curl -F)
    if "file" not in request.files:
        return jsonify({"error": "no text provided and no file uploaded"}), 400

    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"error": "empty filename or no file"}), 400

    filename = secure_filename(f.filename)
    if not is_allowed(filename):
        return jsonify({"error": f"unsupported file type: {ext_of(filename)}"}), 400

    data = f.read()
    ext = ext_of(filename)

    if ext == "pdf":
        text = extract_pdf_text(data)
        pdf_bytes = data  # ✅ keep original bytes for page count
    elif ext == "docx":
        text = extract_docx_text(data)
    elif ext in {"png", "jpg", "jpeg", "webp", "bmp", "tiff"}:
        text = ocr_image_to_text(data)
    elif ext in {"txt", "csv", "md"}:
        text = read_text_file(io.BytesIO(data))
    else:
        text = ""

    # Now reuse the same handle_text_upload for storage & DB operations
    doc_id = handle_text_upload(user_id, filename, text or "", pdf_bytes=pdf_bytes)
    # Set session metadata for UI
    session["filemeta"] = {"name": filename, "size": int(len(data))}
    session["doc_id"] = doc_id

    return redirect(f"/chat/{doc_id}")


@bp.route("/search/<doc_id>")
def search_page(doc_id):
    filemeta = session.get("filemeta")
    text_preview = (get_doc_text(doc_id) or "")[:PREVIEW_LIMIT]
    return render_template("search.html", filemeta=filemeta, doc_id=doc_id, preview=text_preview)


@bp.route("/ask", methods=["POST"])
def ask():
    payload = request.get_json(silent=True) or {}
    q = (payload.get("question") or "").strip()

    doc_id = session.get("doc_id")
    doc_text = get_doc_text(doc_id) if doc_id is not None else session.get("extracted_text", "")

    if not q:
        return jsonify({"ok": False, "answer": "Please ask a question."})
    if not doc_text:
        return jsonify({"ok": False, "answer": "No document text available yet. Please upload a file first."})

    answer = naive_search_answer(doc_text, q)
    return jsonify({"ok": True, "answer": answer})


@bp.get("/reset")
def reset():
    """Clear session + Redis document"""
    clear_doc(session.get("doc_id"))
    for key in ("doc_id", "extracted_text", "filemeta"):
        session.pop(key, None)
    flash("Session reset")
    return redirect(url_for("routes.index"))


@bp.get("/healthz")
def healthz():
    """Return app + Redis health status"""
    status = {"ok": True, "redis": redis_healthy()}
    if not status["redis"]:
        if "REDIS_URL" in os.environ:  # Redis configured but unhealthy
            status["ok"] = False
    return jsonify(status)   # ✅ return as JSON


# -----------------------------
# Add a chat route that accepts optional doc_id in the path
# -----------------------------
@bp.route("/chat/")
@bp.route("/chat/<doc_id>")
def chat(doc_id=None):
    """
    Render the chat UI.
    Behavior:
      - If doc_id provided in the path, use it.
      - Else fallback to query param: /chat?doc_id=...
      - Else fallback to session["doc_id"].
    """
    # prefer path param, then query string, then session
    doc_id = doc_id or request.args.get("doc_id") or session.get("doc_id")
    filemeta = session.get("filemeta")

    # optional: preview text to render quickly in the template
    text_preview = (get_doc_text(doc_id) or "")[:PREVIEW_LIMIT] if doc_id else ""

    # If your chat UI expects certain variables, pass them here.
    # If you prefer the frontend to fetch doc data via AJAX, you can pass only doc_id.
    return render_template(
        "chat.html",
        doc_id=doc_id,
        filemeta=filemeta,
        preview=text_preview,
    )
