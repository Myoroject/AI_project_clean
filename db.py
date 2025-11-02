# db.py
"""
Database connection helper for PostgreSQL.

- Automatically loads .env from the project root (no need to export env vars).
- Reads DATABASE_URL directly from .env
- Builds the URL from PG_* variables if DATABASE_URL is missing.
- Returns a psycopg2 connection.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import quote_plus
from dotenv import load_dotenv

# ---------------------------------------------------------------------
# 1️⃣ Load the .env file (this makes variables available in os.environ)
# ---------------------------------------------------------------------
# The .env file should be placed in your project root (same level as /app)
# Example line in .env:
# DATABASE_URL=postgresql://Postgres:root@127.0.0.1:5432/postgres
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))


# ---------------------------------------------------------------------
# 2️⃣ Get DATABASE_URL or build it from PG_* components
# ---------------------------------------------------------------------
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

if not DATABASE_URL:
    PG_HOST = os.environ.get("PG_HOST", "127.0.0.1").strip()
    PG_PORT = os.environ.get("PG_PORT", "5432").strip()
    PG_USER = os.environ.get("PG_USER", "Postgres").strip()
    PG_PASSWORD = os.environ.get("PG_PASSWORD", "root").strip()
    PG_DB = os.environ.get("PG_DB", "postgres").strip()

    if PG_HOST and PG_USER and PG_PASSWORD and PG_DB:
        user_enc = quote_plus(PG_USER)
        pwd_enc = quote_plus(PG_PASSWORD)
        DATABASE_URL = f"postgresql://{user_enc}:{pwd_enc}@{PG_HOST}:{PG_PORT}/{PG_DB}"
    else:
        DATABASE_URL = ""


# ---------------------------------------------------------------------
# 3️⃣ Connection function
# ---------------------------------------------------------------------
def get_conn():
    """
    Return a PostgreSQL connection using psycopg2.

    Uses DATABASE_URL from .env or built from PG_* vars.
    Example DATABASE_URL:
      postgresql://Postgres:root@127.0.0.1:5432/postgres
    """
    if not DATABASE_URL:
        raise RuntimeError(
            "❌ DATABASE_URL not set and could not build from PG_* variables.\n"
            "Make sure your .env file exists and includes:\n"
            "DATABASE_URL=postgresql://Postgres:root@127.0.0.1:5432/postgres"
        )

    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        raise RuntimeError(f"❌ Failed to connect to PostgreSQL: {e}")
