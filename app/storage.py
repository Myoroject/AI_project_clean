import io
import os

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
PREVIEW_LIMIT = int(os.environ.get("PREVIEW_LIMIT", "2000"))

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

def human_size(num_bytes: int) -> str:
    """Convert raw bytes into human-readable KB / MB / GB string."""
    for unit in ["bytes", "KB", "MB", "GB", "TB"]:
        if num_bytes < 1024:
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024
    return f"{num_bytes:.1f} PB"

