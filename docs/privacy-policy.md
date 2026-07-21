# Promty Privacy Notice

Effective: 21 July 2026  
Contact: support@promty.org

Promty provides project-memory and collaboration tools for AI-assisted software work. This notice explains how Promty collects, uses, discloses, retains, and protects personal information.

## Information collected

Promty may collect:

- GitHub identifiers, username, email, avatar, OAuth scopes, and encrypted connection credentials;
- web sessions, revocable Collector tokens, IP address, user agent, and security timestamps;
- project and repository metadata;
- prompts, AI responses, session events, file-change metadata, and generated Project Memory submitted through an authorised Collector;
- profile details, content a user chooses to publish, uploaded assets, comments, reactions, and public-content views; and
- support inquiries, privacy requests, moderation reports, and related correspondence.

Users must not submit secrets, credentials, regulated personal information, or another person's confidential or personal information unless authorised to do so.

## Purposes

Promty uses information to authenticate users; operate, support, and secure the service; collect authorised project activity; generate and display Project Memory; provide publishing and community features requested by users; investigate abuse; meet legal obligations; and improve reliability. Promty does not sell personal information.

## External AI processing

External AI processing is optional and separately controlled. If enabled, reviewed project context may be sent to the configured provider—OpenAI or Google Gemini—to generate Project Memory. The account confirmation screen identifies configured providers. Disabling the choice blocks external AI generation without disabling ordinary workspace features.

OpenAI API requests use `store: false` where supported. Provider security, abuse-monitoring, and legally required retention can still apply. Provider terms and data controls may change independently of Promty.

## Service providers and overseas disclosure

Promty uses GitHub for identity and optional repository access; Amazon Web Services for Australian-region application hosting, storage, email, and backup infrastructure; and, only where enabled, OpenAI or Google for AI generation. These providers may process information outside Australia, including in the United States and other countries in which they operate. Promty may also disclose information when legally required or reasonably necessary to protect users, rights, or service security.

## Public content

Projects and prompt flows are private by default. When a user publishes content, the publishing screen indicates what will be visible. Selected project overviews, generated memory, reviewed prompts and responses, images, profile identity, and community interactions may become visible to other members or the public. Unpublishing prevents new access through Promty, but copies already lawfully accessed by others may remain outside Promty's control.

## Retention and deletion

- Active account and project data remains until the user deletes the relevant project or account, or Promty must remove it for security, abuse, or legal reasons.
- Revoked access tokens and security/audit metadata may remain long enough to demonstrate revocation and investigate abuse.
- Account deletion removes active-database records and owned assets immediately, subject to narrow legal, dispute, fraud, or security preservation requirements.
- Encrypted database backup objects expire after 30 days.
- A minimal deletion tombstone containing only user ID and deletion time remains outside the database for up to 35 days, solely to prevent a restored backup from recreating the account.
- Provider-side records follow the applicable provider terms and controls.

The operational detail is maintained in [data-retention-policy.md](data-retention-policy.md) and [account-deletion-policy.md](account-deletion-policy.md).

## Access, correction, choices, and complaints

Users can update account preferences, revoke Collector tokens, disconnect GitHub, unpublish or delete projects, disable external AI processing, and permanently delete an account from Profile → Data & Privacy.

Requests for access to or correction of personal information, questions about retention, and privacy complaints can be submitted through Promty Support or support@promty.org. Promty will verify identity before fulfilling sensitive requests and respond within a reasonable period. If a complaint is not resolved, the person may contact the Office of the Australian Information Commissioner.

## Security and changes

Promty uses access controls, encryption, scoped credentials, audit records, and backups. No system is completely secure. Vulnerabilities should be reported privately under [SECURITY.md](../SECURITY.md).

Material changes to this notice will be dated and presented for acknowledgement where appropriate.
