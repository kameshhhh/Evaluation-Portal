-- ============================================================
-- Migration 015: GitHub Extensions
-- ============================================================
-- Adds:
--   1. issue_comments table for issue comment threads
--   2. pr_reviews table for formal PR review/approval workflow
--   3. Indexes for both
-- ============================================================

-- ============================================================
-- PART A: Issue Comments
-- ============================================================
CREATE TABLE IF NOT EXISTS issue_comments (
    comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES project_issues(issue_id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES persons(person_id),
    author_name VARCHAR(255),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue
    ON issue_comments(issue_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_issue_comments_author
    ON issue_comments(author_id);

-- ============================================================
-- PART B: PR Reviews (formal approval workflow)
-- ============================================================
CREATE TABLE IF NOT EXISTS pr_reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id UUID NOT NULL REFERENCES pull_requests(pr_id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES persons(person_id),
    reviewer_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'changes_requested', 'commented')),
    body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_reviews_pr
    ON pr_reviews(pr_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pr_reviews_reviewer
    ON pr_reviews(reviewer_id);

-- ============================================================
-- Triggers for updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_issue_comments_updated ON issue_comments;
CREATE TRIGGER trg_issue_comments_updated
    BEFORE UPDATE ON issue_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pr_reviews_updated ON pr_reviews;
CREATE TRIGGER trg_pr_reviews_updated
    BEFORE UPDATE ON pr_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
