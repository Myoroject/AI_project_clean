# AI Document Search

AI Document Search is a web application that lets users upload, process, and search
documents such as PDFs, DOCX files, and OCR-friendly images using grounded retrieval.

---

## Features

- Upload and parse documents including PDF, DOCX, and OCR inputs.
- Chunk and index extracted text for retrieval.
- Search against stored document content with Redis and vector-backed flows.
- Serve the backend with Flask and expose the app via Gunicorn.

---

## Project Structure

```text
ai-doc-search/
app/
  __init__.py        # create_app()
  routes.py          # Flask routes
  auth_service.py    # Registration, login, OAuth, password reset
  storage.py         # File storage helpers
  redis_client.py    # Redis integration
  wsgi.py            # exposes "app"
  static/            # CSS/JS
  templates/         # HTML templates
  tests/             # pytest tests
  gunicorn_conf.py   # Gunicorn config
  Dockerfile         # App Dockerfile
  docker-compose.yml # Multi-service setup
.env.example         # Example environment vars
requirements.txt     # Python dependencies
README.md            # Project documentation
```
