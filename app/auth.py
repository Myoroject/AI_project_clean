def require_basic_password(staging_password: str):
    def middleware():
        if request.path.startswith("/healthz") or request.path.startswith("/static"):
            return  # allow
        if not staging_password:
            return  # disabled in dev

        auth = request.headers.get("Authorization", "")
        if auth.startswith("Basic "):
            try:
                decoded = base64.b64decode(auth.split(" ",1)[1]).decode("utf-8", "ignore")
                # any username, password must match
                if ":" in decoded and decoded.split(":",1)[1] == staging_password:
                    return
            except Exception:
                pass