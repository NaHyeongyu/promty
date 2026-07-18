from __future__ import annotations

import os


os.environ.setdefault("PROMTY_APP_ENCRYPTION_KEY", "test-app-encryption-secret")
os.environ.setdefault("PROMTY_GITHUB_TOKEN_ENCRYPTION_KEY", "test-github-token-secret")
os.environ.setdefault("PROMTY_JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("PROMTY_OAUTH_STATE_SECRET", "test-oauth-state-secret")
