from __future__ import annotations

import json
import shutil
import subprocess
from urllib import request

from version import COLLECTOR_VERSION


NPM_PACKAGE = "promty-collector"
NPM_REGISTRY_URL = f"https://registry.npmjs.org/{NPM_PACKAGE}/latest"


def _version_tuple(value: str) -> tuple[int, ...]:
    core = value.strip().split("-", 1)[0]
    try:
        return tuple(int(part) for part in core.split("."))
    except ValueError:
        return ()


def latest_version(timeout: float = 5) -> str | None:
    with request.urlopen(NPM_REGISTRY_URL, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    version = payload.get("version")
    return version.strip() if isinstance(version, str) and version.strip() else None


def update_available(current: str, latest: str) -> bool:
    current_parts = _version_tuple(current)
    latest_parts = _version_tuple(latest)
    return bool(current_parts and latest_parts and latest_parts > current_parts)


def install_latest(version: str) -> bool:
    npx = shutil.which("npx")
    if npx is None:
        return False
    result = subprocess.run(
        [npx, "--yes", f"{NPM_PACKAGE}@{version}", "update-runtime"],
        check=False,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip() or "unknown error"
        raise RuntimeError(f"automatic update failed: {message}")
    return True


def auto_update() -> str | None:
    newest = latest_version()
    if newest is None or not update_available(COLLECTOR_VERSION, newest):
        return None
    return newest if install_latest(newest) else None
