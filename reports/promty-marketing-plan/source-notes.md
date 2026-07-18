# Promty marketing plan source notes

Generated: 2026-07-17 14:04 AEST<br>
Strategy update: 2026-07-19 AEST

## Production aggregate baseline

Read-only aggregate query executed against the production PostgreSQL database through the running `promty-backend` container. No names, email addresses, GitHub IDs, project names, prompt text, response text, file paths, or other user-level records were selected.

```sql
SELECT
  (SELECT count(*) FROM users) AS total_users,
  (SELECT count(*) FROM users WHERE created_at >= now() - interval '7 days') AS users_7d,
  (SELECT count(*) FROM users WHERE created_at >= now() - interval '30 days') AS users_30d,
  (SELECT count(DISTINCT user_id) FROM collector_tokens WHERE revoked_at IS NULL) AS authorized_collectors,
  (SELECT count(DISTINCT user_id) FROM collector_tokens
    WHERE revoked_at IS NULL AND last_used_at >= now() - interval '7 days') AS active_collectors_7d,
  (SELECT count(DISTINCT user_id) FROM collector_tokens
    WHERE revoked_at IS NULL AND last_used_at >= now() - interval '30 days') AS active_collectors_30d,
  (SELECT count(DISTINCT owner_id) FROM projects) AS users_with_projects,
  (SELECT count(DISTINCT p.owner_id) FROM events e
    JOIN projects p ON p.id = e.project_id) AS users_with_events,
  (SELECT count(DISTINCT p.owner_id) FROM artifacts a
    JOIN projects p ON p.id = a.project_id
    WHERE a.type = 'MemoryTask'
      AND a.metadata ->> 'artifact_stage' IN ('generated_memory', 'verified_memory')
      AND a.metadata ->> 'review_state' IN ('generated', 'verified')) AS users_with_generated_memory,
  (SELECT count(*) FROM projects WHERE visibility = 'public') AS public_projects;
```

Result:

```json
{
  "total_users": 2,
  "users_7d": 2,
  "users_30d": 2,
  "authorized_collectors": 1,
  "active_collectors_7d": 1,
  "active_collectors_30d": 1,
  "users_with_projects": 1,
  "users_with_events": 1,
  "users_with_generated_memory": 0,
  "public_projects": 0
}
```

## Repository evidence

- Production release reference reviewed: `origin/master` at merge commit `9fcd890`.
- The current working-tree positioning is: “Your AI tools can read the code. Promty remembers why it became this code.” The supporting value flow is Capture → Compile → Continue.
- The deployed release reviewed for the production baseline used the earlier promise: “Your AI tools forget. Promty remembers.” with the Capture → Organize → Continue workflow.
- Current agent bridge: `promty context` and the read-only MCP tool `get_project_context`.
- The deployed release does not contain first-party acquisition attribution or a complete activation/retention funnel. A newer uncommitted working-tree implementation was deliberately excluded from the production baseline.
- Existing 90-day validation gates: 15 design partners; 10 generating a verified memory within 24 hours; 40% week-two return; 5 payments or 3 written team intents; 20 verified build stories with at least 5% save/fork/install action.

## Recruitment strategy assumptions

- The first recruiting cohort is intentionally narrow: developers working repeatedly in a long-lived Git repository with Codex CLI or Claude Code, especially people who change AI tools, resume work after a gap, or hand work to another person or agent.
- “Founding 15” channel allocations are operating capacity targets, not observed conversion forecasts or external benchmarks: 8 partners from founder-led direct outreach, 4 from build-in-public stories and demos, and 3 from developer communities.
- Installation is a one-command, self-serve action. The proposed three-week recruiting cadence therefore tracks 15 users through install and first value rather than reserving onboarding sessions. The pass gate remains 10 verified memories within 24 hours; outreach and optional feedback-call counts are diagnostic inputs rather than success metrics.
- Product Hunt and Show HN are treated as later amplification moments. They should follow a tryable product path, at least 5-10 activated users, and several consented stories rather than being used to discover whether onboarding works.
- Case-study consent is separate from product participation. Private prompts, responses, source files, paths, secrets, and personal data are never required for the design-partner program or public proof.

## Current feature value inventory

The feature map is based on current repository implementation and user-facing documentation, not the future roadmap.

- `README.md`: one-command repository setup, Codex CLI and Claude Code support, Capture → Compile → Continue, local durable queue, Project Memory, CLI context, selected-repository collection, encryption, owner scope, read-only MCP, and GitHub linking.
- `docs/event-spec-v1.md`: tool payload normalization, stable events, local JSONL queue, bounded diffs, and sensitive-path exclusions.
- `docs/memory-architecture.md`: current draft → generated memory → Project Memory pipeline, user-triggered generation, editable or removable memory, and structured fields such as reason, outcome, changed files, and next context. Items explicitly listed under “Next Build Order” were excluded from current marketing claims.
- `docs/agent-context.md`: `promty context`, structured JSON output, owner-scoped collector authentication, and the read-only `get_project_context` MCP tool.
- `frontend/src/i18n/I18nProvider.tsx` and the project/community implementation: review queue, private-by-default project content, reversible public visibility, public project discovery, curated prompt-flow sharing, owner review, masking, saves, and view analytics.
- `backend/app/services/memory/project_memory.py`, `backend/app/services/memory/artifacts.py`, and artifact version models: generated, edited, and verified review states plus durable artifact versions.

Marketing hierarchy is a product-positioning recommendation, not observed user preference: Project Memory is the hero; setup, interoperability, CLI/MCP, and source links are proof; review and security controls are trust; community sharing is growth. The feature map uses a spacious exact-lookup table rather than a chart because the evidence is qualitative and no observed feature-importance scores exist. Ranking these features in a chart would imply unsupported quantitative precision.

Executive report role mapping is preserved as follows: the existing Executive Summary answers the acquisition decision; baseline, target, ICP, feature value map, channel allocation, and operating plan form the key findings and evidence; the existing next steps, further questions, and caveats sections retain their required roles.

## Official operational references

- Google Analytics UTM guidance: https://support.google.com/analytics/answer/10917952?hl=en
- GitHub repository traffic API: https://docs.github.com/en/rest/metrics/traffic?apiVersion=2022-1
- Google Search Console sitemap submission API: https://developers.google.com/webmaster-tools/v1/sitemaps/submit?hl=en
- Amazon SES list management: https://docs.aws.amazon.com/ses/latest/dg/sending-email-list-management.html
- Amazon EventBridge Scheduler with Lambda: https://docs.aws.amazon.com/lambda/latest/dg/with-eventbridge-scheduler.html
- ACMA Spam Act compliance guidance: https://www.acma.gov.au/avoid-sending-spam
- LinkedIn automated activity policy: https://www.linkedin.com/help/linkedin/answer/a1340567
- Hacker News Show HN guidelines: https://news.ycombinator.com/showhn.html
- Hacker News submission guidelines: https://news.ycombinator.com/newsguidelines.html
- Product Hunt featuring guidelines: https://help.producthunt.com/en/articles/9883485-product-hunt-featuring-guidelines
- Product Hunt posting guide: https://help.producthunt.com/en/articles/479557-how-to-post-a-product
- Reddit spam policy: https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam
