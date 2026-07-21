# Security and Privacy Incident Response

## Report and triage

Route suspected vulnerabilities to security@promty.org and account, privacy, or content issues to Promty Support. Record the reporter, discovery time, affected systems/data, indicators, and initial severity. Do not place secrets or exposed personal information in public tickets.

Severity is based on confidentiality, integrity, availability, affected people, exploitability, privilege, and ongoing harm. A high-severity incident receives an incident lead, a restricted response channel, preserved evidence, and immediate containment work.

## Response sequence

1. **Validate and contain:** confirm the event, revoke exposed credentials, isolate affected workloads or routes, preserve necessary logs, and stop continuing disclosure.
2. **Assess:** determine affected records, people, locations, time window, access level, likely harm, and whether data was encrypted or otherwise protected.
3. **Eradicate and recover:** remove the cause, patch, rotate secrets, validate backups, monitor for recurrence, and restore service in controlled stages.
4. **Notify and communicate:** use accurate, approved updates. Notify affected users, providers, insurers, law enforcement, regulators, or contractual partners where required.
5. **Review:** document timeline, root cause, decisions, evidence, corrective actions, owners, deadlines, and lessons learned.

## Australian Notifiable Data Breaches assessment

Where an eligible data breach may have occurred, Promty must promptly conduct and document a reasonable and expeditious assessment. The assessment target is completion within 30 calendar days of becoming aware of reasonable grounds to suspect an eligible breach. If serious harm is likely and remedial action does not remove that risk, prepare notification to the Office of the Australian Information Commissioner and affected individuals as required.

## Readiness checklist

- Maintain monitored security@promty.org and support@promty.org mailboxes.
- Keep current owners and out-of-band contact details for application, AWS, GitHub, OpenAI, Google, legal/privacy, and communications.
- Test session/token revocation, secret rotation, database restore, and deletion-tombstone replay at least annually.
- Retain incident evidence only as long as needed for investigation and legal obligations, with restricted access.
- Track corrective actions to closure and verify their effectiveness.
