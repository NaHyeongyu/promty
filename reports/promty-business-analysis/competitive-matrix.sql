-- Official product capability comparison reviewed on 2026-07-17.
-- See source-notes.md for the linked primary sources.

SELECT *
FROM (
  VALUES
    ('GitHub Copilot Memory', 'Repository facts and user preferences', 'Repository memory alone is not a moat', 1),
    ('Cursor Teams', 'Shared team context and internal marketplace', 'Team context and content are already bundled', 2),
    ('Pieces', 'On-device long-term memory', 'Competes on privacy and personal memory', 3),
    ('Windsurf Cascade', 'Workspace memories and rules', 'Single-IDE continuity is becoming standard', 4)
) AS competitors(product, documented_capability, implication, threat_order)
ORDER BY threat_order;
