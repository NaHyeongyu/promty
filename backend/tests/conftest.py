from __future__ import annotations

import os


os.environ.setdefault("PROMPTHUB_APP_ENCRYPTION_KEY", "test-app-encryption-secret")
os.environ.setdefault("PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_KEY", "test-github-token-secret")
os.environ.setdefault("PROMPTHUB_JWT_SECRET", "test-jwt-secret")
