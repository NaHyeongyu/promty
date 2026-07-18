# Bilingual marketing content studio

The administrator console includes a Marketing section for turning one verified
source story into Korean and English channel variants. Content moves through:

```text
draft -> review -> approved -> scheduled/published
```

The generator supports X, Threads, Bluesky, LinkedIn, DEV.to, GitHub Discussions,
Reddit, and Hacker News. OpenAI is preferred when configured, then Gemini, then a
deterministic bilingual-safe template. Generated facts are constrained to the
administrator-provided source title and summary; private prompts, responses, file
paths, secrets, and personal data must never be added to the source brief.

## Delivery boundaries

- Buffer uses its official GraphQL API for X, Threads, Bluesky, and LinkedIn.
- DEV.to receives unpublished article drafts through the Forem API.
- GitHub Discussions are created through GitHub's GraphQL API.
- Reddit and Hacker News remain copy-only. Promty generates community-specific
  drafts but does not mass-post, comment, vote, or message users.
- External delivery requires an approved campaign. Manual copy remains available
  during review.

Every generated CTA receives lowercase `utm_source`, `utm_medium`, `utm_campaign`,
and `utm_content` parameters. The `utm_content` value includes the campaign ID,
language, and channel so Korean and English activation can be compared separately.

## Configuration

```text
PROMTY_BUFFER_API_KEY=
PROMTY_BUFFER_CHANNEL_IDS={"x":"buffer-channel-id","linkedin.ko":"korean-linkedin-channel-id","linkedin.en":"english-linkedin-channel-id"}
PROMTY_DEVTO_API_KEY=
PROMTY_DEVTO_ORGANIZATION_ID=
PROMTY_GITHUB_MARKETING_TOKEN=
PROMTY_GITHUB_MARKETING_REPOSITORY_ID=
PROMTY_GITHUB_MARKETING_DISCUSSION_CATEGORY_ID=
```

Buffer channel keys may be a base channel (`x`) or locale-specific
(`<channel>.ko` / `<channel>.en`). The locale-specific value takes precedence.
This allows one bilingual account or separate Korean and English profiles.

The GitHub repository and discussion category values are GraphQL node IDs, not
repository names. Keep Buffer, DEV.to, and GitHub credentials in the production
secret store and never expose them to the frontend. The integration-status endpoint
returns only configured flags and channel key names.

## Administrator workflow

1. Create a source story with only verified public facts and a CTA URL.
2. Select channels and generate Korean plus English variants.
3. Review the two languages side by side and save any edits.
4. Approve the complete bilingual campaign.
5. Create Buffer drafts, add posts to the queue, schedule an exact time, create a
   DEV.to draft, publish a GitHub Discussion, or copy community content manually.
6. Use the stored external IDs, URLs, and UTM values to connect channel activity to
   signup and first-memory activation.
