# FAQ and Support Inquiries

The authenticated workspace exposes **Help & support** at `?view=support`.
The page combines searchable FAQ content with a signed-in inquiry form.

## Submission flow

```text
Signed-in user
  -> POST /api/support/inquiries
  -> validate category, reply email, subject, and message
  -> encrypt subject and message with the application encryption key
  -> store support_inquiries row
  -> send an AWS SES notification
  -> record sent, failed, or disabled notification status
```

The database commit happens before the email attempt. An SES outage therefore
does not discard the inquiry. Notification failures are logged and stored on the
inquiry row for later operational review.

The notification uses the requester's address as `Reply-To`, so replying to the
email starts a direct support conversation without exposing an operator address
in the product UI.

## Runtime configuration

```text
PROMTY_SUPPORT_EMAIL_PROVIDER=ses
PROMTY_SUPPORT_NOTIFICATION_EMAILS=owner@example.com
PROMTY_SUPPORT_FROM_EMAIL=support@promty.org
PROMTY_SUPPORT_RATE_LIMIT_REQUESTS=5
PROMTY_SUPPORT_RATE_LIMIT_WINDOW_SECONDS=300
PROMTY_AWS_REGION=ap-southeast-2
```

`PROMTY_SUPPORT_NOTIFICATION_EMAILS` accepts a comma-separated list. When it
is empty, inquiries are still stored and their notification status is
`disabled`.

For production SES delivery:

1. Verify `promty.org` (or the configured sender address) as an SES identity in
   the same AWS region as `PROMTY_AWS_REGION`.
2. Grant the backend instance role `ses:SendEmail` for that identity.
3. Create the `promty/prod/support-notification-email` Secrets Manager value
   containing the private operator recipient address.
4. Add the configuration to `/opt/promty/backend.env` and restart the backend.
5. Submit one test inquiry and confirm both the `support_inquiries` row and the
   received email.

If the SES account is still in sandbox mode, the sender and recipient identities
must both be verified. Production access removes the recipient-verification
requirement.

## Stored data

- `subject` and `message` use the same AES-256-GCM application encryption layer
  as other sensitive product text.
- requester username and reply email are stored as a submission-time snapshot.
- deleting a user cascades to that user's inquiries so account deletion does not
  retain the support message or reply address.
- inquiry bodies are never included in the public API response or access logs.

Account-level deletion requests are now self-service from **Profile → Data &
Privacy → Delete account**. See [Account deletion policy](account-deletion-policy.md)
for the deletion scope, confirmation requirements, and limited residual copies.
