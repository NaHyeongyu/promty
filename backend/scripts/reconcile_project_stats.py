from __future__ import annotations

import argparse

from app.db.session import SessionLocal
from app.services.projects.stats import count_project_stats_drift, reconcile_project_stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check or repair incrementally maintained project statistics."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Report drift without changing project statistics.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    with SessionLocal() as db:
        drifted = count_project_stats_drift(db)
        if args.check:
            print(f"project_stats drifted projects: {drifted}")
            return 1 if drifted else 0

        reconciled = reconcile_project_stats(db)
        db.commit()
        remaining = count_project_stats_drift(db)
        print(
            f"project_stats reconciled projects: {reconciled}; "
            f"remaining drift: {remaining}"
        )
        return 1 if remaining else 0


if __name__ == "__main__":
    raise SystemExit(main())
