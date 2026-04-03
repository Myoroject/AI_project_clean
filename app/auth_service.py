from __future__ import annotations

import logging
import os
import re
import secrets
import json
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from psycopg2.extras import RealDictCursor
from werkzeug.security import check_password_hash, generate_password_hash

from app.db import get_conn

logger = logging.getLogger("auth_service")

EMAIL_RE = re.compile(r"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$", re.I)
PASSWORD_MIN_LENGTH = 12
OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = int(os.environ.get("OTP_EXPIRY_MINUTES", "10"))
DEV_MODE = os.environ.get("FLASK_DEBUG", "0").lower() in {"1", "true", "yes", "on"}
FLASK_PUBLIC_URL = os.environ.get("FLASK_PUBLIC_URL", "http://localhost:5000").rstrip("/")
NEXTJS_BASE_URL = os.environ.get("NEXTJS_BASE_URL", "http://localhost:3000").rstrip("/")
GOOGLE_SCOPES = ["openid", "email", "profile"]

_AUTH_TABLES_READY = False


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_email(email: str) -> bool:
    return bool(email and EMAIL_RE.match(email))


def password_rules() -> list[str]:
    return [
        f"At least {PASSWORD_MIN_LENGTH} characters",
        "One uppercase letter",
        "One lowercase letter",
        "One number",
        "One special character",
    ]


def validate_password(password: str) -> list[str]:
    failures: list[str] = []
    value = password or ""

    if len(value) < PASSWORD_MIN_LENGTH:
        failures.append(password_rules()[0])
    if not re.search(r"[A-Z]", value):
        failures.append(password_rules()[1])
    if not re.search(r"[a-z]", value):
        failures.append(password_rules()[2])
    if not re.search(r"\d", value):
        failures.append(password_rules()[3])
    if not re.search(r"[^A-Za-z0-9]", value):
        failures.append(password_rules()[4])

    return failures


def mask_email(email: str) -> str:
    normalized = normalize_email(email)
    if "@" not in normalized:
        return normalized

    local, domain = normalized.split("@", 1)
    if len(local) <= 2:
        local_mask = local[0] + "*" * max(len(local) - 1, 1)
    else:
        local_mask = f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}"
    return f"{local_mask}@{domain}"


def ensure_auth_tables() -> None:
    global _AUTH_TABLES_READY
    if _AUTH_TABLES_READY:
        return

    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS auth_users (
                        email TEXT PRIMARY KEY,
                        password_hash TEXT,
                        auth_provider TEXT NOT NULL DEFAULT 'password',
                        google_sub TEXT UNIQUE,
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        last_login_at TIMESTAMPTZ,
                        password_changed_at TIMESTAMPTZ
                    );

                    CREATE TABLE IF NOT EXISTS auth_password_resets (
                        id BIGSERIAL PRIMARY KEY,
                        email TEXT NOT NULL REFERENCES auth_users(email) ON DELETE CASCADE,
                        otp_hash TEXT NOT NULL,
                        reset_token_hash TEXT,
                        expires_at TIMESTAMPTZ NOT NULL,
                        verified_at TIMESTAMPTZ,
                        consumed_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );

                    CREATE INDEX IF NOT EXISTS idx_auth_password_resets_email_created
                        ON auth_password_resets (email, created_at DESC);
                    """
                )
        _AUTH_TABLES_READY = True
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[dict[str, Any]]:
    ensure_auth_tables()
    normalized = normalize_email(email)
    if not normalized:
        return None

    conn = get_conn()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT email, password_hash, auth_provider, is_active,
                           created_at, updated_at, last_login_at, password_changed_at
                    FROM auth_users
                    WHERE email = %s
                    """,
                    (normalized,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
    finally:
        conn.close()


def register_user(email: str, password: str) -> dict[str, Any]:
    ensure_auth_tables()
    normalized = normalize_email(email)

    if not validate_email(normalized):
        raise ValueError("Enter a valid email address.")

    failures = validate_password(password)
    if failures:
        raise ValueError("Password does not meet the required rules.")

    existing = get_user_by_email(normalized)
    if existing and existing.get("password_hash"):
        raise ValueError("An account with that email already exists.")

    auth_provider = "hybrid" if existing and existing.get("auth_provider") == "google" else "password"
    conn = get_conn()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO auth_users (
                        email, password_hash, auth_provider, is_active,
                        created_at, updated_at, password_changed_at
                    )
                    VALUES (%s, %s, %s, TRUE, NOW(), NOW(), NOW())
                    ON CONFLICT (email) DO UPDATE
                        SET password_hash = EXCLUDED.password_hash,
                            auth_provider = EXCLUDED.auth_provider,
                            updated_at = NOW(),
                            password_changed_at = NOW()
                    RETURNING email, auth_provider, is_active
                    """,
                    (normalized, generate_password_hash(password), auth_provider),
                )
                row = cur.fetchone()
                return dict(row)
    finally:
        conn.close()


def authenticate_user(email: str, password: str) -> dict[str, Any]:
    user = get_user_by_email(email)
    if not user or not user.get("is_active"):
        raise ValueError("Invalid email or password.")
    if not user.get("password_hash"):
        raise ValueError("This account needs Google sign-in. Add a password first through account recovery.")
    if not check_password_hash(user["password_hash"], password or ""):
        raise ValueError("Invalid email or password.")

    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE auth_users
                    SET last_login_at = NOW(), updated_at = NOW()
                    WHERE email = %s
                    """,
                    (user["email"],),
                )
    finally:
        conn.close()

    return user


def _smtp_settings() -> dict[str, Any]:
    return {
        "host": os.environ.get("SMTP_HOST", "").strip(),
        "port": int(os.environ.get("SMTP_PORT", "587")),
        "user": os.environ.get("SMTP_USER", "").strip(),
        "password": os.environ.get("SMTP_PASSWORD", "").strip(),
        "from_email": os.environ.get("SMTP_FROM_EMAIL", "").strip(),
        "use_tls": os.environ.get("SMTP_USE_TLS", "1").lower() in {"1", "true", "yes", "on"},
    }


def google_redirect_uri() -> str:
    return os.environ.get("GOOGLE_REDIRECT_URI", f"{FLASK_PUBLIC_URL}/api/auth/google/callback").strip()


def google_auth_configured() -> bool:
    return bool(
        os.environ.get("GOOGLE_CLIENT_ID", "").strip()
        and os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
        and google_redirect_uri()
    )


def google_auth_url(state: str) -> str:
    if not google_auth_configured():
        raise RuntimeError("Google OAuth is not configured.")

    params = urlencode({
        "client_id": os.environ.get("GOOGLE_CLIENT_ID", "").strip(),
        "redirect_uri": google_redirect_uri(),
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "online",
        "prompt": "select_account",
        "state": state,
    })
    return f"https://accounts.google.com/o/oauth2/v2/auth?{params}"


def _read_json_response(request: Request) -> dict[str, Any]:
    try:
        with urlopen(request, timeout=20) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return json.loads(response.read().decode(charset))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Google request failed: {detail}") from exc
    except URLError as exc:
        raise RuntimeError("Unable to reach Google OAuth services.") from exc


def _google_exchange_code(code: str) -> dict[str, Any]:
    payload = urlencode({
        "code": code,
        "client_id": os.environ.get("GOOGLE_CLIENT_ID", "").strip(),
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", "").strip(),
        "redirect_uri": google_redirect_uri(),
        "grant_type": "authorization_code",
    }).encode("utf-8")

    request = Request(
        "https://oauth2.googleapis.com/token",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    return _read_json_response(request)


def _google_userinfo(access_token: str) -> dict[str, Any]:
    request = Request(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )
    return _read_json_response(request)


def upsert_google_user(email: str, google_sub: str) -> dict[str, Any]:
    ensure_auth_tables()
    normalized = normalize_email(email)
    if not validate_email(normalized):
        raise ValueError("Google did not provide a valid email address.")
    if not google_sub:
        raise ValueError("Google did not provide a valid account identifier.")

    existing = get_user_by_email(normalized)
    auth_provider = "google"
    if existing:
        if existing.get("auth_provider") == "password":
            auth_provider = "hybrid"
        elif existing.get("auth_provider") == "hybrid":
            auth_provider = "hybrid"

    conn = get_conn()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO auth_users (
                        email, password_hash, auth_provider, google_sub, is_active,
                        created_at, updated_at, last_login_at
                    )
                    VALUES (%s, NULL, %s, %s, TRUE, NOW(), NOW(), NOW())
                    ON CONFLICT (email) DO UPDATE
                        SET google_sub = EXCLUDED.google_sub,
                            auth_provider = %s,
                            updated_at = NOW(),
                            last_login_at = NOW()
                    RETURNING email, auth_provider, is_active
                    """,
                    (normalized, auth_provider, google_sub, auth_provider),
                )
                row = cur.fetchone()
                return dict(row)
    finally:
        conn.close()


def authenticate_google_oauth(code: str) -> dict[str, Any]:
    if not google_auth_configured():
        raise RuntimeError("Google OAuth is not configured.")
    if not code:
        raise ValueError("Missing Google authorization code.")

    token_data = _google_exchange_code(code)
    access_token = token_data.get("access_token", "")
    if not access_token:
        raise RuntimeError("Google token exchange did not return an access token.")

    profile = _google_userinfo(access_token)
    email = normalize_email(profile.get("email", ""))
    google_sub = profile.get("sub", "")
    email_verified = bool(profile.get("email_verified", False))

    if not email or not email_verified:
        raise ValueError("Google account email is missing or not verified.")

    return upsert_google_user(email, google_sub)


def _send_email(subject: str, recipient: str, body: str) -> None:
    settings = _smtp_settings()
    if not settings["host"] or not settings["from_email"]:
        raise RuntimeError("SMTP is not configured.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings["from_email"]
    message["To"] = recipient
    message.set_content(body)

    with smtplib.SMTP(settings["host"], settings["port"], timeout=20) as server:
        server.ehlo()
        if settings["use_tls"]:
            server.starttls()
            server.ehlo()
        if settings["user"]:
            server.login(settings["user"], settings["password"])
        server.send_message(message)


def create_password_reset(email: str) -> dict[str, Any]:
    ensure_auth_tables()
    normalized = normalize_email(email)
    if not validate_email(normalized):
        raise ValueError("Enter a valid email address.")

    user = get_user_by_email(normalized)
    generic = {
        "email": normalized,
        "masked_email": mask_email(normalized),
        "delivery": "email",
        "dev_otp": None,
    }
    if not user:
        return generic

    otp = f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)

    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO auth_password_resets (email, otp_hash, expires_at)
                    VALUES (%s, %s, %s)
                    """,
                    (normalized, generate_password_hash(otp), expires_at),
                )
    finally:
        conn.close()

    message = (
        "Your Documind password reset code is:\n\n"
        f"{otp}\n\n"
        f"This code expires in {OTP_EXPIRY_MINUTES} minutes.\n"
        "If you did not request this reset, you can ignore this email."
    )

    try:
        _send_email("Your Documind reset code", normalized, message)
    except Exception as exc:
        if DEV_MODE:
            logger.warning("SMTP unavailable. OTP preview for %s: %s (%s)", normalized, otp, exc)
            generic["delivery"] = "preview"
            generic["dev_otp"] = otp
            return generic
        raise RuntimeError("Unable to send OTP email right now.") from exc

    return generic


def verify_password_reset_otp(email: str, otp: str) -> str:
    ensure_auth_tables()
    normalized = normalize_email(email)
    if not validate_email(normalized):
        raise ValueError("Enter a valid email address.")

    conn = get_conn()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, otp_hash, expires_at, consumed_at
                    FROM auth_password_resets
                    WHERE email = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (normalized,),
                )
                row = cur.fetchone()
                if not row:
                    raise ValueError("No reset request found for that email.")

                if row["consumed_at"] is not None or row["expires_at"] < datetime.now(timezone.utc):
                    raise ValueError("That OTP has expired. Request a new one.")
                if not check_password_hash(row["otp_hash"], (otp or "").strip()):
                    raise ValueError("That OTP is not valid.")

                reset_token = secrets.token_urlsafe(32)
                cur.execute(
                    """
                    UPDATE auth_password_resets
                    SET verified_at = NOW(), reset_token_hash = %s
                    WHERE id = %s
                    """,
                    (generate_password_hash(reset_token), row["id"]),
                )
                return reset_token
    finally:
        conn.close()


def reset_password(email: str, reset_token: str, new_password: str) -> None:
    ensure_auth_tables()
    normalized = normalize_email(email)
    if not validate_email(normalized):
        raise ValueError("Enter a valid email address.")

    failures = validate_password(new_password)
    if failures:
        raise ValueError("Password does not meet the required rules.")

    conn = get_conn()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, reset_token_hash, expires_at, consumed_at, verified_at
                    FROM auth_password_resets
                    WHERE email = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (normalized,),
                )
                row = cur.fetchone()
                if not row:
                    raise ValueError("No reset request found for that email.")
                if row["verified_at"] is None:
                    raise ValueError("Verify the OTP before setting a new password.")
                if row["consumed_at"] is not None or row["expires_at"] < datetime.now(timezone.utc):
                    raise ValueError("That reset session has expired. Request a new OTP.")
                if not row["reset_token_hash"] or not check_password_hash(row["reset_token_hash"], reset_token or ""):
                    raise ValueError("That reset token is not valid.")

                user = get_user_by_email(normalized)
                auth_provider = "hybrid" if user and user.get("auth_provider") == "google" else "password"
                cur.execute(
                    """
                    UPDATE auth_users
                    SET password_hash = %s,
                        auth_provider = %s,
                        updated_at = NOW(),
                        password_changed_at = NOW()
                    WHERE email = %s
                    """,
                    (generate_password_hash(new_password), auth_provider, normalized),
                )
                cur.execute(
                    """
                    UPDATE auth_password_resets
                    SET consumed_at = NOW()
                    WHERE id = %s
                    """,
                    (row["id"],),
                )
    finally:
        conn.close()
