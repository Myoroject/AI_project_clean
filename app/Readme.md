# 📄 AI Document Search

AI Document Search is a web application that allows users to upload, process, and search documents (PDF, DOCX, images with OCR, etc.) using AI-powered text extraction, chunking, and vector search.

---

## 🚀 Features
- Upload and parse documents (PDF, DOCX, Images with OCR).
- Preprocessing & text chunking for search.
- Embedding-based search with Redis / vector DB backend.
- Web interface with Flask + Jinja templates.
- Redis caching for faster queries.
- Gunicorn + NGINX support for production.

---

## 📂 Project Structure
ai-doc-search/
app/
init.py # create_app()
routes.py # Flask routes
auth.py # Basic Auth middleware
storage.py # File storage helpers
redis_client.py # Redis connection
wsgi.py # exposes "app"
static/ # CSS/JS
templates/ # HTML templates
tests/ # pytest tests
gunicorn.conf.py # Gunicorn config
Dockerfile # App Dockerfile
docker-compose.yml # Multi-service setup
nginx/ # NGINX config (for deployment)
.env.example # Example environment vars
requirements.txt # Python dependencies
README.md # Project documentation
