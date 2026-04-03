"""
Database connection helper for PostgreSQL.

- Loads `.env` from the project root automatically.
- Reads `DATABASE_URL` directly when provided.
- Builds the URL from `PG_*` variables as a fallback.
"""

import os
from urllib.parse import quote_plus

import psycopg2
from dotenv import load_dotenv


load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))


def _database_url() -> str:
    """Return the configured PostgreSQL URL or build one from PG_* variables."""
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if database_url:
        return database_url

    pg_host = os.environ.get("PG_HOST", "127.0.0.1").strip()
    pg_port = os.environ.get("PG_PORT", "5432").strip()
    pg_user = os.environ.get("PG_USER", "Postgres").strip()
    pg_password = os.environ.get("PG_PASSWORD", "root").strip()
    pg_db = os.environ.get("PG_DB", "postgres").strip()

    if not (pg_host and pg_user and pg_password and pg_db):
        return ""

    return (
        f"postgresql://{quote_plus(pg_user)}:{quote_plus(pg_password)}"
        f"@{pg_host}:{pg_port}/{pg_db}"
    )


def get_conn():
    """Return a PostgreSQL connection using the configured database URL."""
    database_url = _database_url()
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set and could not be built from PG_* variables."
        )

    try:
        return psycopg2.connect(database_url)
    except Exception as exc:
        raise RuntimeError(f"Failed to connect to PostgreSQL: {exc}") from exc
