# Account deletion policy

Last updated: 2026-07-21

## Policy

Promty provides immediate, permanent account deletion from **Profile → Data &
Privacy → Delete account**. A signed-in member must enter their exact username
and explicitly acknowledge that deletion cannot be recovered.

Deletion has no cooling-off period. After the request succeeds, all Promty web
sessions are signed out and Collector credentials stop working. Signing in with
the same GitHub identity later creates a new account; previous projects and
content are not restored.

The configured administrator account cannot delete itself. This prevents the
service from losing its only operational administrator. Administrator rotation
must happen before that identity can be removed.

## Data deleted immediately

- account identity, email, avatar reference, preferences, and suspension state;
- web sessions, Collector tokens, devices, and encrypted GitHub credentials;
- projects, sessions, events, prompt/response payloads, code-change patches,
  repository metadata, generated memories, files, statistics, and jobs;
- published prompt flows and their prompt/response snapshots, diffs, images,
  comments, reactions, and other community records owned by the member;
- the member's comments, reactions, saves, and identifiable public-view history
  on content owned by other members;
- support inquiries stored in Promty, including the reply email snapshot; and
- marketing drafts created by the member.

Uploaded community image objects are removed from the configured local or S3
asset store. Promty also asks GitHub to revoke a stored OAuth access token before
discarding the encrypted credential. Local deletion still completes if GitHub
is temporarily unavailable so Promty does not retain the credential.

## Limited residual copies

Primary application data is removed in the deletion transaction. Encrypted
infrastructure backups may retain a pre-deletion copy until the backup expires;
production backup retention must not exceed 30 days. Backups are not used to
restore an individual account. If a disaster recovery restore reintroduces a
deleted identity, the deletion must be replayed before normal service resumes.
A minimal tombstone containing only the Promty user UUID and deletion timestamp
is stored outside PostgreSQL for 35 days so deletion can be replayed against the
entire 30-day backup window.

Messages already delivered to an operator mailbox from a support inquiry, and
requests already submitted to an external AI or GitHub provider, cannot be
recalled by the database transaction. Those copies remain subject to the
operator mailbox and provider retention controls. Promty must not create new
copies after the account deletion succeeds.

Administrator audit records contain the deletion action, request path, actor,
target user UUID, status, and timestamp, but not the target's email, prompts,
responses, or source content. They expire according to
`PROMTY_ADMIN_AUDIT_RETENTION_DAYS` (180 days by default).

## API contract

`DELETE /api/account` requires an authenticated web session and this JSON body:

```json
{
  "acknowledge_permanent_deletion": true,
  "confirmation": "exact-username"
}
```

Before the database transaction commits, the endpoint must persist a minimal
restore-replay tombstone outside PostgreSQL. If that write fails, the database
transaction is rolled back; if the database commit then fails, the tombstone is
removed. The endpoint returns only after the database deletion commits and
clears both access and refresh cookies. A failed validation or transaction
leaves the account active. The operation is intentionally not reversible.

Administrators may apply the same deletion behavior through
`DELETE /api/admin/users/{user_id}` after entering the target username.

## Operational requirements

- Keep foreign keys for ordinary content lifecycle behavior, but route account
  deletion through `delete_user_account_data` so `SET NULL` community records
  are removed rather than anonymized in place.
- Keep deletion tests covering projects, published content, community activity,
  credentials, and session-cookie clearing.
- Configure production backup expiry at 30 days or less and document the actual
  infrastructure value next to the deployment inventory.
- After restoring a database backup, run
  `python scripts/replay_account_deletions.py` in dry-run mode and then repeat
  with `--apply` before reopening the service.
- Treat a storage or provider revocation warning as an operational alert and
  retry cleanup without recreating the deleted account.
