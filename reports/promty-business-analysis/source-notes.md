# Promty business assessment source notes

As of: July 17, 2026 (Australia/Brisbane)

## Decision frame

- Audience: product/business stakeholder.
- Decision: whether to continue Promty as a product and whether the public content/community surface should be treated as the primary business.
- Recommendation threshold: 70+ is a conditional go; 55-69 requires a narrower wedge; below 55 should not be the primary business without new evidence.
- Scores are directional analyst judgments, not observed customer metrics.

## Local evidence reviewed

- `README.md`: current collector, memory, security, admin, public-project, and deployment capabilities.
- `docs/memory-architecture.md`: decision-memory direction and context-builder roadmap.
- `docs/artifact-model.md`: event/artifact provenance model.
- `docs/project-status.md`: historical implementation snapshot; treated as stale where it conflicts with the current README and code.
- Repository inspection: 146 commits, approximately 65,676 implementation lines, 192 test files, 32 Alembic migrations, collector version 0.1.4.
- Public GitHub API, July 17, 2026: repository created June 26, 2026; 0 stars, 0 forks, 0 watchers.
- npm downloads API, June 16-July 15, 2026: 468 package downloads. Downloads are not unique users and may include automated or maintainer activity.
- No product analytics, retained-user cohort, revenue, interviews, or willingness-to-pay data were available.

## External evidence reviewed

- Stack Overflow Developer Survey 2025: https://survey.stackoverflow.co/2025/ and https://survey.stackoverflow.co/2025/ai
- GitHub Octoverse 2025, updated February 28, 2026: https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/
- GitHub Copilot Memory: https://docs.github.com/en/copilot/concepts/agents/copilot-memory
- GitHub Copilot Spaces: https://docs.github.com/en/copilot/concepts/context/spaces
- Pieces long-term memory: https://docs.pieces.app/
- Cursor pricing and team context/marketplace: https://cursor.com/pricing
- Windsurf Cascade Memories: https://docs.windsurf.com/windsurf/cascade/memories

## Score calculations

- Core product: weighted sum = 70.05, rounded to 70.
- Content business: weighted sum = 49.80, rounded to 50.
- Execution readiness is high because broad product infrastructure exists; it does not mean product-market fit is proven.
- Distribution is deliberately scored low because package downloads are an ambiguous activity measure and there is no verified retained-user or community evidence.

## Chart map

- Core product score by dimension: horizontal bar; fields `dimension`, `score`; supports the claim that execution and demand are stronger than distribution and monetization.
- Content business score by dimension: horizontal bar; fields `dimension`, `score`; supports the claim that differentiated content is plausible but marketplace economics and cold start are weak.

## Validation review

- Weighted calculations were recomputed independently and sum to the headline scores after rounding.
- Bar charts use a zero baseline and a consistent 0-100 scale.
- Market statistics are attributed to official primary sources.
- Competitive claims are limited to capabilities documented on official product sites.
- Overall confidence: share with caveats. The strategic direction is usable; the commercial scores must be replaced with cohort, activation, retention, interview, and payment evidence after the 90-day validation cycle.
