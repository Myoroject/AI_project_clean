# Feature Spec: Authentication (Login, Register, OAuth, Password Reset)

## Overview
Full authentication system supporting email/password, Google OAuth 2.0, and OTP-based password recovery. Stored in PostgreSQL `auth_users` table.

## Components

### Frontend: `AuthPortal.tsx`
- Multi-step form with animated transitions.
- Modes: Login → Register → Forgot Password (Request → Verify OTP → Reset).
- Google OAuth "Sign in with Google" button.
- Real-time password rule validation (12+ chars, mixed case, digit, special).
- Error display with dismissable alerts.

### Backend Routes (`app/routes.py`)

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/api/auth/config` | GET | — | `{ google_configured, password_rules }` |
| `/api/auth/me` | GET | Session cookie | `{ email, auth_provider }` or 401 |
| `/api/auth/register` | POST | `{ email, password }` | `{ email, auth_provider }` |
| `/api/auth/login` | POST | `{ email, password }` | `{ email, auth_provider }` |
| `/api/auth/logout` | POST | Session cookie | `{ ok: true }` |
| `/api/auth/forgot-password/request` | POST | `{ email }` | `{ masked_email, delivery }` |
| `/api/auth/forgot-password/verify` | POST | `{ email, otp }` | `{ reset_token }` |
| `/api/auth/forgot-password/reset` | POST | `{ email, reset_token, password }` | `{ ok: true }` |
| `/api/auth/google/start` | GET | — | Redirect to Google OAuth |
| `/api/auth/google/callback` | GET | `?code=...&state=...` | Redirect to `/workspace` |

### Backend Service (`app/auth_service.py`)

| Function | Logic |
|----------|-------|
| `register_user()` | Validates email format + password rules, bcrypt hash, upsert with `ON CONFLICT` |
| `authenticate_user()` | Fetches user, checks `is_active`, verifies bcrypt hash, updates `last_login_at` |
| `authenticate_google_oauth()` | Exchanges auth code → access token → userinfo, upserts user with `google_sub` |
| `create_password_reset()` | Generates 6-digit OTP, stores bcrypt hash in `auth_password_resets`, sends via SMTP |
| `verify_password_reset_otp()` | Checks OTP hash, expiry, and consumed status; returns `reset_token` |
| `reset_password()` | Validates reset token, sets new password hash, marks OTP as consumed |

## Database Tables

### `auth_users`
| Column | Type | Notes |
|--------|------|-------|
| `email` | TEXT PK | Normalized lowercase |
| `password_hash` | TEXT | Bcrypt via Werkzeug |
| `auth_provider` | TEXT | `password`, `google`, `hybrid` |
| `google_sub` | TEXT UNIQUE | Google account ID |
| `is_active` | BOOLEAN | Account enabled/disabled |
| `created_at` / `updated_at` | TIMESTAMPTZ | Auto-set |
| `last_login_at` | TIMESTAMPTZ | Updated on login |
| `password_changed_at` | TIMESTAMPTZ | Updated on password change |

### `auth_password_resets`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | Auto-increment |
| `email` | TEXT FK | References `auth_users(email)` |
| `otp_hash` | TEXT | Bcrypt hash of 6-digit OTP |
| `reset_token_hash` | TEXT | Bcrypt hash of reset token (set after OTP verified) |
| `expires_at` | TIMESTAMPTZ | Default 10 minutes from creation |
| `verified_at` / `consumed_at` | TIMESTAMPTZ | Lifecycle tracking |

## Security Notes
- Passwords: bcrypt via `werkzeug.security.generate_password_hash`.
- Sessions: `HttpOnly`, `SameSite=Lax`, `Secure` (non-debug mode).
- OTP: 6-digit, 10-minute expiry, bcrypt-hashed storage.
- Google OAuth: state parameter CSRF protection.
- Hybrid accounts: users can link both password and Google sign-in.
