-- ============================================================
-- MIGRATION 029: Git Sync Enhancements
-- ============================================================
-- Adds parent commit chain tracking for true Git-like history,
-- indexes for efficient commit graph traversal, and backfills
-- existing commits with parent references using temporal ordering.
--
-- Run: psql -d bitsathy_auth -f 029_git_sync_enhancements.sql
-- ============================================================

-- Add parent_commit_id FK (parent_hash column already exists from 014)
ALTER TABLE repository_commits
  ADD COLUMN IF NOT EXISTS parent_commit_id UUID REFERENCES repository_commits(commit_id);

-- Indexes for efficient commit chain walking
CREATE INDEX IF NOT EXISTS idx_commits_parent_hash
  ON repository_commits(project_id, parent_hash);

CREATE INDEX IF NOT EXISTS idx_commits_parent_id
  ON repository_commits(parent_commit_id);

-- Index for fast commit hash lookups (used by pull/sync queries)
CREATE INDEX IF NOT EXISTS idx_commits_hash
  ON repository_commits(commit_hash);

-- Backfill parent references for existing commits
-- Uses committed_at ordering within each branch to establish parent chain
WITH ordered_commits AS (
  SELECT
    commit_id,
    commit_hash,
    project_id,
    branch,
    LAG(commit_id) OVER (PARTITION BY project_id, branch ORDER BY committed_at) AS prev_commit_id,
    LAG(commit_hash) OVER (PARTITION BY project_id, branch ORDER BY committed_at) AS prev_hash
  FROM repository_commits
)
UPDATE repository_commits rc
SET parent_commit_id = oc.prev_commit_id,
    parent_hash = oc.prev_hash
FROM ordered_commits oc
WHERE rc.commit_id = oc.commit_id
  AND rc.parent_hash IS NULL
  AND oc.prev_commit_id IS NOT NULL;

-- ============================================================
-- Done. Existing data is now fully linked in a parent chain.
-- ============================================================
