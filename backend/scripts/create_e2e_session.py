from __future__ import annotations

import argparse
import json

from sqlalchemy import select

from app.core.config import settings
from app.core.security import issue_web_access_token
from app.db.session import SessionLocal
from app.models.users import User


E2E_GITHUB_ID = "promty-e2e-browser"
E2E_USERNAME = "promty-e2e-browser"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage the local browser E2E session.")
    parser.add_argument("--cleanup", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.github_id == E2E_GITHUB_ID))
        if user is not None:
            db.delete(user)
            db.commit()
        if args.cleanup:
            return

        user = User(
            github_id=E2E_GITHUB_ID,
            email="promty-e2e-browser@example.invalid",
            username=E2E_USERNAME,
            preferred_locale="en",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(
            json.dumps(
                {
                    "cookie_name": settings.session_cookie_name,
                    "token": issue_web_access_token(user),
                }
            )
        )


if __name__ == "__main__":
    main()
