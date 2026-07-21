# Promty Data Retention Policy

Effective: 21 July 2026  
Owner: Promty service operator

## Principles

Promty retains personal and customer data only for a defined product, security, support, or legal purpose. Deletion must cover primary records, dependent records, stored assets, credentials, and backup restoration controls. A legal or security hold must be documented, scoped, access-controlled, and removed when no longer necessary.

## Retention schedule

| Data | Active retention | Deletion trigger | Residual window |
| --- | --- | --- | --- |
| Account profile and settings | Account lifetime | Account deletion | Database backups: up to 30 days |
| Projects, sessions, prompts, responses, file-change metadata, memory | Until project/account deletion | Project or account deletion | Database backups: up to 30 days |
| Published flows, comments, reactions, views, and assets | Until unpublish/archive/delete or account deletion | User action, moderation, or account deletion | Assets' deleted object versions: up to 30 days |
| Active web sessions and Collector tokens | Until expiry, revocation, or account deletion | Expiry/revocation/deletion | Revocation metadata may remain with security records |
| GitHub OAuth credentials | Until disconnect, revocation, or account deletion | Disconnect/revocation/deletion | Provider records follow GitHub controls |
| Support, privacy, and moderation correspondence | While open and as needed to resolve/follow up | Operational review after closure | Must be reviewed at least annually; legal/security holds may extend |
| Admin audit events and operational security logs | According to configured audit/log retention | Automated expiry or documented review | Longer only for an active incident or legal hold |
| Database backup objects | 30 days | S3 lifecycle expiry | Non-current object versions: 1 day |
| Account-deletion restore tombstones | 35 days | S3 lifecycle expiry | Non-current object versions: 1 day |

## Required controls

1. Production deployment must apply `infra/aws/promty-assets-lifecycle.json` to the private asset bucket.
2. A database restore must run `backend/scripts/replay_account_deletions.py --apply` before restored service access is enabled.
3. Deleted published assets must be removed from active storage immediately; versioned residuals expire through lifecycle rules.
4. Admin audit and log retention configuration must be checked during each production release and recorded in the release evidence.
5. Support and moderation records must receive an annual necessity review until automated closed-case expiry is implemented.
6. Exceptions require a documented purpose, owner, scope, start date, and review/removal date.
