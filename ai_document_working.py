# ─────────────────────────────────────────────────────────────
# app.py — Flask web app for AI Document Search (upload + chat)
# Redis-backed storage; session stores only a small preview
# ─────────────────────────────────────────────────────────────

from __future__ import annotations # for Python 3.10 compatibility with | in types

from flask import (
    Flask,
    render_template,
    render_template_string,
    request,
    jsonify,
    session,
    redirect,
    url_for,
)
from werkzeug.utils import secure_filename
from jinja2 import TemplateNotFound
import os
import io
from uuid import uuid4

REDIS = None
try:
    import redis as _redis
    _redis_url = os.environ.get("REDIS_URL")
    if _redis_url:
        REDIS = _redis.from_url(_redis_url, decode_responses=True)
except Exception:
    REDIS = None  # gracefully degrade to in-memory store

# In-memory fallback store (only for development/single-process)
DOC_STORE: dict[str, str] = {}
DOC_TTL_SECONDS = int(os.environ.get("DOC_TTL_SECONDS", "86400"))  # 1 day
PREVIEW_LIMIT = int(os.environ.get("PREVIEW_LIMIT", "2000"))       # chars shown in cookie/UI if needed

# PDF
try:
    from pdfminer.high_level import extract_text as pdf_extract_text
except Exception:
    pdf_extract_text = None

# DOCX
try:
    import docx  # python-docx
except Exception:
    docx = None

# Images (OCR)
try:
    import pytesseract
    from PIL import Image
except Exception:
    pytesseract = None
    Image = None

ALLOWED_EXT = {"pdf", "docx", "png", "jpg", "jpeg", "webp", "bmp", "tiff", "txt", "csv", "md"}

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB

# Cookie hardening (good practice)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def ext_of(filename: str) -> str:
    return (filename.rsplit(".", 1)[-1].lower() if "." in filename else "").strip()

def is_allowed(filename: str) -> bool:
    return ext_of(filename) in ALLOWED_EXT

def read_text_file(f) -> str:
    try:
        b = f.read()
        try:
            return b.decode("utf-8")
        except UnicodeDecodeError:
            return b.decode("latin-1", errors="ignore")
    except Exception as e:
        return f"[Text read error] {e}"

def extract_docx_text(file_bytes: bytes) -> str:
    if not docx:
        return "python-docx is not installed; cannot read DOCX yet."
    try:
        buf = io.BytesIO(file_bytes)
        d = docx.Document(buf)
        return "\n".join(p.text for p in d.paragraphs)
    except Exception as e:
        return f"[DOCX extract error] {e}"

def extract_pdf_text(file_bytes: bytes) -> str:
    if not pdf_extract_text:
        return "pdfminer.six is not installed; cannot read PDFs yet."
    try:
        return pdf_extract_text(io.BytesIO(file_bytes))
    except Exception as e:
        return f"[PDF extract error] {e}"

def ocr_image_to_text(file_bytes: bytes) -> str:
    if not (pytesseract and Image):
        return "pytesseract/Pillow not installed or Tesseract not available; cannot OCR images yet."
    try:
        img = Image.open(io.BytesIO(file_bytes))
        return pytesseract.image_to_string(img)
    except Exception as e:
        return f"[OCR error] {e}"

def naive_search_answer(haystack: str, query: str) -> str:
    lines = [ln.strip() for ln in haystack.splitlines() if ln.strip()]
    q_words = [w for w in query.lower().split() if len(w) > 2]
    hits = []
    for ln in lines:
        ln_low = ln.lower()
        if all(w in ln_low for w in q_words):
            hits.append(ln)
        if len(hits) >= 8:
            break
    if not hits:
        return (
            "I couldn't find a direct keyword match. "
            "Once wired to your Python LLM pipeline, I'll answer semantically. Try different keywords for now."
        )
    return "Here are some lines that look relevant:\n\n" + "\n".join(f"• {h}" for h in hits)

def put_doc_text(doc_id: str, text: str):
    """Store text in Redis (preferred) or in-memory fallback."""
    if REDIS is not None:
        REDIS.setex(f"doc:{doc_id}", DOC_TTL_SECONDS, text)
    else:
        DOC_STORE[doc_id] = text

def get_doc_text(doc_id: str) -> str:
    if not doc_id:
        return ""
    if REDIS is not None:
        val = REDIS.get(f"doc:{doc_id}")
        return val or ""
    return DOC_STORE.get(doc_id, "")

def clear_doc(doc_id: str | None):
    if not doc_id:
        return
    if REDIS is not None:
        try:
            REDIS.delete(f"doc:{doc_id}")
        except Exception:
            pass
    else:
        DOC_STORE.pop(doc_id, None)

def render_index(display_text: str, filemeta: dict | None, doc_id: str | None = None):
    """Render UI with real template if available; otherwise inline fallback."""
    try:
        return render_template("index.html", extracted_text=display_text, filemeta=filemeta, doc_id=doc_id)
    except TemplateNotFound:
        return render_template_string(
            """
            <!doctype html>
            <html lang="en"><head>
            <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>AI Document Search</title>
            <style>
            :root{color-scheme:dark}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;background:#000;color:#fff}
            .center{min-height:100dvh;display:flex;align-items:center;justify-content:center}
            .upload-card{border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:48px 64px;text-align:center;background:rgba(255,255,255,.04);box-shadow:0 10px 30px rgba(0,0,0,.4)}
            .upload-btn{background:none;border:none;cursor:pointer;color:#fff}.plus{width:80px;height:80px;display:block;margin:0 auto}
            .upload-label{font-size:28px;font-weight:700;margin-top:12px}.helper{margin-top:8px;color:rgba(255,255,255,.85);font-size:14px}.hidden{display:none}
            .container{max-width:1100px;margin:24px auto;padding:0 16px}.grid{display:grid;grid-template-columns:1fr 2fr;gap:16px}
            .card{background:#0b0b0b;border:1px solid #2a2a2a;border-radius:16px}.card h2{margin:0;padding:16px;border-bottom:1px solid #2a2a2a;font-size:16px}.card .content{padding:16px}
            .meta{color:#aaa;font-size:12px;margin-top:8px}.scroll{max-height:60vh;overflow:auto;white-space:pre-wrap;word-wrap:break-word}
            .chat{display:flex;flex-direction:column;gap:12px}.chat-window{max-height:50vh;overflow:auto;border:1px solid #2a2a2a;border-radius:12px;padding:12px;background:#000}
            .bubble{max-width:80%;padding:10px 12px;border-radius:14px;margin:6px 0;font-size:14px}.user{align-self:flex-end;background:#fff;color:#000}.bot{align-self:flex-start;background:#1f1f1f;color:#fff}
            .row{display:flex;gap:8px}input[type=text]{flex:1;padding:12px;border-radius:10px;border:1px solid #2a2a2a;background:#000;color:#fff}
            button.primary{padding:12px 16px;border-radius:10px;border:none;background:#fff;color:#000;font-weight:600;cursor:pointer}
            .topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
            .link{color:#fff;text-decoration:underline;cursor:pointer}
            </style></head><body>
            {% if not extracted_text %}
              <div class="center"><div class="upload-card">
                <button id="uploadBtn" class="upload-btn" onclick="openPicker()" aria-label="Upload">
                  <svg class="plus" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"> <path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
                  <div class="upload-label">Upload</div>
                </button>
                <div id="helper" class="helper hidden">You can upload PDF, Word (.docx), or images</div>
                <form id="uploadForm" class="hidden" method="POST" action="/upload" enctype="multipart/form-data">
                  <input id="fileInput" type="file" name="file" accept=".pdf,.docx,image/*,.txt,.csv,.md" />
                </form>
              </div></div>
            {% else %}
              <div class="container">
                <div class="topbar">
                  <div></div>
                  <a href="/reset" class="link">New Upload</a>
                </div>
                <div class="grid">
                  <div class="card"><h2>Extracted Text</h2><div class="content"><div class="scroll">{{ extracted_text }}</div>
                    {% if filemeta %}<div class="meta">File: {{ filemeta.name }} • {{ (filemeta.size/1024)|round(1) }} KB</div>{% endif %}
                  </div></div>
                  <div class="card"><h2>Ask Questions</h2><div class="content">
                    <div id="chatWindow" class="chat-window chat"></div>
                    <div class="row"><input id="chatInput" type="text" placeholder="Type your question…" />
                      <button id="sendBtn" class="primary" onclick="sendQuestion()">Send</button>
                    </div>
                  </div></div>
                </div>
              </div>
            {% endif %}
            <script>
              function openPicker(){const helper=document.getElementById('helper');helper.classList.remove('hidden');const input=document.getElementById('fileInput');setTimeout(()=>input.click(),50);}
              const fileInput=document.getElementById('fileInput');if(fileInput){fileInput.addEventListener('change',()=>{if(fileInput.files&&fileInput.files.length>0){document.getElementById('uploadForm').submit();}})}
              const chatWindow=document.getElementById('chatWindow');function pushBubble(role,text){const div=document.createElement('div');div.className='bubble '+(role==='user'?'user':'bot');div.textContent=text;chatWindow.appendChild(div);chatWindow.scrollTop=chatWindow.scrollHeight;}
              async function sendQuestion(){const input=document.getElementById('chatInput');const q=(input.value||'').trim();if(!q)return;pushBubble('user',q);input.value='';const res=await fetch('/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})});const data=await res.json();pushBubble('bot',data.answer||'No answer');}
            </script>
            </body></html>
            """,
            extracted_text=display_text,
            filemeta=filemeta,
            doc_id=doc_id,
        )

# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────

@app.route("/")
def index():
    """
    Display the full doc text from Redis (if doc_id present),
    otherwise fall back to the small preview stored in the session.
    """
    doc_id = session.get("doc_id")
    filemeta = session.get("filemeta")
    display_text = ""

    if doc_id:
        # Prefer full text from server-side store for display (doesn't bloat cookies)
        display_text = get_doc_text(doc_id) or ""

    if not display_text:
        # Fallback to whatever small preview is in the cookie
        display_text = session.get("extracted_text", "")

    return render_index(display_text, filemeta, doc_id)

@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return redirect(url_for("index"))
    f = request.files["file"]
    if not f.filename:
        return redirect(url_for("index"))

    filename = secure_filename(f.filename)
    if not is_allowed(filename):
        # Keep this small message in session for UI; OK for cookie size.
        session["extracted_text"] = (
            f"Unsupported file type: .{ext_of(filename)}. Allowed: {', '.join(sorted(ALLOWED_EXT))}"
        )
        session["filemeta"] = {"name": filename, "size": 0}
        return redirect(url_for("index"))

    data = f.read()
    ext = ext_of(filename)
    text = ""

    if ext == "pdf":
        text = extract_pdf_text(data)
    elif ext == "docx":
        text = extract_docx_text(data)
    elif ext in {"png", "jpg", "jpeg", "webp", "bmp", "tiff"}:
        text = ocr_image_to_text(data)
    elif ext in {"txt", "csv", "md"}:
        text = read_text_file(io.BytesIO(data))
    else:
        text = "Unsupported (should not happen)."

    # Store full text server-side
    doc_id = str(uuid4())
    put_doc_text(doc_id, text or "")

    # Store only a small preview in the cookie session (avoid large cookies)
    preview = (text or "")[:PREVIEW_LIMIT]
    session["extracted_text"] = preview
    session["filemeta"] = {"name": filename, "size": len(data)}
    session["doc_id"] = doc_id

    return redirect(url_for("index"))

@app.route("/ask", methods=["POST"])
def ask():
    payload = request.get_json(silent=True) or {}
    q = (payload.get("question") or "").strip()

    # Prefer reading full text from Redis/in-memory store
    doc_id = session.get("doc_id")
    doc_text = get_doc_text(doc_id)

    # Back-compat fallback if store empty (e.g., tests seeding session directly)
    if not doc_text:
        doc_text = session.get("extracted_text", "")

    if not q:
        return jsonify({"ok": False, "answer": "Please ask a question."})
    if not doc_text:
        return jsonify({"ok": False, "answer": "No document text available yet. Please upload a file first."})

    answer = naive_search_answer(doc_text, q)
    return jsonify({"ok": True, "answer": answer})

@app.get("/reset")
def reset():
    """Clear current document/session state and go back to Upload screen."""
    clear_doc(session.get("doc_id"))
    for key in ("doc_id", "extracted_text", "filemeta"):
        session.pop(key, None)
    return redirect(url_for("index"))

@app.get("/healthz")
def healthz():
    status = {"ok": True, "redis": False}
    if REDIS is not None:
        try:
            REDIS.ping()
            status["redis"] = True
        except Exception:
            status["ok"] = False
    return status

def _write_preview(html_path: str = "preview.html"):
    """Render the landing page and write it to a static HTML file."""
    with app.app_context():
        html = render_index("", None)
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
    print(f"[info] Preview written to {html_path}")

def _run_server():
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 5000))
    app.run(host=host, port=port, debug=False, use_reloader=False)

if __name__ == "__main__":
    if os.environ.get("NO_SERVER", "0") == "1":
        _write_preview()
    else:
        try:
            _run_server()
        except SystemExit:
            print("[warn] Server couldn't start (SystemExit). Falling back to preview.html.")
            _write_preview()
