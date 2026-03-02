-- ============================================================
-- MIGRATION 016: Peer Ranking Extensions (Adapter-Compatible)
-- ============================================================
-- EXTENDS existing peer ranking tables from migration 013
-- WITHOUT dropping or modifying existing columns.
--
-- Adds columns that PeerRankingSafeguardService.js expects
-- but migration 013 didn't create. Also adds:
--   1. peer_groups table — Private student peer groups (SRS §4.5.1)
--   2. default_trait_questions — System question bank (SRS §4.5.2)
--   3. Adapter-bridge columns on existing tables
--
-- PRESERVES all existing data, constraints, and indexes.
-- ============================================================

-- ============================================================
-- 1. EXTEND peer_ranking_surveys — Add columns service expects
-- ============================================================
-- PeerRankingSafeguardService uses: title, questions (JSONB),
-- participant_ids (JSONB), max_top_positions, is_active, evaluator_id
-- Migration 013 has: question_text, max_ranks, target_group_ids (UUID[])

-- Title column (service uses survey.title)
ALTER TABLE peer_ranking_surveys
  ADD COLUMN IF NOT EXISTS title VARCHAR(255);

-- Questions as JSONB array (service stores full question config)
ALTER TABLE peer_ranking_surveys
  ADD COLUMN IF NOT EXISTS questions JSONB DEFAULT '[]';

-- Participant IDs as JSONB (service uses JSON.parse on this)
ALTER TABLE peer_ranking_surveys
  ADD COLUMN IF NOT EXISTS participant_ids JSONB DEFAULT '[]';

-- Max top positions (service references this directly)
ALTER TABLE peer_ranking_surveys
  ADD COLUMN IF NOT EXISTS max_top_positions INTEGER DEFAULT 3;

-- Active flag (service filters by is_active = true)
ALTER TABLE peer_ranking_surveys
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Initiation mode: tracks who started the survey
-- 'admin' = faculty/admin created, 'student' = student self-service, 'system' = auto
ALTER TABLE peer_ranking_surveys
  ADD COLUMN IF NOT EXISTS initiation_mode VARCHAR(20) DEFAULT 'admin'
  CHECK (initiation_mode IN ('admin', 'student', 'system'));

-- Link to peer group (for student-initiated surveys)
ALTER TABLE peer_ranking_surveys
  ADD COLUMN IF NOT EXISTS peer_group_id UUID;

-- ============================================================
-- 2. EXTEND peer_ranking_responses — Add columns service expects
-- ============================================================
-- Service uses: evaluator_id, rankings (JSONB)
-- Migration 013 has: respondent_id, ranked_person_ids (UUID[])

-- Evaluator ID (service uses this instead of respondent_id)
ALTER TABLE peer_ranking_responses
  ADD COLUMN IF NOT EXISTS evaluator_id UUID;

-- Rankings as JSONB (service stores structured ranking data)
ALTER TABLE peer_ranking_responses
  ADD COLUMN IF NOT EXISTS rankings JSONB DEFAULT '[]';

-- Draft support — students can save and resume
ALTER TABLE peer_ranking_responses
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;

-- ============================================================
-- 3. EXTEND peer_ranking_aggregates — Add missing column
-- ============================================================
-- Service upserts with computed_at
ALTER TABLE peer_ranking_aggregates
  ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 4. EXTEND peer_safeguard_flags — Add missing columns
-- ============================================================
-- Service uses 'details' (JSONB), migration 013 uses 'evidence' (JSONB)
ALTER TABLE peer_safeguard_flags
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';

-- ============================================================
-- 5. NEW TABLE: peer_groups — Private Student Peer Groups
-- ============================================================
-- SRS §4.5.1: "Students may define a peer group (one-time or periodic).
-- Network stored privately."
--
-- PRIVACY: Only the owning student can see their group members.
-- No FK to individual peer person_ids to prevent join-based exposure.
-- ============================================================
CREATE TABLE IF NOT EXISTS peer_groups (
    group_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,

    -- Private label (only visible to the student)
    group_name      VARCHAR(100) NOT NULL DEFAULT 'My Peer Group',

    -- Peer person IDs stored as JSONB array (not FK — privacy by design)
    -- Structure: ["uuid1", "uuid2", ...]
    peer_ids        JSONB NOT NULL DEFAULT '[]',

    -- How peers were sourced (for analytics, not exposure)
    source_breakdown JSONB NOT NULL DEFAULT '{}',

    -- Constraints
    peer_count      INTEGER NOT NULL DEFAULT 0 CHECK (peer_count BETWEEN 0 AND 20),

    -- Lifecycle
    is_active       BOOLEAN NOT NULL DEFAULT true,
    refresh_period  VARCHAR(20) NOT NULL DEFAULT 'semester'
                    CHECK (refresh_period IN ('one-time', 'monthly', 'semester', 'yearly')),
    academic_year   VARCHAR(9),
    semester        VARCHAR(10),

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One active group per student (can archive old ones)
    -- Students can have multiple groups but only one active per purpose
    UNIQUE(student_id, group_name, is_active)
);

-- Privacy-first indexes: only index student_id (owner lookups)
CREATE INDEX IF NOT EXISTS idx_pg_student ON peer_groups(student_id);
CREATE INDEX IF NOT EXISTS idx_pg_active ON peer_groups(is_active) WHERE is_active = true;

-- ============================================================
-- 6. NEW TABLE: default_trait_questions — System Question Bank
-- ============================================================
-- SRS §4.5.2: "System presents questions like:
-- 'Who is strongest in English?' 'Who shows leadership?'"
--
-- Pre-defined trait questions for student self-service surveys.
-- Admin can add custom questions on top of these.
-- ============================================================
CREATE TABLE IF NOT EXISTS default_trait_questions (
    question_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Trait this question measures (maps to Person Vector traits)
    trait_key       VARCHAR(50) NOT NULL UNIQUE,

    -- Question text shown to students
    question_text   TEXT NOT NULL,

    -- Description/tooltip for clarity
    description     TEXT,

    -- Question type for ethical handling
    question_type   VARCHAR(20) NOT NULL DEFAULT 'positive'
                    CHECK (question_type IN ('positive', 'negative', 'neutral')),

    -- How many top positions for this trait (SRS: "limited top positions")
    max_positions   INTEGER NOT NULL DEFAULT 3 CHECK (max_positions BETWEEN 1 AND 10),

    -- Analytics weight for Person Vector (SRS §7.1)
    analytics_weight NUMERIC(3,2) NOT NULL DEFAULT 1.00,

    -- Is this a system default (cannot be deleted by admin)
    is_system       BOOLEAN NOT NULL DEFAULT true,

    -- Active flag
    is_active       BOOLEAN NOT NULL DEFAULT true,

    -- Display order
    sort_order      INTEGER NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. SEED: Default Trait Questions from SRS §4.5.2
-- ============================================================
INSERT INTO default_trait_questions (trait_key, question_text, description, question_type, max_positions, analytics_weight, sort_order)
VALUES
  ('leadership',     'Who shows the most leadership in group settings?',
   'Takes initiative, coordinates others, drives outcomes', 'positive', 3, 1.00, 1),
  ('communication',  'Who communicates most effectively?',
   'Clear expression, active listening, constructive feedback', 'positive', 3, 1.00, 2),
  ('technical',      'Who has the strongest technical skills?',
   'Problem-solving ability, code quality, domain expertise', 'positive', 3, 1.00, 3),
  ('reliability',    'Who is most reliable and consistent?',
   'Meets deadlines, follows through on commitments', 'positive', 3, 1.00, 4),
  ('english',        'Who is strongest in English communication?',
   'Written and verbal English proficiency', 'positive', 3, 0.80, 5),
  ('collaboration',  'Who is the best team player?',
   'Helps others, shares knowledge, resolves conflicts', 'positive', 3, 0.90, 6),
  ('improvement',    'Who needs the most improvement in professionalism?',
   'Attendance, punctuality, work ethic', 'negative', 3, 0.70, 7)
ON CONFLICT (trait_key) DO NOTHING;

-- ============================================================
-- 8. FK: Link peer_ranking_surveys to peer_groups
-- ============================================================
-- Add FK constraint for peer_group_id (deferred — column added above)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_prs_peer_group'
  ) THEN
    ALTER TABLE peer_ranking_surveys
      ADD CONSTRAINT fk_prs_peer_group
      FOREIGN KEY (peer_group_id) REFERENCES peer_groups(group_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 9. Additional indexes for adapter queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_prs_is_active ON peer_ranking_surveys(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_prs_initiation ON peer_ranking_surveys(initiation_mode);
CREATE INDEX IF NOT EXISTS idx_prr_evaluator ON peer_ranking_responses(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_prr_draft ON peer_ranking_responses(is_draft) WHERE is_draft = true;
CREATE INDEX IF NOT EXISTS idx_dtq_active ON default_trait_questions(is_active, sort_order) WHERE is_active = true;
