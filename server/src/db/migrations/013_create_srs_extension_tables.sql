-- ============================================================
-- MIGRATION 013: SRS Extension Tables
-- ============================================================
-- Creates new tables required for full SRS compliance:
--   1. person_vectors          — Latent trait storage (SRS 7)
--   2. person_vector_snapshots — Historical trait snapshots
--   3. peer_ranking_surveys    — Peer ranking survey definitions (SRS 4.5.3)
--   4. peer_ranking_responses  — Individual (encrypted) ranking submissions
--   5. peer_ranking_aggregates — Aggregated-only results
--   6. faculty_exposure_log    — Faculty interaction tracking (SRS 4.4.3)
--   7. faculty_normalized_scores — Normalized faculty feedback scores
--   8. temporal_growth_records — Month-to-month Δ tracking (SRS 6)
--   9. evaluation_intent_config — Intent-specific behavior configs (SRS 6.2)
--  10. peer_safeguard_flags    — Gaming/collusion detection flags
--
-- DOES NOT modify any existing tables.
-- All new tables use UUID primary keys and reference existing tables via FK.
-- ============================================================

-- ============================================================
-- 1. PERSON VECTORS — Latent Trait Storage (SRS Section 7)
-- ============================================================
-- Stores the computed person vector for each person.
-- Traits: communication, leadership, consistency, trustworthiness, growth_potential
-- Vectors are used for mentoring, NOT labeling (SRS 7.2).
-- Updated after each evaluation cycle.
CREATE TABLE IF NOT EXISTS person_vectors (
    vector_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    
    -- SRS 7.1: Latent trait scores (0.0 to 1.0 normalized)
    communication       NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
    leadership          NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
    consistency         NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
    trustworthiness     NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
    growth_potential    NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
    
    -- Composite confidence (how many data points fed into this vector)
    data_point_count    INTEGER NOT NULL DEFAULT 0,
    confidence_level    NUMERIC(5,4) NOT NULL DEFAULT 0.0000,
    
    -- Source tracking: which data sources contributed
    -- JSONB: { project_evals: N, faculty_feedback: N, peer_surveys: N, interviews: N }
    source_breakdown    JSONB NOT NULL DEFAULT '{}',
    
    -- Timestamps
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One active vector per person (latest wins)
    UNIQUE(person_id)
);

-- Index for fast lookups by person
CREATE INDEX IF NOT EXISTS idx_person_vectors_person ON person_vectors(person_id);

-- ============================================================
-- 2. PERSON VECTOR SNAPSHOTS — Historical trait records
-- ============================================================
-- Immutable snapshots taken after each evaluation cycle.
-- Enables temporal trait trajectory analysis.
CREATE TABLE IF NOT EXISTS person_vector_snapshots (
    snapshot_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    period_id       UUID REFERENCES academic_months(period_id),
    session_id      UUID REFERENCES evaluation_sessions(session_id),
    
    -- Trait values at this point in time
    communication       NUMERIC(5,4) NOT NULL,
    leadership          NUMERIC(5,4) NOT NULL,
    consistency         NUMERIC(5,4) NOT NULL,
    trustworthiness     NUMERIC(5,4) NOT NULL,
    growth_potential    NUMERIC(5,4) NOT NULL,
    
    -- Delta from previous snapshot (NULL for first)
    delta_communication     NUMERIC(6,4),
    delta_leadership        NUMERIC(6,4),
    delta_consistency       NUMERIC(6,4),
    delta_trustworthiness   NUMERIC(6,4),
    delta_growth_potential  NUMERIC(6,4),
    
    data_point_count    INTEGER NOT NULL,
    confidence_level    NUMERIC(5,4) NOT NULL,
    
    captured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pvs_person_period ON person_vector_snapshots(person_id, period_id);
CREATE INDEX IF NOT EXISTS idx_pvs_captured ON person_vector_snapshots(captured_at DESC);

-- ============================================================
-- 3. PEER RANKING SURVEYS — Survey Definitions (SRS 4.5.3)
-- ============================================================
-- Defines peer ranking survey instances (created by faculty).
-- Each survey has a question, target peer group, and ranking depth.
CREATE TABLE IF NOT EXISTS peer_ranking_surveys (
    survey_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID REFERENCES evaluation_sessions(session_id),
    created_by      UUID NOT NULL REFERENCES users(internal_user_id) ON DELETE CASCADE,
    
    -- Survey configuration
    question_text       TEXT NOT NULL,
    question_type       VARCHAR(20) NOT NULL DEFAULT 'positive'
                        CHECK (question_type IN ('positive', 'negative', 'neutral')),
    max_ranks           INTEGER NOT NULL DEFAULT 3 CHECK (max_ranks BETWEEN 1 AND 5),
    
    -- SRS 4.5.3: Negative questions must be anonymized
    is_anonymized       BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Target group (project team members, class peers, etc.)
    target_group_type   VARCHAR(30) NOT NULL DEFAULT 'project_team'
                        CHECK (target_group_type IN ('project_team', 'class_peers', 'custom')),
    target_group_ids    UUID[] NOT NULL DEFAULT '{}',
    
    -- Lifecycle
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'open', 'closed', 'aggregated')),
    opens_at            TIMESTAMPTZ,
    closes_at           TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. PEER RANKING RESPONSES — Individual Submissions (Encrypted)
-- ============================================================
-- SRS 4.5.3: Individual rankings NEVER revealed.
-- Only aggregated analytics used.
CREATE TABLE IF NOT EXISTS peer_ranking_responses (
    response_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id       UUID NOT NULL REFERENCES peer_ranking_surveys(survey_id) ON DELETE CASCADE,
    respondent_id   UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    
    -- Rankings stored as ordered array of person_ids
    -- Position 0 = rank 1 (top), Position 1 = rank 2, etc.
    -- SRS 4.5.3: Must rank limited top positions, cannot rank all equally
    ranked_person_ids   UUID[] NOT NULL,
    
    -- Metadata
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One response per respondent per survey
    UNIQUE(survey_id, respondent_id)
);

-- ============================================================
-- 5. PEER RANKING AGGREGATES — Aggregated Results Only
-- ============================================================
-- SRS 4.5.3: Only aggregated analytics used, no individual exposure.
-- Stores how many times each person was ranked in each position.
CREATE TABLE IF NOT EXISTS peer_ranking_aggregates (
    aggregate_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id       UUID NOT NULL REFERENCES peer_ranking_surveys(survey_id) ON DELETE CASCADE,
    person_id       UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    
    -- How many times this person appeared in each rank position
    -- JSONB: { "1": count, "2": count, "3": count }
    rank_counts         JSONB NOT NULL DEFAULT '{}',
    
    -- Borda-style score: Σ (max_ranks - rank_position + 1) for each mention
    borda_score         NUMERIC(8,4) NOT NULL DEFAULT 0,
    
    -- Total times mentioned in any rank
    total_mentions      INTEGER NOT NULL DEFAULT 0,
    
    -- Normalized score (0-1 range based on possible maximum)
    normalized_score    NUMERIC(5,4) NOT NULL DEFAULT 0.0000,
    
    -- Response count at time of aggregation
    respondent_count    INTEGER NOT NULL DEFAULT 0,
    
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(survey_id, person_id)
);

-- ============================================================
-- 6. FACULTY EXPOSURE LOG — Interaction Tracking (SRS 4.4.3)
-- ============================================================
-- Tracks how much exposure each faculty member has had with students.
-- Used to normalize faculty feedback scores.
CREATE TABLE IF NOT EXISTS faculty_exposure_log (
    exposure_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id      UUID NOT NULL REFERENCES users(internal_user_id) ON DELETE CASCADE,
    person_id       UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    
    -- Exposure metrics
    session_count       INTEGER NOT NULL DEFAULT 0,
    contact_hours       NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    role_type           VARCHAR(30) NOT NULL DEFAULT 'lecture'
                        CHECK (role_type IN ('lecture', 'lab', 'tutorial', 'mentoring', 'project_guide', 'other')),
    
    -- Academic period
    period_id           UUID REFERENCES academic_months(period_id),
    academic_year       VARCHAR(9),
    semester            VARCHAR(10),
    
    -- Timestamps
    last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One record per faculty-person-period-role combination
    UNIQUE(faculty_id, person_id, period_id, role_type)
);

CREATE INDEX IF NOT EXISTS idx_faculty_exposure_faculty ON faculty_exposure_log(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_exposure_person ON faculty_exposure_log(person_id);

-- ============================================================
-- 7. FACULTY NORMALIZED SCORES — Exposure-Adjusted Scores
-- ============================================================
-- SRS 4.4.3: Normalize based on exposure to prevent bias.
CREATE TABLE IF NOT EXISTS faculty_normalized_scores (
    normalized_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES evaluation_sessions(session_id),
    faculty_id      UUID NOT NULL REFERENCES users(internal_user_id) ON DELETE CASCADE,
    target_id       UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    
    -- Original and adjusted scores
    raw_score           NUMERIC(8,4) NOT NULL,
    exposure_factor     NUMERIC(5,4) NOT NULL DEFAULT 1.0000,
    normalized_score    NUMERIC(8,4) NOT NULL,
    
    -- Exposure data used for normalization
    faculty_session_count   INTEGER NOT NULL DEFAULT 0,
    faculty_contact_hours   NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(session_id, faculty_id, target_id)
);

-- ============================================================
-- 8. TEMPORAL GROWTH RECORDS — Month-to-Month Δ (SRS Section 6)
-- ============================================================
-- Stores calculated score deltas between evaluation periods.
-- Enables growth trajectory visualization.
CREATE TABLE IF NOT EXISTS temporal_growth_records (
    growth_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(project_id),
    
    -- Period comparison
    from_period_id  UUID NOT NULL REFERENCES academic_months(period_id),
    to_period_id    UUID NOT NULL REFERENCES academic_months(period_id),
    from_session_id UUID REFERENCES evaluation_sessions(session_id),
    to_session_id   UUID REFERENCES evaluation_sessions(session_id),
    
    -- Score deltas
    raw_score_from      NUMERIC(8,4),
    raw_score_to        NUMERIC(8,4),
    raw_delta           NUMERIC(8,4),
    weighted_score_from NUMERIC(8,4),
    weighted_score_to   NUMERIC(8,4),
    weighted_delta      NUMERIC(8,4),
    
    -- Growth classification
    -- SRS 6.1: Track improvement trajectory
    growth_category     VARCHAR(20) NOT NULL DEFAULT 'stable'
                        CHECK (growth_category IN (
                            'significant_growth',   -- delta > +15%
                            'moderate_growth',      -- delta > +5%
                            'stable',               -- delta ±5%
                            'moderate_decline',     -- delta < -5%
                            'significant_decline'   -- delta < -15%
                        )),
    growth_percentage   NUMERIC(8,4),
    
    -- Evaluation intent at time of measurement (SRS 6.2)
    intent              VARCHAR(20) CHECK (intent IN ('growth', 'excellence', 'leadership', 'comparative')),
    
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(person_id, from_period_id, to_period_id)
);

CREATE INDEX IF NOT EXISTS idx_tgr_person ON temporal_growth_records(person_id);
CREATE INDEX IF NOT EXISTS idx_tgr_project ON temporal_growth_records(project_id);
CREATE INDEX IF NOT EXISTS idx_tgr_periods ON temporal_growth_records(from_period_id, to_period_id);

-- ============================================================
-- 9. EVALUATION INTENT CONFIG — Intent-Specific Behavior (SRS 6.2)
-- ============================================================
-- Configures how different intent modes affect scoring interpretation.
-- Scoring logic unchanged; interpretation changes per SRS 6.2.
CREATE TABLE IF NOT EXISTS evaluation_intent_config (
    config_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent          VARCHAR(20) NOT NULL UNIQUE
                    CHECK (intent IN ('growth', 'excellence', 'leadership', 'comparative')),
    
    -- Interpretation parameters (JSONB for flexibility)
    -- Example: { "emphasis": "improvement_delta", "threshold_strictness": 0.7 }
    interpretation_rules    JSONB NOT NULL DEFAULT '{}',
    
    -- Display configuration
    display_label           VARCHAR(50) NOT NULL,
    display_description     TEXT,
    
    -- Weight modifiers (optional multipliers for intent-aware aggregation)
    -- e.g., growth mode might weight recent sessions higher
    recency_weight_factor   NUMERIC(5,4) NOT NULL DEFAULT 1.0000,
    consistency_weight_factor NUMERIC(5,4) NOT NULL DEFAULT 1.0000,
    
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default intent configurations (SRS 6.2)
INSERT INTO evaluation_intent_config (intent, interpretation_rules, display_label, display_description, recency_weight_factor, consistency_weight_factor)
VALUES
    ('growth', 
     '{"emphasis": "improvement_delta", "compare_to": "own_previous", "highlight": "trajectory"}',
     'Growth Tracking',
     'Measures improvement and personal development trajectory over time. Focuses on delta from previous evaluations.',
     1.2000, 0.8000),
    ('excellence',
     '{"emphasis": "absolute_performance", "compare_to": "cohort_percentile", "highlight": "top_performers"}',
     'Excellence Assessment',
     'Evaluates absolute performance quality against cohort standards. Identifies top-tier contributions.',
     1.0000, 1.2000),
    ('leadership',
     '{"emphasis": "peer_influence", "compare_to": "team_impact", "highlight": "leadership_traits"}',
     'Leadership Evaluation',
     'Assesses leadership qualities, team influence, and decision-making impact. Weighted toward peer perception.',
     1.0000, 1.0000),
    ('comparative',
     '{"emphasis": "relative_ranking", "compare_to": "session_peers", "highlight": "ranking_bands"}',
     'Comparative Ranking',
     'Ranks participants relative to each other within the session. Uses scarcity-enforced bands, no raw rankings exposed.',
     1.0000, 1.0000)
ON CONFLICT (intent) DO NOTHING;

-- ============================================================
-- 10. PEER SAFEGUARD FLAGS — Gaming Detection (SRS 4.5.3)
-- ============================================================
-- Flags suspicious patterns in peer evaluations.
-- Used internally for credibility adjustments; never exposed to users.
CREATE TABLE IF NOT EXISTS peer_safeguard_flags (
    flag_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES evaluation_sessions(session_id),
    evaluator_id    UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    
    -- Flag type
    flag_type       VARCHAR(30) NOT NULL
                    CHECK (flag_type IN (
                        'reciprocal_bias',          -- Mutually high ratings
                        'retaliatory_scoring',      -- Abnormally low for specific peers
                        'uniform_distribution',     -- All scores identical (lazy eval)
                        'extreme_outlier',          -- Score >3σ from consensus
                        'collusion_cluster'         -- Group of evaluators with suspiciously similar patterns
                    )),
    
    -- Evidence (JSONB with detection details)
    evidence        JSONB NOT NULL DEFAULT '{}',
    
    -- Severity (informational → credibility impact)
    severity        VARCHAR(15) NOT NULL DEFAULT 'low'
                    CHECK (severity IN ('low', 'medium', 'high')),
    
    -- SRS 5.3: Statistical dilution only, no explicit punishment
    -- This flag feeds into credibility engine, NOT direct score modification
    credibility_impact_applied  BOOLEAN NOT NULL DEFAULT FALSE,
    
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    
    -- Prevent duplicate flags for same evaluator+session+type
    UNIQUE(session_id, evaluator_id, flag_type)
);

CREATE INDEX IF NOT EXISTS idx_psf_session ON peer_safeguard_flags(session_id);
CREATE INDEX IF NOT EXISTS idx_psf_evaluator ON peer_safeguard_flags(evaluator_id);

-- ============================================================
-- DONE — Migration 013 complete
-- ============================================================
