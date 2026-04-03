# app/routes.py  (fixed)
from __future__ import annotations
from flask import (
    Blueprint, render_template, request,
    jsonify, session, redirect, url_for, flash, current_app
)
from werkzeug.utils import secure_filename
from jinja2 import TemplateNotFound
import io, os
from uuid import uuid4
from app.upload_flow import handle_text_upload
from app.redis_client import put_doc_text, get_doc_text, clear_doc, redis_healthy
from app.ingest_db import insert_search_results
from app.llm_service import synthesize_answer
from typing import Optional
from urllib.parse import quote

from app.storage import (
    ALLOWED_EXT, PREVIEW_LIMIT, ext_of, is_allowed, read_text_file,
    extract_docx_text, extract_pdf_text, ocr_image_to_text, naive_search_answer,
)
from app.auth_service import (
    authenticate_google_oauth,
    authenticate_user,
    create_password_reset,
    get_user_by_email,
    google_auth_configured,
    google_auth_url,
    mask_email,
    normalize_email,
    password_rules,
    register_user,
    reset_password,
    validate_email,
    validate_password,
    verify_password_reset_otp,
)

bp = Blueprint("routes", __name__)
import logging
from flask import current_app

# module logger (safe at import time)
logger = logging.getLogger("routes")

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
    """Redirect to Next.js frontend"""
    return redirect("http://localhost:3000")


from .storage import human_size


def signed_in_user_email() -> str:
    return normalize_email(session.get("user_id") or "")


def require_authenticated_api():
    email = signed_in_user_email()
    if email:
        return email, None
    return "", (jsonify({"ok": False, "error": "Authentication required."}), 401)


def set_authenticated_session(email: str, auth_provider: str) -> None:
    session["user_id"] = normalize_email(email)
    session["user_email"] = normalize_email(email)
    session["auth_provider"] = auth_provider


@bp.get("/api/auth/config")
def auth_config():
    return jsonify({
        "ok": True,
        "google_configured": google_auth_configured(),
        "password_rules": password_rules(),
    })


@bp.get("/api/auth/me")
def auth_me():
    email = signed_in_user_email()
    if not email:
        return jsonify({"ok": False, "error": "Not signed in."}), 401

    user = get_user_by_email(email)
    if not user:
        session.pop("user_id", None)
        session.pop("user_email", None)
        session.pop("auth_provider", None)
        return jsonify({"ok": False, "error": "Session is no longer valid."}), 401

    return jsonify({
        "ok": True,
        "email": user["email"],
        "auth_provider": user["auth_provider"],
    })


@bp.post("/api/auth/register")
def auth_register():
    payload = request.get_json(silent=True) or {}
    email = normalize_email(payload.get("email") or "")
    password = payload.get("password") or ""

    if not validate_email(email):
        return jsonify({"ok": False, "error": "Enter a valid email address."}), 400

    failures = validate_password(password)
    if failures:
        return jsonify({"ok": False, "error": "Password does not meet the required rules.", "rules": failures}), 400

    try:
        user = register_user(email, password)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("auth_register failed for %s: %s", email, exc)
        return jsonify({"ok": False, "error": "Unable to create the account right now."}), 500

    set_authenticated_session(user["email"], user["auth_provider"])
    return jsonify({
        "ok": True,
        "email": user["email"],
        "auth_provider": user["auth_provider"],
    })


@bp.post("/api/auth/login")
def auth_login():
    payload = request.get_json(silent=True) or {}
    email = normalize_email(payload.get("email") or "")
    password = payload.get("password") or ""

    if not validate_email(email):
        return jsonify({"ok": False, "error": "Enter a valid email address."}), 400

    try:
        user = authenticate_user(email, password)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("auth_login failed for %s: %s", email, exc)
        return jsonify({"ok": False, "error": "Unable to sign in right now."}), 500

    set_authenticated_session(user["email"], user["auth_provider"])
    return jsonify({
        "ok": True,
        "email": user["email"],
        "auth_provider": user["auth_provider"],
    })


@bp.post("/api/auth/logout")
def auth_logout():
    for key in ("user_id", "user_email", "auth_provider", "doc_id", "filemeta", "extracted_text"):
        session.pop(key, None)
    return jsonify({"ok": True})


@bp.post("/api/auth/forgot-password/request")
def auth_forgot_password_request():
    payload = request.get_json(silent=True) or {}
    email = normalize_email(payload.get("email") or "")

    if not validate_email(email):
        return jsonify({"ok": False, "error": "Enter a valid email address."}), 400

    try:
        result = create_password_reset(email)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("auth_forgot_password_request failed for %s: %s", email, exc)
        return jsonify({"ok": False, "error": "Unable to send the OTP right now."}), 500

    response = {
        "ok": True,
        "email": result["email"],
        "masked_email": result["masked_email"],
        "delivery": result["delivery"],
        "message": f"An OTP has been sent to {result['masked_email']}.",
    }
    if result.get("dev_otp"):
        response["dev_otp"] = result["dev_otp"]
    return jsonify(response)


@bp.post("/api/auth/forgot-password/verify")
def auth_forgot_password_verify():
    payload = request.get_json(silent=True) or {}
    email = normalize_email(payload.get("email") or "")
    otp = (payload.get("otp") or "").strip()

    if not validate_email(email):
        return jsonify({"ok": False, "error": "Enter a valid email address."}), 400
    if not otp:
        return jsonify({"ok": False, "error": "Enter the OTP from your email."}), 400

    try:
        reset_token = verify_password_reset_otp(email, otp)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("auth_forgot_password_verify failed for %s: %s", email, exc)
        return jsonify({"ok": False, "error": "Unable to verify the OTP right now."}), 500

    return jsonify({
        "ok": True,
        "email": email,
        "reset_token": reset_token,
        "masked_email": mask_email(email),
    })


@bp.post("/api/auth/forgot-password/reset")
def auth_forgot_password_reset():
    payload = request.get_json(silent=True) or {}
    email = normalize_email(payload.get("email") or "")
    reset_token = payload.get("reset_token") or ""
    new_password = payload.get("password") or ""

    if not validate_email(email):
        return jsonify({"ok": False, "error": "Enter a valid email address."}), 400
    failures = validate_password(new_password)
    if failures:
        return jsonify({"ok": False, "error": "Password does not meet the required rules.", "rules": failures}), 400

    try:
        reset_password(email, reset_token, new_password)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("auth_forgot_password_reset failed for %s: %s", email, exc)
        return jsonify({"ok": False, "error": "Unable to reset the password right now."}), 500

    return jsonify({"ok": True, "email": email})


@bp.get("/api/auth/google/start")
def auth_google_start():
    if not google_auth_configured():
        nextjs_base = os.environ.get("NEXTJS_BASE_URL", "http://localhost:3000").rstrip("/")
        return redirect(f"{nextjs_base}/?auth_error={quote('Google sign-in is not configured yet.')}")

    state = uuid4().hex
    session["google_oauth_state"] = state
    return redirect(google_auth_url(state))


@bp.get("/api/auth/google/callback")
def auth_google_callback():
    nextjs_base = os.environ.get("NEXTJS_BASE_URL", "http://localhost:3000").rstrip("/")

    oauth_error = request.args.get("error")
    if oauth_error:
        return redirect(f"{nextjs_base}/?auth_error={quote(oauth_error)}")

    state = request.args.get("state", "")
    expected_state = session.pop("google_oauth_state", "")
    if not state or state != expected_state:
        return redirect(f"{nextjs_base}/?auth_error={quote('Google session validation failed. Please try again.')}")

    code = request.args.get("code", "")
    try:
        user = authenticate_google_oauth(code)
        set_authenticated_session(user["email"], user["auth_provider"])
    except Exception as exc:
        current_app.logger.exception("Google OAuth callback failed: %s", exc)
        return redirect(f"{nextjs_base}/?auth_error={quote(str(exc))}")

    return redirect(f"{nextjs_base}/workspace")


@bp.route("/upload", methods=["POST"])
def upload():
    """
    Accept:
     - JSON body with fields { user_id, filename, text }  (API / integrations)
     - Form fields (user_id, filename, text)
     - Multipart file upload under "file"
    Returns:
     - Redirect to chat page /chat/<doc_id> on success
     - JSON 400/500 on errors for API clients
    """
    user_email, auth_error = require_authenticated_api()
    if auth_error:
        return auth_error

    # ensure pdf_bytes always defined
    pdf_bytes = None

    # 1) Try JSON body first
    if request.is_json:
        payload = request.get_json(silent=True) or {}
        user_id = payload.get("user_id") or user_email
        filename = payload.get("filename")
        text = payload.get("text")
        if text:
            try:
                doc_id = handle_text_upload(user_id, filename or "payload.txt", text)
            except Exception as e:
                current_app.logger.exception("handle_text_upload(JSON) failed: %s", e)
                # return JSON error for API clients
                return jsonify({"error": "upload failed", "detail": str(e)}), 500
            session["doc_id"] = doc_id
            # Return JSON for API clients (Next.js will handle the redirect)
            return jsonify({"ok": True, "doc_id": doc_id})

    # 2) Try form fields (application/x-www-form-urlencoded)
    user_id = request.form.get("user_id") or user_email
    filename = request.form.get("filename")
    text = request.form.get("text")
    if text:
        try:
            doc_id = handle_text_upload(user_id, filename or "form.txt", text)
        except Exception as e:
            current_app.logger.exception("handle_text_upload(form) failed: %s", e)
            return jsonify({"ok": False, "error": "Upload failed", "detail": str(e)}), 500
        session["doc_id"] = doc_id
        # Return JSON for API clients
        return jsonify({"ok": True, "doc_id": doc_id})

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

    # determine text and optionally preserve pdf_bytes
    if ext == "pdf":
        text = extract_pdf_text(data)
        pdf_bytes = data  # keep original bytes for page count and later processing
    elif ext == "docx":
        text = extract_docx_text(data)
    elif ext in {"png", "jpg", "jpeg", "webp", "bmp", "tiff"}:
        text = ocr_image_to_text(data)
    elif ext in {"txt", "csv", "md"}:
        text = read_text_file(io.BytesIO(data))
    else:
        text = ""

    try:
        # call handle_text_upload with pdf_bytes (None when not a PDF)
        doc_id = handle_text_upload(user_email, filename, text or "", pdf_bytes=pdf_bytes)
    except Exception as e:
        current_app.logger.exception("handle_text_upload(file) failed for %s: %s", filename, e)
        return jsonify({"ok": False, "error": "Upload failed", "detail": str(e)}), 500

    # Set session metadata for UI
    session["filemeta"] = {"name": filename, "size": int(len(data))}
    session["doc_id"] = doc_id

    # Return JSON with doc_id for API clients (Next.js handles routing)
    return jsonify({"ok": True, "doc_id": doc_id, "filename": filename, "size": len(data)})


@bp.route("/search/<doc_id>")
def search_page(doc_id):
    filemeta = session.get("filemeta")
    preview = ""
    if doc_id:
        try:
            preview = (get_doc_text(doc_id) or "")[:PREVIEW_LIMIT]
        except Exception as e:
            current_app.logger.exception("get_doc_text(search) failed for %s: %s", doc_id, e)
            preview = ""
    return render_template("search.html", filemeta=filemeta, doc_id=doc_id, preview=preview)


@bp.route("/ask", methods=["POST"])
def ask():
    user_email, auth_error = require_authenticated_api()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    q = (payload.get("question") or "").strip()

    # ✅ URL + payload aware (stateless)
    doc_id = (
        payload.get("doc_id")
        or request.args.get("doc_id")
        or session.get("doc_id")
    )

    if not doc_id:
        return jsonify({"ok": False, "answer": "No document selected."})

    if not q:
        return jsonify({"ok": False, "answer": "Please ask a question."})

    try:
        from retrieval import search as retrieval_search

        # Geometry-aware semantic search. Retrieval stays unchanged; the LLM
        # layer only synthesizes over the returned evidence.
        evidence = retrieval_search(doc_id, q, top_k=4)

        llm_result = synthesize_answer(query=q, evidence=evidence)
        answer = llm_result["answer"]

        if not evidence:
            citations = []
            ranked_results = []
            search_id = None
        else:
            citations = [
                {
                    "rank": idx + 1,
                    "block_id": e.block_id,
                    "text": e.text,
                    "page": e.page_number,
                    "block_type": e.block_type,
                    "score": round(e.score, 3),
                    "cosine_score": round(e.cosine_score, 3),
                }
                for idx, e in enumerate(evidence)
            ]
            ranked_results = [
                {
                    "rank": idx + 1,
                    **e.to_dict(),
                }
                for idx, e in enumerate(evidence)
            ]
            search_id = None
            try:
                search_id = insert_search_results(doc_id, q, evidence)
            except Exception as insert_error:
                current_app.logger.exception(
                    "insert_search_results failed for doc_id=%s: %s",
                    doc_id,
                    insert_error,
                )

    except Exception as e:
        current_app.logger.exception("retrieval_search failed for %s: %s", doc_id, e)
        # Fallback to naive search if retrieval pipeline is broken (e.g. models not downloaded)
        doc_text = get_doc_text(doc_id) or ""
        if not doc_text:
            return jsonify({
                "ok": False,
                "answer": "Document text is still processing or unavailable."
            })
        answer = naive_search_answer(doc_text, q)
        citations = []
        ranked_results = []
        search_id = None
        llm_result = {
            "answer_source": "fallback:naive_search",
            "llm_enabled": None,
            "llm_model": None,
            "llm_available": False,
            "llm_error_code": "retrieval_failed",
            "llm_fallback_reason": "retrieval_exception",
        }

    return jsonify({
        "ok": True,
        "answer": answer,
        "answer_source": llm_result.get("answer_source"),
        "llm_enabled": llm_result.get("llm_enabled"),
        "llm_model": llm_result.get("llm_model"),
        "llm_available": llm_result.get("llm_available"),
        "llm_error_code": llm_result.get("llm_error_code"),
        "llm_fallback_reason": llm_result.get("llm_fallback_reason"),
        "citations": citations,
        "results": ranked_results,
        "search_id": search_id,
    })



@bp.get("/reset")
def reset():
    """Clear session + Redis document"""
    try:
        clear_doc(session.get("doc_id"))
    except Exception as e:
        current_app.logger.exception("clear_doc failed: %s", e)
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
    return jsonify(status)


# -----------------------------
# API endpoint for document data (used by Next.js frontend)
# -----------------------------
@bp.route("/api/document/<doc_id>")
def get_document(doc_id):
    """
    Return document data as JSON for the Next.js frontend.
    Returns: { ok, doc_id, text, filename, size }
    """
    user_email, auth_error = require_authenticated_api()
    if auth_error:
        return auth_error

    if not doc_id:
        return jsonify({"ok": False, "error": "No document ID provided"}), 400
    
    try:
        text = get_doc_text(doc_id)
    except Exception as e:
        current_app.logger.exception("get_doc_text failed for %s: %s", doc_id, e)
        return jsonify({"ok": False, "error": "Failed to retrieve document"}), 500
    
    if not text:
        return jsonify({"ok": False, "error": "Document not found"}), 404
    
    # Get filemeta from session if available
    filemeta = session.get("filemeta", {})
    
    return jsonify({
        "ok": True,
        "doc_id": doc_id,
        "text": text,
        "filename": filemeta.get("name", "Document"),
        "size": filemeta.get("size", 0),
    })


# -----------------------------
# Chat route that accepts optional doc_id in the path
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
    text_preview = ""
    if doc_id:
        try:
            text_preview = (get_doc_text(doc_id) or "")[:PREVIEW_LIMIT]
        except Exception as e:
            current_app.logger.exception("get_doc_text(chat) failed for %s: %s", doc_id, e)
            text_preview = ""

    return render_template(
        "chat.html",
        doc_id=doc_id,
        filemeta=filemeta,
        preview=text_preview,
    )
