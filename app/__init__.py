import os
import logging
from flask import Flask

def create_app():  #defines a factory function that creates and configures a new Flask app instance.
    app = Flask(__name__)  #creates the Flask object.

    # Secret key: To keep backward-compat with current env var name
    app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY") or os.environ.get("SECRET_KEY", "dev-secret-key")  # Sets the secret key for the application, which is used for session management and other security-related tasks. It first tries to get the value from the FLASK_SECRET_KEY environment variable, then from SECRET_KEY, and defaults to "dev-secret-key" if neither is set.

    # 20 MB limit
    app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024 # Sets the maximum allowed payload size for incoming requests to 20 megabytes. This helps prevent denial-of-service attacks by limiting the size of uploads.

    # Cookie hardening
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True, # Prevents JavaScript from accessing the session cookie, mitigating the risk of cross-site scripting (XSS) attacks.
        SESSION_COOKIE_SAMESITE="Lax", # Helps protect against cross-site request forgery (CSRF) attacks by restricting how cookies are sent with cross-site requests.
        SESSION_COOKIE_SECURE=not os.environ.get("FLASK_DEBUG", False), # Ensures that cookies are only sent over HTTPS connections when the application is not in debug mode, enhancing security in production environments.
    )

    # Logging (stdout)
    #logging.basicConfig(level=os.environ.get("LOG_LEVEL", "WARNING").upper())
    logging.getLogger("pdfminer").setLevel(logging.WARNING)


    # Register routes
    from .routes import bp as routes_bp # Imports a Blueprint object named bp from the routes module located in the same package as this wsgi.py file.
    app.register_blueprint(routes_bp) # Registers the imported Blueprint with the Flask application, allowing the routes defined in the Blueprint to be part of the application.

    return app
