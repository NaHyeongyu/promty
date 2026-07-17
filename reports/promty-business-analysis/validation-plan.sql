-- Proposed 90-day validation gates for Promty.

SELECT *
FROM (
  VALUES
    (1, '1-30 days', '15 design partners', '10 create a verified memory within 24 hours', 'Validate problem and onboarding'),
    (2, '31-60 days', 'Measure recall and handoff reuse', '40 percent return in week two', 'Validate repeat value'),
    (3, '61-90 days', 'Test paid plans', 'At least 5 payments or 3 written team intents', 'Validate monetization'),
    (4, 'Parallel', 'Publish 20 verified build stories', 'At least 5 percent save, fork, or install', 'Validate content as acquisition')
) AS gates(phase_order, phase, experiment, pass_gate, decision)
ORDER BY phase_order;
