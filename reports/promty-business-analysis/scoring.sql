-- Promty business assessment rubric, 2026-07-17.
-- Scores are analyst judgments on a 0-100 scale. Weights sum to 1.0 per domain.

WITH scores(domain, dimension, score, weight, evidence) AS (
  VALUES
    ('Core product', 'Problem urgency', 84, 0.15, 'AI coding adoption is high while accuracy and continuity remain common pain points'),
    ('Core product', 'Market timing', 82, 0.15, 'AI-assisted development and coding-agent usage continue to expand'),
    ('Core product', 'Differentiation', 70, 0.15, 'Cross-tool, event-sourced decision provenance is distinct from generic chat memory'),
    ('Core product', 'Execution readiness', 88, 0.15, 'Collector, backend, memory pipeline, public views, security, and operations are implemented'),
    ('Core product', 'Monetization clarity', 56, 0.15, 'Plausible individual and team plans exist, but willingness to pay is untested'),
    ('Core product', 'Distribution and traction', 39, 0.15, 'Published collector has downloads, but the public repository has no community traction yet'),
    ('Core product', 'Defensibility', 72, 0.10, 'Longitudinal evidence and reviewed decision memory can compound into a switching cost'),
    ('Content business', 'Unique content value', 65, 0.20, 'Verified build stories can be more useful than isolated prompt snippets'),
    ('Content business', 'Supply loop', 52, 0.20, 'Capture is automatic, but creators still need a reason to curate and publish'),
    ('Content business', 'Demand and discovery', 46, 0.20, 'Reader intent and repeat discovery loops are not yet demonstrated'),
    ('Content business', 'Monetization', 36, 0.15, 'Prompt/content marketplace revenue is weak before audience and trust exist'),
    ('Content business', 'Trust and operations', 58, 0.15, 'Safe public contracts exist, but moderation and quality ranking are not mature'),
    ('Content business', 'Cold-start resilience', 31, 0.10, 'A two-sided creator-reader network begins with little inventory or audience')
)
SELECT
  domain,
  dimension,
  score,
  weight,
  ROUND(score * weight, 2) AS weighted_contribution,
  evidence
FROM scores
ORDER BY domain, score DESC;
