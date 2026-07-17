# Promty marketing plan source notes

Generated: 2026-07-17 14:04 AEST

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
- Landing promise: “Your AI tools forget. Promty remembers.” with the Capture → Organize → Continue workflow.
- Current agent bridge: `promty context` and the read-only MCP tool `get_project_context`.
- The deployed release does not contain first-party acquisition attribution or a complete activation/retention funnel. A newer uncommitted working-tree implementation was deliberately excluded from the production baseline.
- Existing 90-day validation gates: 15 design partners; 10 generating a verified memory within 24 hours; 40% week-two return; 5 payments or 3 written team intents; 20 verified build stories with at least 5% save/fork/install action.

## Official operational references

- Google Analytics UTM guidance: https://support.google.com/analytics/answer/10917952?hl=en
- GitHub repository traffic API: https://docs.github.com/en/rest/metrics/traffic?apiVersion=2022-1
- Google Search Console sitemap submission API: https://developers.google.com/webmaster-tools/v1/sitemaps/submit?hl=en
- Amazon SES list management: https://docs.aws.amazon.com/ses/latest/dg/sending-email-list-management.html
- Amazon EventBridge Scheduler with Lambda: https://docs.aws.amazon.com/lambda/latest/dg/with-eventbridge-scheduler.html
- ACMA Spam Act compliance guidance: https://www.acma.gov.au/avoid-sending-spam
- LinkedIn automated activity policy: https://www.linkedin.com/help/linkedin/answer/a1340567
