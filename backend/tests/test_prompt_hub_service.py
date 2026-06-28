from __future__ import annotations

from decimal import Decimal
import unittest
from unittest.mock import patch
from uuid import uuid4

from app.models.published_prompts import PublishedPrompt
from app.schemas.prompt_hub import PromptHubDraftFromActivityRequest, PromptHubUpdateRequest
from app.services import prompt_hub


class FakeResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return self._values


class FakeDB:
    def __init__(self):
        self.added = []
        self.committed = False
        self.refreshed = []
        self.rollback_called = False
        self.scalar_values = []
        self.execute_values = []

    def scalar(self, _query):
        if self.scalar_values:
            return self.scalar_values.pop(0)
        return None

    def execute(self, _query):
        if self.execute_values:
            return FakeResult(self.execute_values.pop(0))
        return FakeResult([])

    def add(self, value):
        self.added.append(value)

    def flush(self):
        for value in self.added:
            if getattr(value, "id", None) is None:
                value.id = uuid4()

    def commit(self):
        self.committed = True

    def refresh(self, value):
        self.refreshed.append(value)

    def rollback(self):
        self.rollback_called = True


class PromptHubServiceTest(unittest.TestCase):
    def test_create_draft_from_activity_uses_available_context(self):
        project_id = uuid4()
        prompt_event_id = uuid4()
        session_id = uuid4()
        user_id = uuid4()
        db = FakeDB()
        project = type("Project", (), {"id": project_id})()
        session = type("Session", (), {"id": session_id, "model": "gpt-5", "tool": "codex-cli"})()
        prompt_event = type(
            "Event",
            (),
            {
                "id": prompt_event_id,
                "project_id": project_id,
                "session_id": session_id,
                "tool": "codex-cli",
            },
        )()
        response_event = object()
        user = type("User", (), {"id": user_id})()

        with (
            patch.object(prompt_hub, "_project_for_user", return_value=project),
            patch.object(prompt_hub, "_find_prompt_event", return_value=(prompt_event, session)),
            patch.object(prompt_hub, "_response_for_prompt", return_value=response_event),
            patch.object(
                prompt_hub,
                "_payload",
                side_effect=[
                    {"prompt": "Build a timeline", "model": "gpt-5"},
                    {"response": "Implemented timeline UI"},
                ],
            ),
            patch.object(
                prompt_hub,
                "_source_file_changes",
                return_value=[
                    {
                        "additions": 12,
                        "change_type": "modified",
                        "deletions": 3,
                        "diff": "@@ diff",
                        "file_path": "frontend/src/App.tsx",
                        "language": "TSX",
                    }
                ],
            ),
            patch.object(prompt_hub, "_events_count", return_value=7),
            patch.object(prompt_hub, "_unique_slug", return_value="build-a-timeline"),
        ):
            draft = prompt_hub.create_draft_from_activity(
                db,
                payload=PromptHubDraftFromActivityRequest(
                    activity_id=prompt_event_id,
                    include_diff=True,
                    include_files=True,
                    project_id=project_id,
                    title="Build a timeline",
                ),
                user=user,
            )

        self.assertTrue(db.committed)
        self.assertEqual(draft.prompt_text, "Build a timeline")
        self.assertEqual(draft.result_summary, "Implemented timeline UI")
        self.assertEqual(draft.metrics["files_changed"], 1)
        self.assertEqual(draft.metrics["lines_added"], 12)
        self.assertEqual(len(db.added), 2)

    def test_list_published_prompts_returns_public_rows(self):
        prompt = PublishedPrompt(
            metrics={},
            prompt_text="Prompt",
            shared_scope={},
            slug="public-prompt",
            status="published",
            tags=[],
            title="Public prompt",
            visibility="public",
        )
        prompt.id = uuid4()
        db = FakeDB()
        db.execute_values = [[prompt]]

        rows = prompt_hub.list_published_prompts(db)

        self.assertEqual(rows, [prompt])

    def test_get_published_prompt_detail_returns_prompt(self):
        prompt = PublishedPrompt(
            metrics={},
            prompt_text="Prompt",
            shared_scope={},
            slug="detail-prompt",
            status="published",
            tags=[],
            title="Detail prompt",
            visibility="public",
        )
        prompt.id = uuid4()
        db = FakeDB()
        db.scalar_values = [prompt]

        found = prompt_hub.get_published_prompt_detail(db, slug="detail-prompt")

        self.assertEqual(found, prompt)

    def test_unique_slug_adds_suffix_when_slug_exists(self):
        existing_id = uuid4()
        db = FakeDB()
        db.scalar_values = [existing_id, None]

        slug = prompt_hub._unique_slug(db, "My Great Prompt")

        self.assertEqual(slug, "my-great-prompt-2")

    def test_update_draft_metadata_normalizes_tags_and_scores(self):
        user_id = uuid4()
        prompt = PublishedPrompt(
            author_id=user_id,
            metrics={},
            prompt_text="Initial prompt",
            shared_scope={},
            slug="old-title",
            status="draft",
            tags=[],
            title="Old title",
            visibility="private",
        )
        prompt.id = uuid4()
        db = FakeDB()
        db.scalar_values = [None]
        db.get = lambda _model, _id: prompt
        user = type("User", (), {"id": user_id})()

        updated = prompt_hub.update_prompt_draft(
            db,
            payload=PromptHubUpdateRequest(
                title="Better Prompt",
                tags=["Frontend", "frontend", " Refactor "],
                score_overall=91.5,
                visibility="public",
            ),
            prompt_id=prompt.id,
            user=user,
        )

        self.assertTrue(db.committed)
        self.assertEqual(updated.slug, "better-prompt")
        self.assertEqual(updated.tags, ["frontend", "refactor"])
        self.assertEqual(updated.score_overall, Decimal("91.5"))

    def test_publish_prompt_sets_status_and_timestamp(self):
        user_id = uuid4()
        prompt = PublishedPrompt(
            author_id=user_id,
            metrics={},
            prompt_text="Ship this feature",
            shared_scope={},
            slug="ship-this-feature",
            status="draft",
            tags=[],
            title="Ship this feature",
            visibility="public",
        )
        prompt.id = uuid4()
        db = FakeDB()
        db.get = lambda _model, _id: prompt
        user = type("User", (), {"id": user_id})()

        published = prompt_hub.publish_prompt(db, prompt_id=prompt.id, user=user)

        self.assertTrue(db.committed)
        self.assertEqual(published.status, "published")
        self.assertIsNotNone(published.published_at)

    def test_public_publish_requires_prompt_text(self):
        user_id = uuid4()
        prompt = PublishedPrompt(
            author_id=user_id,
            metrics={},
            prompt_text="",
            shared_scope={},
            slug="empty-public",
            status="draft",
            tags=[],
            title="Empty public",
            visibility="public",
        )
        prompt.id = uuid4()
        db = FakeDB()
        db.get = lambda _model, _id: prompt
        user = type("User", (), {"id": user_id})()

        with self.assertRaises(prompt_hub.PromptHubValidationError):
            prompt_hub.publish_prompt(db, prompt_id=prompt.id, user=user)


if __name__ == "__main__":
    unittest.main()
