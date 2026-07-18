from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess

GIT_TIMEOUT_SECONDS = float(os.environ.get("PROMTY_GIT_TIMEOUT", "5"))


def _run_git(args: list[str], cwd: str | Path, timeout: float = GIT_TIMEOUT_SECONDS) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


def resolve_git_root(cwd: str | Path | None = None) -> str | None:
    start = Path(cwd or os.getcwd()).expanduser()
    output = _run_git(["rev-parse", "--show-toplevel"], start)
    return output or None


def normalize_github_url(remote_url: str | None) -> str | None:
    if not remote_url:
        return None

    value = remote_url.strip()
    patterns = (
        r"^git@github\.com:(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$",
        r"^ssh://git@github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$",
        r"^https://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?/?$",
    )
    for pattern in patterns:
        match = re.match(pattern, value)
        if match:
            return f"https://github.com/{match.group('owner')}/{match.group('repo')}"

    return value if value.startswith("https://github.com/") else None


def git_context(cwd: str | Path | None = None) -> dict[str, str]:
    git_root = resolve_git_root(cwd)
    if git_root is None:
        return {}

    remote_url = (
        _run_git(["remote", "get-url", "origin"], git_root)
        or _run_git(["config", "--get", "remote.origin.url"], git_root)
    )
    branch = _run_git(["branch", "--show-current"], git_root)
    context = {
        "git_root": git_root,
        "branch": branch,
        "git_remote": remote_url,
        "github_url": normalize_github_url(remote_url),
    }
    return {key: value for key, value in context.items() if value}
