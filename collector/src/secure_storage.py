from __future__ import annotations

import os
from pathlib import Path
import tempfile


PRIVATE_DIRECTORY_MODE = 0o700
PRIVATE_FILE_MODE = 0o600
PROMTY_DATA_ROOT = Path("~/.promty").expanduser()


class UnsafeStoragePathError(RuntimeError):
    pass


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def _reject_symbolic_link(path: Path) -> None:
    if path.is_symlink():
        raise UnsafeStoragePathError(f"Refusing symbolic link for private storage: {path}")


def ensure_private_directory(path: Path, *, tighten_existing: bool = True) -> None:
    path = path.expanduser()
    _reject_symbolic_link(path)
    existed = path.exists()
    path.mkdir(parents=True, exist_ok=True, mode=PRIVATE_DIRECTORY_MODE)
    _reject_symbolic_link(path)
    if tighten_existing or not existed:
        try:
            path.chmod(PRIVATE_DIRECTORY_MODE)
        except OSError:
            pass


def ensure_private_parent(path: Path) -> None:
    """Create a parent safely without changing unrelated custom directories."""

    target = path.expanduser()
    parent = target.parent
    if _is_within(parent, PROMTY_DATA_ROOT):
        ensure_private_directory(PROMTY_DATA_ROOT)
        current = PROMTY_DATA_ROOT
        for part in parent.relative_to(PROMTY_DATA_ROOT).parts:
            current = current / part
            ensure_private_directory(current)
        return
    ensure_private_directory(parent, tighten_existing=False)


def tighten_private_file(path: Path) -> None:
    ensure_private_parent(path)
    _reject_symbolic_link(path.expanduser())
    try:
        path.expanduser().chmod(PRIVATE_FILE_MODE)
    except OSError:
        pass


def open_private_text(path: Path, mode: str):
    """Open a private UTF-8 text file with permissions fixed at creation time."""

    target = path.expanduser()
    ensure_private_parent(target)
    _reject_symbolic_link(target)
    flags_by_mode = {
        "a": os.O_WRONLY | os.O_CREAT | os.O_APPEND,
        "a+": os.O_RDWR | os.O_CREAT | os.O_APPEND,
        "r": os.O_RDONLY,
        "w": os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
    }
    try:
        flags = flags_by_mode[mode]
    except KeyError as exc:
        raise ValueError(f"Unsupported private text mode: {mode}") from exc
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(target, flags, PRIVATE_FILE_MODE)
        os.fchmod(descriptor, PRIVATE_FILE_MODE)
        file = os.fdopen(descriptor, mode, encoding="utf-8")
        descriptor = None
        return file
    finally:
        if descriptor is not None:
            os.close(descriptor)


def append_private_text(path: Path, content: str) -> None:
    with open_private_text(path, "a") as file:
        file.write(content)
        file.flush()


def write_private_text_atomic(path: Path, content: str) -> None:
    target = path.expanduser()
    ensure_private_parent(target)
    _reject_symbolic_link(target)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=target.parent,
        prefix=f".{target.name}.",
        suffix=".tmp",
        text=True,
    )
    temporary_path = Path(temporary_name)
    try:
        tighten_private_file(temporary_path)
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        temporary_path.replace(target)
        tighten_private_file(target)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            temporary_path.unlink()
        except OSError:
            pass
        raise
