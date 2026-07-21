from __future__ import annotations

import argparse
from uuid import UUID

from app.db.session import SessionLocal
from app.models.users import User
from app.services.account_deletion import delete_user_account_data
from app.services.account_deletion_ledger import iter_account_deletion_tombstones


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Replay account deletions after restoring a PostgreSQL backup."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit deletions. Without this flag, only report matching restored users.",
    )
    args = parser.parse_args()

    deleted = 0
    matched = 0
    with SessionLocal() as db:
        for tombstone in iter_account_deletion_tombstones():
            user_id = UUID(str(tombstone["user_id"]))
            user = db.get(User, user_id)
            if user is None:
                continue
            matched += 1
            print(f"matched restored user {user_id}")
            if args.apply:
                delete_user_account_data(db, user=user)
                db.commit()
                deleted += 1

    print(f"matched={matched} deleted={deleted} apply={args.apply}")


if __name__ == "__main__":
    main()
