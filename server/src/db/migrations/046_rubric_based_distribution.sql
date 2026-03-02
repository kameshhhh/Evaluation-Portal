-- ============================================================
-- MIGRATION 046: RUBRIC-BASED DISTRIBUTION (SRS §4.1.4)
-- ============================================================
-- Seeds the 5 default evaluation rubrics (Clarity, Effort,
-- Confidence, Technical Skill, Leadership).
-- Exactly 3 rubrics must be selected per session.
-- Pool = team_size × 5, divided equally among rubrics.
-- Odd remainders assigned to first rubric(s).
--
-- NOTE: evaluation_heads table already exists (migration 004).
--       session_evaluation_heads table already exists (migration 004).
--       scarcity_allocations.head_id FK already exists (migration 006).
--       This migration only seeds default rubrics and adds
--       rubric-related columns to evaluation_sessions.
-- ============================================================

-- ============================================================
-- STEP 1: Add rubric_count column to evaluation_sessions
-- Tracks how many rubrics this session uses (0 = no rubrics,
-- 3 = rubric-based, default is 0 = legacy behaviour)
-- ============================================================
ALTER TABLE evaluation_sessions
    ADD COLUMN IF NOT EXISTS rubric_count INTEGER NOT NULL DEFAULT 0
        CHECK (rubric_count IN (0, 1, 2, 3, 4, 5)),
    ADD COLUMN IF NOT EXISTS rubric_pool_per_head INTEGER GENERATED ALWAYS AS (
        CASE WHEN rubric_count > 0 THEN scarcity_pool_size / rubric_count ELSE NULL END
    ) STORED;

-- ============================================================
-- STEP 2: Add per-rubric-pool column to session_evaluation_heads
-- Stores the calculated per-rubric pool size
-- (session.scarcity_pool_size ÷ rubric_count, remainder to first)
-- ============================================================
ALTER TABLE session_evaluation_heads
    ADD COLUMN IF NOT EXISTS rubric_pool_size INTEGER;

-- ============================================================
-- STEP 3: Seed the 5 default rubrics into evaluation_heads
-- Uses a temp system person to satisfy created_by FK constraint,
-- falling back to the first person if none exists.
-- ============================================================
DO $$
DECLARE
    v_creator UUID;
BEGIN
    -- Get a valid creator person_id (admin or first record)
    SELECT person_id INTO v_creator
    FROM persons
    WHERE status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;

    -- Only seed if we have a valid creator and rubrics don't exist yet
    IF v_creator IS NOT NULL THEN
        INSERT INTO evaluation_heads
            (head_name, description, applicable_entity, max_score, scarcity_pool_size, is_active, created_by)
        VALUES
            ('Clarity',
             'How clearly does the student communicate ideas, explain work, and present findings?',
             'person', 5.00, 5, TRUE, v_creator),
            ('Effort',
             'How much effort, commitment, and dedication did the student demonstrate?',
             'person', 5.00, 5, TRUE, v_creator),
            ('Confidence',
             'How confidently does the student present, defend, and articulate their work?',
             'person', 5.00, 5, TRUE, v_creator),
            ('Technical Skill',
             'How technically proficient is the student in applying relevant skills and tools?',
             'person', 5.00, 5, TRUE, v_creator),
            ('Leadership',
             'How well does the student lead, coordinate, and contribute to team success?',
             'person', 5.00, 5, TRUE, v_creator)
        ON CONFLICT (head_name, version) DO NOTHING;

        RAISE NOTICE 'Default rubrics seeded (or already exist).';
    ELSE
        RAISE NOTICE 'No persons found — skipping rubric seed. Run after first login.';
    END IF;
END $$;

-- ============================================================
-- STEP 4: Per-rubric scarcity constraint trigger
-- When a session has rubrics, enforce pool constraint PER RUBRIC
-- (Each head_id group must not exceed session_evaluation_heads.rubric_pool_size)
-- The global pool check (existing trigger) remains unchanged.
-- ============================================================
CREATE OR REPLACE FUNCTION check_rubric_scarcity_constraint()
RETURNS TRIGGER AS $$
DECLARE
    v_rubric_pool  INTEGER;
    v_head_total   DECIMAL(10,2);
BEGIN
    -- Only applies to allocations that have a head_id (rubric-based)
    IF NEW.head_id IS NULL THEN
        RETURN NEW; -- Legacy global pool — handled by existing trigger
    END IF;

    -- Get the per-rubric pool size from session_evaluation_heads
    SELECT rubric_pool_size
    INTO v_rubric_pool
    FROM session_evaluation_heads
    WHERE session_id = NEW.session_id AND head_id = NEW.head_id;

    -- If no rubric pool configured, skip (shouldn't happen — just safety)
    IF v_rubric_pool IS NULL THEN
        RETURN NEW;
    END IF;

    -- Sum all existing allocations for this evaluator + rubric in session
    SELECT COALESCE(SUM(points), 0)
    INTO v_head_total
    FROM scarcity_allocations
    WHERE session_id   = NEW.session_id
      AND evaluator_id = NEW.evaluator_id
      AND head_id      = NEW.head_id
      AND allocation_id != COALESCE(NEW.allocation_id, '00000000-0000-0000-0000-000000000000'::UUID);

    IF v_head_total + NEW.points > v_rubric_pool THEN
        RAISE EXCEPTION
            'Rubric "%" pool exceeded: % + % > % (rubric_pool_size)',
            NEW.head_id, v_head_total, NEW.points, v_rubric_pool
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_rubric_scarcity ON scarcity_allocations;
CREATE TRIGGER trg_check_rubric_scarcity
    BEFORE INSERT OR UPDATE ON scarcity_allocations
    FOR EACH ROW
    EXECUTE FUNCTION check_rubric_scarcity_constraint();

-- ============================================================
-- STEP 5: Index for fast per-rubric aggregation queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scarcity_alloc_head
    ON scarcity_allocations(session_id, head_id)
    WHERE head_id IS NOT NULL;

-- ============================================================
-- STEP 6: View for rubric-based session info
-- Makes it easy to query all rubric pools for a session
-- ============================================================
CREATE OR REPLACE VIEW session_rubric_config AS
SELECT
    seh.session_id,
    seh.head_id,
    eh.head_name,
    eh.description,
    seh.rubric_pool_size,
    seh.weight,
    seh.is_required,
    eh.applicable_entity
FROM session_evaluation_heads seh
JOIN evaluation_heads eh ON eh.head_id = seh.head_id
WHERE eh.is_active = TRUE;

COMMENT ON VIEW session_rubric_config IS
    'All active rubric configurations per session with pool sizes.';
