from __future__ import annotations

import argparse
from uuid import UUID

from sqlalchemy import select

from app.core.encryption import encrypt_app_text_to_string, maybe_decrypt_app_text_from_string
from app.db.session import SessionLocal
from app.models.code_change_patches import CodeChangePatch
from app.models.events import Event
from app.services.event_payload_security import (
    CODE_CHANGE_PATCH_PURPOSE,
    decrypt_event_payload,
    encrypt_event_payload,
)

ROTATABLE_EVENT_TYPES = ("FilesChanged", "PromptSubmitted", "ResponseReceived")


def _event_batch(db, *, after_id: UUID | None, batch_size: int) -> list[Event]:
    statement = (
        select(Event)
        .where(Event.event_type.in_(ROTATABLE_EVENT_TYPES))
        .order_by(Event.id)
        .limit(batch_size)
    )
    if after_id is not None:
        statement = statement.where(Event.id > after_id)
    return list(db.scalars(statement))


def _patch_batch(db, *, after_id: UUID | None, batch_size: int) -> list[CodeChangePatch]:
    statement = (
        select(CodeChangePatch)
        .where(CodeChangePatch.patch.is_not(None))
        .order_by(CodeChangePatch.id)
        .limit(batch_size)
    )
    if after_id is not None:
        statement = statement.where(CodeChangePatch.id > after_id)
    return list(db.scalars(statement))


def reencrypt_sensitive_data(*, batch_size: int, dry_run: bool) -> tuple[int, int]:
    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    db = SessionLocal()
    event_count = 0
    patch_count = 0
    try:
        last_event_id: UUID | None = None
        while rows := _event_batch(db, after_id=last_event_id, batch_size=batch_size):
            for event in rows:
                plaintext = decrypt_event_payload(event.event_type, event.payload)
                if not dry_run:
                    event.payload = encrypt_event_payload(event.event_type, plaintext)
                event_count += 1
            last_event_id = rows[-1].id
            db.rollback() if dry_run else db.commit()

        last_patch_id: UUID | None = None
        while rows := _patch_batch(db, after_id=last_patch_id, batch_size=batch_size):
            for patch in rows:
                plaintext = maybe_decrypt_app_text_from_string(
                    patch.patch,
                    purpose=CODE_CHANGE_PATCH_PURPOSE,
                )
                if plaintext is not None and not dry_run:
                    patch.patch = encrypt_app_text_to_string(
                        plaintext,
                        purpose=CODE_CHANGE_PATCH_PURPOSE,
                    )
                patch_count += 1
            last_patch_id = rows[-1].id
            db.rollback() if dry_run else db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return event_count, patch_count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Re-encrypt stored prompt, response, and diff content with the current key.",
    )
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    event_count, patch_count = reencrypt_sensitive_data(
        batch_size=args.batch_size,
        dry_run=args.dry_run,
    )
    mode = "validated" if args.dry_run else "re-encrypted"
    print(f"{mode} {event_count} event payloads and {patch_count} code patches")


if __name__ == "__main__":
    main()
