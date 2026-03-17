-- ============================================================
-- Migration 054: Comparative Review Module
-- ============================================================
-- Head-to-head team comparison system.
-- Admin pairs teams from same track, faculty marks them relatively,
-- students view opponent projects and scores.
--
-- Flow:
--   Admin creates round (auto-named like session planner) →
--   Admin pairs teams within same track →
--   Admin assigns faculty evaluator to each pairing →
--   Faculty compares teams side-by-side and distributes marks →
--   Students see results + opponent project
-- ============================================================

BEGIN;

-- ============================================================
-- 1. COMPARATIVE REVIEW ROUNDS — Admin-created review periods
-- ============================================================
CREATE TABLE IF NOT EXISTS comparative_review_rounds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    track           VARCHAR(20) NOT NULL CHECK (track IN ('core', 'it_core', 'premium')),
    academic_year   INTEGER NOT NULL,
    semester        INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
    batch_year      INTEGER,
    mark_pool       DECIMAL(5,2) NOT NULL DEFAULT 5.00 CHECK (mark_pool > 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active', 'marking', 'finalized')),
    created_by      UUID NOT NULL REFERENCES persons(person_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at    TIMESTAMPTZ,

    -- Prevent duplicate rounds with same title
    CONSTRAINT uq_cr_round_title UNIQUE (title)
);

CREATE INDEX IF NOT EXISTS idx_cr_rounds_track ON comparative_review_rounds(track);
CREATE INDEX IF NOT EXISTS idx_cr_rounds_status ON comparative_review_rounds(status);
CREATE INDEX IF NOT EXISTS idx_cr_rounds_batch ON comparative_review_rounds(batch_year);

-- ============================================================
-- 2. COMPARATIVE REVIEW PAIRINGS — Groups of teams to compare
-- ============================================================
CREATE TABLE IF NOT EXISTS comparative_review_pairings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id        UUID NOT NULL REFERENCES comparative_review_rounds(id) ON DELETE CASCADE,
    pairing_label   VARCHAR(100),
    faculty_id      UUID REFERENCES persons(person_id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'assigned', 'marked', 'finalized')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cr_pairings_round ON comparative_review_pairings(round_id);
CREATE INDEX IF NOT EXISTS idx_cr_pairings_faculty ON comparative_review_pairings(faculty_id);
CREATE INDEX IF NOT EXISTS idx_cr_pairings_status ON comparative_review_pairings(status);

-- ============================================================
-- 3. PAIRING TEAMS — Links teams/projects to a pairing
-- ============================================================
CREATE TABLE IF NOT EXISTS comparative_review_pairing_teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pairing_id      UUID NOT NULL REFERENCES comparative_review_pairings(id) ON DELETE CASCADE,
    team_id         UUID NOT NULL REFERENCES team_formation_requests(id),
    project_id      UUID REFERENCES projects(project_id),

    CONSTRAINT uq_cr_pairing_team UNIQUE (pairing_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_cr_pt_pairing ON comparative_review_pairing_teams(pairing_id);
CREATE INDEX IF NOT EXISTS idx_cr_pt_team ON comparative_review_pairing_teams(team_id);

-- ============================================================
-- 4. COMPARATIVE REVIEW MARKS — Faculty's relative marks
-- ============================================================
CREATE TABLE IF NOT EXISTS comparative_review_marks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pairing_id      UUID NOT NULL REFERENCES comparative_review_pairings(id) ON DELETE CASCADE,
    team_id         UUID NOT NULL REFERENCES team_formation_requests(id),
    faculty_id      UUID NOT NULL REFERENCES persons(person_id),
    marks           DECIMAL(5,2) NOT NULL CHECK (marks >= 0),
    feedback        TEXT,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_cr_mark_pairing_team UNIQUE (pairing_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_cr_marks_pairing ON comparative_review_marks(pairing_id);
CREATE INDEX IF NOT EXISTS idx_cr_marks_team ON comparative_review_marks(team_id);
CREATE INDEX IF NOT EXISTS idx_cr_marks_faculty ON comparative_review_marks(faculty_id);

-- ============================================================
-- 5. VIEW: Global team rankings across all finalized rounds
-- ============================================================
CREATE OR REPLACE VIEW comparative_review_rankings AS
SELECT
    crm.team_id,
    tfr.project_id,
    p.title AS project_title,
    tfr.track,
    tfr.leader_id,
    lp.display_name AS leader_name,
    crr.id AS round_id,
    crr.title AS round_title,
    crr.batch_year,
    crm.marks,
    crr.mark_pool,
    crm.feedback,
    crm.submitted_at,
    RANK() OVER (ORDER BY crm.marks DESC) AS global_rank,
    RANK() OVER (PARTITION BY tfr.track ORDER BY crm.marks DESC) AS track_rank
FROM comparative_review_marks crm
JOIN comparative_review_pairings crp ON crp.id = crm.pairing_id
JOIN comparative_review_rounds crr ON crr.id = crp.round_id
JOIN team_formation_requests tfr ON tfr.id = crm.team_id
JOIN projects p ON p.project_id = tfr.project_id
JOIN persons lp ON lp.person_id = tfr.leader_id
WHERE crr.status = 'finalized';

COMMIT;
