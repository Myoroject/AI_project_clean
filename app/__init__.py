import os
import logging
from flask import Flask

def create_app():  #defines a factory function that creates and configures a new Flask app instance.
    app = Flask(__name__)  #creates the Flask object.

    # Secret key: To keep backward-compat with current env var name
    app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY") or os.environ.get("SECRET_KEY", "dev-secret-key")  # Sets the secret key for the application, which is used for session management and other security-related tasks. It first tries to get the value from the FLASK_SECRET_KEY environment variable, then from SECRET_KEY, and defaults to "dev-secret-key" if neither is set.

    # 20 MB upload limit
    app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

    # Cookie hardening
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        # Only require HTTPS for cookies in production (not in local dev)
        SESSION_COOKIE_SECURE=False,
    )

    # CORS configuration for Next.js frontend
    try:
        from flask_cors import CORS
        CORS(
            app,
            origins=[
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:3001",
                "http://localhost:5173",   # Vite dev server
                "http://127.0.0.1:5173",
            ],
            supports_credentials=True,
        )
        logging.info("CORS enabled")
    except ImportError:
        logging.warning("flask-cors not installed. Run: pip install flask-cors")

    # Logging (stdout)
    #logging.basicConfig(level=os.environ.get("LOG_LEVEL", "WARNING").upper())
    logging.getLogger("pdfminer").setLevel(logging.WARNING)

    # ==================== PROFILING ====================
    # Enable profiling when FLASK_PROFILE=1
    if os.environ.get("FLASK_PROFILE", "0") == "1":
        try:
            from werkzeug.middleware.profiler import ProfilerMiddleware
            profile_dir = os.path.join(os.path.dirname(__file__), "..", "profile_output")
            os.makedirs(profile_dir, exist_ok=True)
            app.wsgi_app = ProfilerMiddleware(
                app.wsgi_app,
                restrictions=[30],  # Top 30 functions
                profile_dir=profile_dir,  # Save .prof files here
                filename_format="{method}.{path}.{elapsed:.0f}ms.{time:.0f}.prof"
            )
            logging.warning("PROFILER ENABLED - Output: %s", profile_dir)
        except ImportError:
            logging.warning("Werkzeug profiler not available")
    # ===================================================

    # Register routes
    from .routes import bp as routes_bp # Imports a Blueprint object named bp from the routes module located in the same package as this wsgi.py file.
    app.register_blueprint(routes_bp) # Registers the imported Blueprint with the Flask application, allowing the routes defined in the Blueprint to be part of the application.

    if "PYTEST_CURRENT_TEST" not in os.environ:
        try:
            from .processing_worker import start_processing_worker

            start_processing_worker()
        except Exception as exc:
            logging.exception("Failed to start document processing worker: %s", exc)

    return app
