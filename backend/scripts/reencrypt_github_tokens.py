from __future__ import annotations

import argparse
from uuid import UUID

from sqlalchemy import select

from app.core.encryption import decrypt_github_token_with_rotation, encrypt_github_token
from app.db.session import SessionLocal
from app.models.github_connections import GitHubConnection


def _connection_batch(
    db,
    *,
    after_id: UUID | None,
    batch_size: int,
) -> list[GitHubConnection]:
    statement = select(GitHubConnection).order_by(GitHubConnection.id).limit(batch_size)
    if after_id is not None:
        statement = statement.where(GitHubConnection.id > after_id)
    return list(db.scalars(statement))


def reencrypt_github_tokens(*, batch_size: int, dry_run: bool) -> tuple[int, int]:
    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    db = SessionLocal()
    inspected = 0
    rotated = 0
    try:
        last_id: UUID | None = None
        while rows := _connection_batch(db, after_id=last_id, batch_size=batch_size):
            for connection in rows:
                token, needs_rotation = decrypt_github_token_with_rotation(
                    connection.access_token_encrypted
                )
                inspected += 1
                if needs_rotation:
                    rotated += 1
                    if not dry_run:
                        connection.access_token_encrypted = encrypt_github_token(token)
            last_id = rows[-1].id
            db.rollback() if dry_run else db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return inspected, rotated


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Re-encrypt stored GitHub tokens with the current encryption key.",
    )
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    inspected, rotated = reencrypt_github_tokens(
        batch_size=args.batch_size,
        dry_run=args.dry_run,
    )
    mode = "would rotate" if args.dry_run else "rotated"
    print(f"inspected {inspected} GitHub tokens; {mode} {rotated}")


if __name__ == "__main__":
    main()
