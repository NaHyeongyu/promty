from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.encryption import EncryptionError, decrypt_github_token
from app.models.github_connections import GitHubConnection
from app.models.marketing_content import MarketingContent
from app.models.project_memory_batches import ProjectMemoryBatch, ProjectMemoryBatchItem
from app.models.projects import Project
from app.models.public_project_views import PublicProjectView
from app.models.published_flows import (
    PublishedFlow,
    PublishedFlowAsset,
    PublishedFlowComment,
    PublishedFlowReaction,
)
from app.models.tokens import CollectorToken
from app.models.users import User
from app.services.github_oauth import revoke_github_access_token
from app.services.published_flow_asset_storage import delete_published_flow_asset


logger = logging.getLogger(__name__)


def _count(db: Session, statement: Any) -> int:
    return int(db.scalar(statement) or 0)


def delete_memory_batch_items_for_projects(db: Session, project_ids: Any) -> None:
    batch_ids = select(ProjectMemoryBatch.id).where(
        ProjectMemoryBatch.project_id.in_(project_ids)
    )
    db.execute(
        delete(ProjectMemoryBatchItem).where(ProjectMemoryBatchItem.batch_id.in_(batch_ids))
    )


def delete_user_account_data(db: Session, *, user: User) -> dict[str, Any]:
    """Permanently delete a user and data that can identify or be owned by them.

    Published flows are independent snapshots whose foreign keys historically used
    SET NULL. Delete them explicitly so account deletion does not leave prompt,
    response, diff, or image content behind.
    """

    user_id = user.id
    owned_project_ids = select(Project.id).where(Project.owner_id == user_id)
    owned_flow_ids = select(PublishedFlow.id).where(PublishedFlow.author_id == user_id)

    counts = {
        "collector_tokens": _count(
            db,
            select(func.count(CollectorToken.id)).where(CollectorToken.user_id == user_id),
        ),
        "projects": _count(
            db,
            select(func.count(Project.id)).where(Project.owner_id == user_id),
        ),
        "published_flows": _count(
            db,
            select(func.count(PublishedFlow.id)).where(PublishedFlow.author_id == user_id),
        ),
    }

    asset_rows = db.execute(
        select(PublishedFlowAsset.id, PublishedFlowAsset.storage_key).where(
            or_(
                PublishedFlowAsset.author_id == user_id,
                PublishedFlowAsset.published_flow_id.in_(owned_flow_ids),
            )
        )
    ).all()
    github_connection = db.scalar(
        select(GitHubConnection).where(GitHubConnection.user_id == user_id)
    )

    if github_connection is not None:
        try:
            access_token = decrypt_github_token(github_connection.access_token_encrypted)
            if not revoke_github_access_token(access_token):
                logger.warning("GitHub token revocation was not confirmed for deleted user %s", user_id)
        except EncryptionError:
            logger.warning("GitHub token could not be decrypted before deleting user %s", user_id)

    # Batch-item snapshot references are RESTRICTed, so remove them before the
    # project cascade reaches their artifacts and artifact versions.
    delete_memory_batch_items_for_projects(db, owned_project_ids)

    # These records intentionally use SET NULL at the schema level for ordinary
    # moderation/history behavior. Account deletion is stricter and removes them.
    db.execute(delete(PublicProjectView).where(PublicProjectView.viewer_id == user_id))
    db.execute(delete(PublishedFlowComment).where(PublishedFlowComment.author_id == user_id))
    db.execute(delete(PublishedFlowReaction).where(PublishedFlowReaction.author_id == user_id))
    db.execute(delete(MarketingContent).where(MarketingContent.creator_id == user_id))
    db.execute(
        delete(PublishedFlowAsset).where(
            or_(
                PublishedFlowAsset.author_id == user_id,
                PublishedFlowAsset.published_flow_id.in_(owned_flow_ids),
            )
        )
    )
    db.execute(delete(PublishedFlow).where(PublishedFlow.author_id == user_id))
    db.execute(
        delete(User).where(User.id == user_id).execution_options(synchronize_session="fetch")
    )
    db.flush()
    db.expire_all()

    # Storage deletion is idempotent. The storage helper intentionally tolerates
    # an already-missing object, which keeps retries safe.
    for _asset_id, storage_key in asset_rows:
        if not delete_published_flow_asset(storage_key):
            logger.warning(
                "Published-flow asset cleanup was not confirmed for deleted user %s: %s",
                user_id,
                storage_key,
            )

    return counts
