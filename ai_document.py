# ─────────────────────────────────────────────────────────────
# app.py — Flask web app for AI Document Search (upload + chat)
# ─────────────────────────────────────────────────────────────
# Why you saw errors in a sandbox
# --------------------------------------------------------------
# 1) `_multiprocessing` missing: Werkzeug's interactive debugger uses
#    Python's `multiprocessing`. In some sandboxes it isn't available,
#    so enabling the debugger/reloader crashes.
# 2) `SystemExit: 1`: If socket binding is blocked or the port is in use,
#    Werkzeug exits with code 1 when starting the server.
#
# ✅ Fixes implemented below:
#   - `debug=False` and `use_reloader=False` (no debugger/reloader).
#   - Safe startup wrapper that catches `SystemExit` and writes a
#     `preview.html` so the script never crashes in restricted envs.
#   - Optional env flag `NO_SERVER=1` to skip binding sockets and just
#     generate the preview template (useful in CI/sandboxes).
#   - Kept existing behavior and tests intact; added more tests.
#
# How to run (safe):
#   1) python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
#   2) pip install -r requirements.txt
#   3a) Recommended in sandbox: NO_SERVER=1 python app.py
#       → renders UI to preview.html without opening a port
#   3b) Local dev: python app.py
#   3c) Flask CLI: flask --app app:app run --no-debugger --no-reload
#
# Notes:
# - OCR for images uses pytesseract (optional). Install the Tesseract binary to enable it.
#   • Windows: https://github.com/UB-Mannheim/tesseract/wiki
#   • macOS (brew): brew install tesseract
#   • Linux (Debian/Ubuntu): sudo apt-get install tesseract-ocr
# - This app keeps extracted text in the Flask session for quick prototyping.
#   Replace with a DB or object storage in production.

from __future__ import annotations

from flask import Flask, render_template, render_template_string, request, jsonify, session, redirect, url_for
from werkzeug.utils import secure_filename
from jinja2 import TemplateNotFound
import os
import io

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
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB


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


def render_index(extracted: str, filemeta: dict | None):
    """Render the main UI using templates/index.html if present, else an inline fallback.
    This keeps tests and sandbox runs stable even if the template file isn't created yet.
    """
    try:
        return render_template("index.html", extracted_text=extracted, filemeta=filemeta)
    except TemplateNotFound:
        # Minimal inline fallback that preserves the requested black UI + upload + helper + chat
        return render_template_string(
            """
            <!doctype html>
            <html lang=\"en\"><head>
            <meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
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
            </style></head><body>
            {% if not extracted_text %}
              <div class=\"center\"><div class=\"upload-card\">
                <button id=\"uploadBtn\" class=\"upload-btn\" onclick=\"openPicker()\" aria-label=\"Upload\">
                  <svg class=\"plus\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\"> <path d=\"M12 5v14M5 12h14\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>
                  <div class=\"upload-label\">Upload</div>
                </button>
                <div id=\"helper\" class=\"helper hidden\">You can upload PDF, Word (.docx), or images</div>
                <form id=\"uploadForm\" class=\"hidden\" method=\"POST\" action=\"/upload\" enctype=\"multipart/form-data\">
                  <input id=\"fileInput\" type=\"file\" name=\"file\" accept=\".pdf,.docx,image/*,.txt,.csv,.md\" />
                </form>
              </div></div>
            {% else %}
              <div class=\"container\"><div class=\"grid\">
                <div class=\"card\"><h2>Extracted Text</h2><div class=\"content\"><div class=\"scroll\">{{ extracted_text }}</div>
                  {% if filemeta %}<div class=\"meta\">File: {{ filemeta.name }} • {{ (filemeta.size/1024)|round(1) }} KB</div>{% endif %}
                </div></div>
                <div class=\"card\"><h2>Ask Questions</h2><div class=\"content\">
                  <div id=\"chatWindow\" class=\"chat-window chat\"></div>
                  <div class=\"row\"><input id=\"chatInput\" type=\"text\" placeholder=\"Type your question…\" />
                    <button id=\"sendBtn\" class=\"primary\" onclick=\"sendQuestion()\">Send</button>
                  </div>
                </div></div>
              </div></div>
            {% endif %}
            <script>
              function openPicker(){const helper=document.getElementById('helper');helper.classList.remove('hidden');const input=document.getElementById('fileInput');setTimeout(()=>input.click(),50);}
              const fileInput=document.getElementById('fileInput');if(fileInput){fileInput.addEventListener('change',()=>{if(fileInput.files&&fileInput.files.length>0){document.getElementById('uploadForm').submit();}})}
              const chatWindow=document.getElementById('chatWindow');function pushBubble(role,text){const div=document.createElement('div');div.className='bubble '+(role==='user'?'user':'bot');div.textContent=text;chatWindow.appendChild(div);chatWindow.scrollTop=chatWindow.scrollHeight;}
              async function sendQuestion(){const input=document.getElementById('chatInput');const q=(input.value||'').trim();if(!q)return;pushBubble('user',q);input.value='';const res=await fetch('/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})});const data=await res.json();pushBubble('bot',data.answer||'No answer');}
            </script>
            </body></html>
            """,
            extracted_text=extracted,
            filemeta=filemeta,
        )


# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────

@app.route("/")
def index():
    extracted = session.get("extracted_text", "")
    filemeta = session.get("filemeta")
    return render_index(extracted, filemeta)


@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return redirect(url_for("index"))
    f = request.files["file"]
    if not f.filename:
        return redirect(url_for("index"))

    filename = secure_filename(f.filename)
    if not is_allowed(filename):
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

    session["extracted_text"] = text or ""
    session["filemeta"] = {"name": filename, "size": len(data)}
    return redirect(url_for("index"))


@app.route("/ask", methods=["POST"])
def ask():
    payload = request.get_json(silent=True) or {}
    q = (payload.get("question") or "").strip()
    doc_text = session.get("extracted_text", "")

    if not q:
        return jsonify({"ok": False, "answer": "Please ask a question."})
    if not doc_text:
        return jsonify({"ok": False, "answer": "No document text available yet. Please upload a file first."})

    answer = naive_search_answer(doc_text, q)
    return jsonify({"ok": True, "answer": answer})


@app.get("/healthz")
def healthz():
    return {"ok": True}


def _write_preview(html_path: str = "preview.html"):
    """Render the landing page and write it to a static HTML file."""
    with app.app_context():
        html = render_index("", None)
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
    print(f"[info] Preview written to {html_path}")


def _run_server():
    host = os.environ.get("HOST", "127.0.0.1")
    # Keep :5000 by default, but allow override. If binding fails, caller handles it.
    port = int(os.environ.get("PORT", 5000))
    app.run(host=host, port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    # Prefer headless preview in restricted environments
    if os.environ.get("NO_SERVER", "0") == "1":
        _write_preview()
    else:
        try:
            _run_server()
        except SystemExit:
            # Socket binding failed or sandbox blocked network; don't crash – write a preview instead
            print("[warn] Server couldn't start (SystemExit). Falling back to preview.html.")
            _write_preview()

# ─────────────────────────────────────────────────────────────
# templates/index.html — Place this file in a folder named `templates/`
# ─────────────────────────────────────────────────────────────
# (Jinja2 template with black contrast UI, centered + Upload, helper line,
#  auto-open file picker, chat UI after upload)

"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Document Search</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif; background:#000; color:#fff; }
    .center { min-height: 100dvh; display:flex; align-items:center; justify-content:center; }
    .upload-card { border:1px solid rgba(255,255,255,0.3); border-radius:20px; padding:48px 64px; text-align:center; background:rgba(255,255,255,0.04); box-shadow:0 10px 30px rgba(0,0,0,0.4); }
    .upload-btn { background:none; border:none; cursor:pointer; color:#fff; }
    .plus { width:80px; height:80px; display:block; margin:0 auto; }
    .upload-label { font-size:28px; font-weight:700; margin-top:12px; }
    .helper { margin-top:8px; color:rgba(255,255,255,0.85); font-size:14px; }
    .hidden { display:none; }
    .container { max-width:1100px; margin: 24px auto; padding: 0 16px; }
    .grid { display:grid; grid-template-columns: 1fr 2fr; gap:16px; }
    .card { background:#0b0b0b; border:1px solid #2a2a2a; border-radius:16px; }
    .card h2 { margin:0; padding:16px; border-bottom:1px solid #2a2a2a; font-size:16px; }
    .card .content { padding:16px; }
    .meta { color:#aaa; font-size:12px; margin-top:8px; }
    .scroll { max-height:60vh; overflow:auto; white-space:pre-wrap; word-wrap:break-word; }
    .chat { display:flex; flex-direction:column; gap:12px; }
    .chat-window { max-height:50vh; overflow:auto; border:1px solid #2a2a2a; border-radius:12px; padding:12px; background:#000; }
    .bubble { max-width:80%; padding:10px 12px; border-radius:14px; margin:6px 0; font-size:14px; }
    .user { align-self:flex-end; background:#fff; color:#000; }
    .bot { align-self:flex-start; background:#1f1f1f; color:#fff; }
    .row { display:flex; gap:8px; }
    input[type="text"] { flex:1; padding:12px; border-radius:10px; border:1px solid #2a2a2a; background:#000; color:#fff; }
    button.primary { padding:12px 16px; border-radius:10px; border:none; background:#fff; color:#000; font-weight:600; cursor:pointer; }
    button.primary:disabled { opacity:0.6; cursor:not-allowed; }
  </style>
</head>
<body>
  {% if not extracted_text %}
  <div class="center">
    <div class="upload-card">
      <button id="uploadBtn" class="upload-btn" onclick="openPicker()" aria-label="Upload">
        <!-- White plus icon (SVG) -->
        <svg class="plus" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2" stroke-linecap="round" />
        </svg>
        <div class="upload-label">Upload</div>
      </button>
      <div id="helper" class="helper hidden">You can upload PDF, Word (.docx), or images</div>
      <form id="uploadForm" class="hidden" method="POST" action="/upload" enctype="multipart/form-data">
        <input id="fileInput" type="file" name="file" accept=".pdf,.docx,image/*,.txt,.csv,.md" />
      </form>
    </div>
  </div>
  {% else %}
  <div class="container">
    <div class="grid">
      <div class="card">
        <h2>Extracted Text</h2>
        <div class="content">
          <div class="scroll">{{ extracted_text }}</div>
          {% if filemeta %}
          <div class="meta">File: {{ filemeta.name }} • {{ (filemeta.size/1024)|round(1) }} KB</div>
          {% endif %}
        </div>
      </div>
      <div class="card">
        <h2>Ask Questions</h2>
        <div class="content">
          <div id="chatWindow" class="chat-window chat"></div>
          <div class="row">
            <input id="chatInput" type="text" placeholder="Type your question…" />
            <button id="sendBtn" class="primary" onclick="sendQuestion()">Send</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  {% endif %}

  <script>
    function openPicker() {
      const helper = document.getElementById('helper');
      helper.classList.remove('hidden');
      const input = document.getElementById('fileInput');
      // slight delay so the helper becomes visible before picker opens
      setTimeout(() => input.click(), 50);
    }

    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
          document.getElementById('uploadForm').submit();
        }
      });
    }

    // Simple chat logic
    const chatWindow = document.getElementById('chatWindow');
    function pushBubble(role, text) {
      const div = document.createElement('div');
      div.className = 'bubble ' + (role === 'user' ? 'user' : 'bot');
      div.textContent = text;
      chatWindow.appendChild(div);
      chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    async function sendQuestion() {
      const input = document.getElementById('chatInput');
      const q = (input.value || '').trim();
      if (!q) return;
      pushBubble('user', q);
      input.value = '';
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
      const data = await res.json();
      pushBubble('bot', data.answer || 'No answer');
    }
  </script>
</body>
</html>
"""

# ─────────────────────────────────────────────────────────────
# requirements.txt — create this file next to app.py
# ─────────────────────────────────────────────────────────────
"""
Flask>=3.0.0
pdfminer.six>=20240706
python-docx>=1.1.0
pytesseract>=0.3.10
Pillow>=10.3.0
pytest>=8.2.0
"""

# ─────────────────────────────────────────────────────────────
# tests/test_app.py — tests to prevent regressions
# ─────────────────────────────────────────────────────────────
"""
import io
import pytest

from app import app as flask_app


@pytest.fixture()
def client():
    flask_app.config.update({"TESTING": True, "SECRET_KEY": "test"})
    with flask_app.test_client() as client:
        yield client


def test_index_renders_without_template(client):
    # With no template file present, the inline fallback should render
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Upload" in resp.data


def test_healthz_ok(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.is_json
    assert resp.get_json()["ok"] is True


def test_ask_without_doc_returns_message(client):
    resp = client.post("/ask", json={"question": "anything"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is False
    assert "upload" in data["answer"].lower()


def test_ask_with_doc_keyword_match(client):
    # Seed session with extracted text
    with client.session_transaction() as sess:
        sess["extracted_text"] = "Python is great. AI document search demo."
    resp = client.post("/ask", json={"question": "document search"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert "relevant" in data["answer"].lower()


def test_ask_no_match_gives_guidance(client):
    with client.session_transaction() as sess:
        sess["extracted_text"] = "Only apples and bananas here."
    resp = client.post("/ask", json={"question": "orange"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert "couldn't find" in data["answer"].lower()


def test_upload_txt_redirects_and_sets_session(client):
    data = {
        "file": (io.BytesIO(b"hello world\nthis is a test"), "sample.txt"),
    }
    resp = client.post("/upload", data=data, content_type="multipart/form-data", follow_redirects=False)
    # We redirect to index after handling upload
    assert resp.status_code in (302, 303)


def test_upload_unsupported_extension_sets_message(client):
    data = {
        "file": (io.BytesIO(b"binary"), "malware.exe"),
    }
    resp = client.post("/upload", data=data, content_type="multipart/form-data", follow_redirects=False)
    assert resp.status_code in (302, 303)
    # Ensure session contains the unsupported message
    with client.session_transaction() as sess:
        extracted = sess.get("extracted_text", "").lower()
        assert "unsupported" in extracted
"""
