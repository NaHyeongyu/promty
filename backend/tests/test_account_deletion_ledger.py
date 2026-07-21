from __future__ import annotations

from dataclasses import replace
from uuid import uuid4

from app.core.config import settings
from app.services import account_deletion_ledger


def test_local_account_deletion_ledger_round_trip(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(
        account_deletion_ledger,
        "settings",
        replace(
            settings,
            published_flow_asset_root=str(tmp_path / "published-flow-assets"),
            published_flow_asset_storage="local",
        ),
    )
    user_id = uuid4()

    assert account_deletion_ledger.record_account_deletion_tombstone(user_id) is True

    tombstones = list(account_deletion_ledger.iter_account_deletion_tombstones())
    assert tombstones == [
        {
            "deleted_at": tombstones[0]["deleted_at"],
            "schema_version": 1,
            "user_id": str(user_id),
        }
    ]
    assert account_deletion_ledger.remove_account_deletion_tombstone(user_id) is True
    assert list(account_deletion_ledger.iter_account_deletion_tombstones()) == []
