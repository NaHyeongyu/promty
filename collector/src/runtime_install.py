from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import secrets
import shlex
import shutil
import subprocess
import sys

from file_lock import locked_file


RUNTIME_MODULES: tuple[str, ...] = (
    "change_tracking.py",
    "cli.py",
    "config.py",
    "events.py",
    "file_lock.py",
    "git_context.py",
    "payloads.py",
    "response_capture.py",
    "runtime_install.py",
    "sequence.py",
    "session_index.py",
    "updater.py",
    "version.py",
)
RUNTIME_PACKAGES: tuple[str, ...] = ("adapters", "uploader")


def runtime_home() -> Path:
    return Path(os.environ.get("PROMTY_HOME", "~/.promty")).expanduser().resolve()


def _runtime_python_command() -> str:
    configured = os.environ.get("PROMPTHUB_HOOK_PYTHON")
    if configured:
        return configured
    promty_python = os.environ.get("PROMTY_PYTHON")
    if promty_python:
        if os.name == "nt":
            return subprocess.list2cmdline([promty_python])
        return shlex.quote(promty_python)
    if os.name == "nt":
        return subprocess.list2cmdline([sys.executable])
    return shlex.quote(sys.executable)


def _source_files() -> tuple[tuple[Path, Path], ...]:
    source_root = Path(__file__).resolve().parent
    files: list[tuple[Path, Path]] = []
    for module_name in RUNTIME_MODULES:
        source_path = source_root / module_name
        if not source_path.is_file():
            raise FileNotFoundError(f"Promty runtime source is missing: {source_path}")
        files.append((Path(module_name), source_path))

    for package_name in RUNTIME_PACKAGES:
        package_root = source_root / package_name
        package_files = sorted(package_root.rglob("*.py"))
        if not package_files:
            raise FileNotFoundError(f"Promty runtime package is missing: {package_root}")
        files.extend(
            (source_path.relative_to(source_root), source_path) for source_path in package_files
        )
    return tuple(files)


def _digest(files: tuple[tuple[Path, Path], ...]) -> str:
    digest = hashlib.sha256()
    for relative_path, source_path in files:
        digest.update(relative_path.as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(source_path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _is_complete(
    runtime_path: Path,
    files: tuple[tuple[Path, Path], ...],
    expected_digest: str,
) -> bool:
    runtime_files = tuple(
        (relative_path, runtime_path / relative_path) for relative_path, _ in files
    )
    if not all(path.is_file() for _, path in runtime_files):
        return False
    return _digest(runtime_files) == expected_digest


def _install_files() -> Path:
    files = _source_files()
    digest = _digest(files)
    runtime_root = runtime_home() / "runtime"
    runtime_path = runtime_root / digest
    runtime_root.mkdir(parents=True, exist_ok=True)
    with locked_file(runtime_root / ".install.lock"):
        if _is_complete(runtime_path, files, digest):
            return runtime_path
        if runtime_path.exists():
            shutil.rmtree(runtime_path)

        staging_path = runtime_root / f".{digest}.{secrets.token_hex(4)}.tmp"
        try:
            for relative_path, source_path in files:
                destination = staging_path / relative_path
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_path, destination)
            (staging_path / "runtime.json").write_text(
                json.dumps(
                    {
                        "digest": digest,
                        "files": [path.as_posix() for path, _ in files],
                    },
                    indent=2,
                    sort_keys=True,
                )
                + "\n",
                encoding="utf-8",
            )
            staging_path.replace(runtime_path)
        finally:
            if staging_path.exists():
                shutil.rmtree(staging_path)
    return runtime_path


def launcher_path() -> Path:
    name = "promty.cmd" if os.name == "nt" else "promty"
    return runtime_home() / "bin" / name


def _write_launcher(runtime_path: Path) -> Path:
    target = launcher_path()
    cli_path = runtime_path / "cli.py"
    if os.name == "nt":
        content = f'@echo off\r\n{_runtime_python_command()} "{cli_path}" %*\r\n'
    else:
        content = f'#!/bin/sh\nexec {_runtime_python_command()} {shlex.quote(str(cli_path))} "$@"\n'

    target.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = target.with_name(f".{target.name}.{secrets.token_hex(4)}.tmp")
    try:
        temporary_path.write_text(content, encoding="utf-8", newline="")
        if os.name != "nt":
            temporary_path.chmod(0o755)
        temporary_path.replace(target)
    finally:
        temporary_path.unlink(missing_ok=True)
    return target


def install_runtime() -> Path:
    return _write_launcher(_install_files())


def quote_command_path(path: Path) -> str:
    if os.name == "nt":
        return subprocess.list2cmdline([str(path)])
    return shlex.quote(str(path))
