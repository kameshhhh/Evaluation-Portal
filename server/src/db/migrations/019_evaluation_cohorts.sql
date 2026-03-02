-- ============================================================
-- MIGRATION 019: Evaluation Cohorts & Peer Suggestions
-- ============================================================
-- Part 5: Evaluation Orchestration & Cohort Management System
-- Part 6: Lightweight Peer Group Optimization
--
-- Creates:
--   1. evaluation_cohorts         — Parent container for evaluation periods
--   2. cohort_targets             — What entities get evaluated in a cohort
--   3. cohort_evaluators          — Who evaluates within a cohort
--   4. cohort_assignments         — Specific evaluator→target mappings
--   5. cohort_coverage_alerts     — SRS §8.1 fairness alerts
--   6. peer_suggestion_cache      — Lightweight peer recommendations
--   7. ALTER evaluation_sessions  — Add optional cohort_id FK
--   8. ALTER comparative_rounds   — Add optional cohort_id FK
--   9. Views for coverage dashboard
-- ============================================================

BEGIN;

-- ============================================================
-- 1. EVALUATION COHORTS — Parent Container
-- ============================================================
-- A cohort is a structured evaluation period that groups multiple
-- sessions under one umbrella with fairness rules, time windows,
-- and coverage targets. Sessions can exist without a cohort
-- (backward compatible).
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluation_cohorts (
  cohort_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(200) NOT NULL,
  description       TEXT,

  -- Cohort type determines which evaluation flows it wraps
  cohort_type       VARCHAR(50) NOT NULL CHECK (
                      cohort_type IN (
                        'monthly_review',
                        'comparative_round',
                        'peer_ranking_cycle',
                        'faculty_feedback',
                        'mixed'
                      )
                    ),

  -- SRS §1.2: Periodic review structure
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  review_cycle      VARCHAR(20) DEFAULT 'monthly' CHECK (
                      review_cycle IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'custom')
                    ),

  -- SRS §8.1: Fairness configuration
  min_evaluations_per_target  INTEGER DEFAULT 2 CHECK (min_evaluations_per_target >= 1),
  max_evaluations_per_target  INTEGER DEFAULT 5 CHECK (max_evaluations_per_target >= 1),
  max_assignments_per_evaluator INTEGER DEFAULT 8 CHECK (max_assignments_per_evaluator >= 1),

  -- Evaluator rules — flexible JSONB for department filters, credibility thresholds
  evaluator_rules   JSONB DEFAULT '{}',
  -- Example: { "min_credibility": 0.5, "departments": ["CSE","ECE"], "require_diverse": true }

  -- Target filter — which entities this cohort covers
  target_filter     JSONB DEFAULT '{}',
  -- Example: { "entity_type": "project", "academic_year": 2024, "departments": ["CSE"] }

  -- Status lifecycle: draft → scheduled → active → completed → archived
  status            VARCHAR(20) DEFAULT 'draft' CHECK (
                      status IN ('draft', 'scheduled', 'active', 'completed', 'archived')
                    ),

  -- Governance
  created_by        UUID NOT NULL REFERENCES persons(person_id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  activated_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,

  -- Post-completion fairness report
  fairness_report   JSONB,

  CONSTRAINT valid_cohort_period CHECK (period_end > period_start),
  CONSTRAINT valid_evaluation_limits CHECK (
    min_evaluations_per_target <= max_evaluations_per_target
  )
);

-- Indexes for cohort queries
CREATE INDEX IF NOT EXISTS idx_cohorts_status ON evaluation_cohorts(status);
CREATE INDEX IF NOT EXISTS idx_cohorts_period ON evaluation_cohorts(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_cohorts_type_status ON evaluation_cohorts(cohort_type, status);
CREATE INDEX IF NOT EXISTS idx_cohorts_created_by ON evaluation_cohorts(created_by);

-- ============================================================
-- 2. COHORT TARGETS — What entities are evaluated
-- ============================================================
CREATE TABLE IF NOT EXISTS cohort_targets (
  cohort_id          UUID NOT NULL REFERENCES evaluation_cohorts(cohort_id) ON DELETE CASCADE,
  target_id          UUID NOT NULL,
  target_type        VARCHAR(20) NOT NULL CHECK (
                       target_type IN ('person', 'project', 'team')
                     ),
  target_label       VARCHAR(200),

  -- Coverage tracking
  target_evaluations INTEGER DEFAULT 2 CHECK (target_evaluations >= 1),
  current_evaluations INTEGER DEFAULT 0 CHECK (current_evaluations >= 0),

  -- Derived compliance flag
  added_at           TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (cohort_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_targets_type ON cohort_targets(cohort_id, target_type);

-- ============================================================
-- 3. COHORT EVALUATORS — Who evaluates within this cohort
-- ============================================================
CREATE TABLE IF NOT EXISTS cohort_evaluators (
  cohort_id          UUID NOT NULL REFERENCES evaluation_cohorts(cohort_id) ON DELETE CASCADE,
  evaluator_id       UUID NOT NULL REFERENCES persons(person_id),
  evaluator_role     VARCHAR(20) NOT NULL CHECK (
                       evaluator_role IN ('judge', 'peer', 'faculty', 'student')
                     ),

  -- Workload tracking
  max_assignments    INTEGER DEFAULT 5 CHECK (max_assignments >= 1),
  current_assignments INTEGER DEFAULT 0 CHECK (current_assignments >= 0),

  -- Assignment method
  assignment_method  VARCHAR(30) DEFAULT 'auto' CHECK (
                       assignment_method IN ('auto', 'manual', 'volunteer')
                     ),

  -- Status
  status             VARCHAR(20) DEFAULT 'active' CHECK (
                       status IN ('active', 'completed', 'excused')
                     ),

  added_at           TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (cohort_id, evaluator_id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_evaluators_status ON cohort_evaluators(evaluator_id, status);

-- ============================================================
-- 4. COHORT ASSIGNMENTS — Specific evaluator→target mappings
-- ============================================================
-- The core orchestration table: who evaluates whom, tracked
-- through a lifecycle from pending → completed.
-- ============================================================
CREATE TABLE IF NOT EXISTS cohort_assignments (
  assignment_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id          UUID NOT NULL REFERENCES evaluation_cohorts(cohort_id) ON DELETE CASCADE,
  evaluator_id       UUID NOT NULL REFERENCES persons(person_id),
  target_id          UUID NOT NULL,
  target_type        VARCHAR(20) NOT NULL CHECK (
                       target_type IN ('person', 'project', 'team')
                     ),

  -- How this assignment was created
  assignment_method  VARCHAR(30) DEFAULT 'auto' CHECK (
                       assignment_method IN ('auto', 'manual', 'rebalanced')
                     ),
  assignment_reason  TEXT,
  assignment_round   INTEGER DEFAULT 1,

  -- Status lifecycle: pending → session_created → in_progress → completed / skipped
  status             VARCHAR(20) DEFAULT 'pending' CHECK (
                       status IN ('pending', 'session_created', 'in_progress', 'completed', 'skipped')
                     ),

  -- Link to the actual evaluation session (populated when session is created)
  session_id         UUID,
  session_type       VARCHAR(30),

  -- Temporal tracking
  assigned_at        TIMESTAMPTZ DEFAULT NOW(),
  deadline           TIMESTAMPTZ,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,

  -- Audit: track overrides
  override_history   JSONB DEFAULT '[]',

  UNIQUE (cohort_id, evaluator_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_cohort ON cohort_assignments(cohort_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_evaluator ON cohort_assignments(evaluator_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_target ON cohort_assignments(target_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_session ON cohort_assignments(session_id) WHERE session_id IS NOT NULL;

-- ============================================================
-- 5. COHORT COVERAGE ALERTS — SRS §8.1 Fairness Alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS cohort_coverage_alerts (
  alert_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id          UUID NOT NULL REFERENCES evaluation_cohorts(cohort_id) ON DELETE CASCADE,

  alert_type         VARCHAR(30) NOT NULL CHECK (
                       alert_type IN (
                         'coverage_gap',
                         'evaluator_overload',
                         'deadline_approaching',
                         'fairness_violation',
                         'rebalance_needed'
                       )
                     ),
  severity           VARCHAR(20) DEFAULT 'warning' CHECK (
                       severity IN ('info', 'warning', 'critical')
                     ),

  title              VARCHAR(300) NOT NULL,
  description        TEXT,

  -- Affected entities
  target_ids         UUID[],
  evaluator_ids      UUID[],

  -- Suggested fix
  suggested_actions  JSONB,

  -- Status lifecycle
  status             VARCHAR(20) DEFAULT 'active' CHECK (
                       status IN ('active', 'acknowledged', 'resolved', 'dismissed')
                     ),

  created_at         TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at    TIMESTAMPTZ,
  acknowledged_by    UUID REFERENCES persons(person_id),
  resolved_at        TIMESTAMPTZ,
  resolved_by        UUID REFERENCES persons(person_id),

  resolution_notes   TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON cohort_coverage_alerts(cohort_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_alerts_cohort ON cohort_coverage_alerts(cohort_id, created_at DESC);

-- ============================================================
-- 6. PEER SUGGESTION CACHE — Lightweight Part 6
-- ============================================================
-- Pre-computed peer recommendations based on simple rules:
-- department match, project overlap, evaluation recency, skill diversity.
-- NOT ML-based — transparent, explainable scores.
-- ============================================================
CREATE TABLE IF NOT EXISTS peer_suggestion_cache (
  student_id         UUID NOT NULL REFERENCES persons(person_id),
  suggested_peer_id  UUID NOT NULL REFERENCES persons(person_id),

  -- Factor scores (0-100 each)
  department_score   INTEGER DEFAULT 0 CHECK (department_score >= 0),
  project_score      INTEGER DEFAULT 0 CHECK (project_score >= 0),
  recency_score      INTEGER DEFAULT 0 CHECK (recency_score >= 0),
  skill_score        INTEGER DEFAULT 0 CHECK (skill_score >= 0),
  total_score        INTEGER DEFAULT 0 CHECK (total_score >= 0),

  -- Explanation for transparency (SRS §8.2)
  reasons            JSONB DEFAULT '[]',

  cached_at          TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (student_id, suggested_peer_id),
  CONSTRAINT no_self_suggest CHECK (student_id <> suggested_peer_id)
);

CREATE INDEX IF NOT EXISTS idx_peer_suggestions_student ON peer_suggestion_cache(student_id, total_score DESC);

-- ============================================================
-- 7. ALTER EXISTING TABLES — Add optional cohort_id FK
-- ============================================================

-- evaluation_sessions gets optional cohort link
ALTER TABLE evaluation_sessions
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES evaluation_cohorts(cohort_id),
  ADD COLUMN IF NOT EXISTS cohort_assignment_id UUID REFERENCES cohort_assignments(assignment_id);

CREATE INDEX IF NOT EXISTS idx_sessions_cohort ON evaluation_sessions(cohort_id) WHERE cohort_id IS NOT NULL;

-- comparative_rounds gets optional cohort link
ALTER TABLE comparative_rounds
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES evaluation_cohorts(cohort_id);

CREATE INDEX IF NOT EXISTS idx_comp_rounds_cohort ON comparative_rounds(cohort_id) WHERE cohort_id IS NOT NULL;

-- peer_ranking_surveys gets optional cohort link
ALTER TABLE peer_ranking_surveys
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES evaluation_cohorts(cohort_id);

-- faculty_evaluation_sessions gets optional cohort link
ALTER TABLE faculty_evaluation_sessions
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES evaluation_cohorts(cohort_id);

-- ============================================================
-- 8. VIEWS — Coverage Dashboard Support
-- ============================================================

-- Cohort coverage summary view
CREATE OR REPLACE VIEW cohort_coverage_summary AS
SELECT
  c.cohort_id,
  c.name AS cohort_name,
  c.cohort_type,
  c.status AS cohort_status,
  c.period_start,
  c.period_end,
  c.min_evaluations_per_target,
  c.max_evaluations_per_target,

  -- Target counts
  COUNT(DISTINCT ct.target_id) AS total_targets,
  COUNT(DISTINCT ct.target_id) FILTER (
    WHERE ct.current_evaluations >= c.min_evaluations_per_target
  ) AS compliant_targets,

  -- Evaluator counts
  COUNT(DISTINCT ce.evaluator_id) AS total_evaluators,

  -- Assignment counts
  COUNT(DISTINCT ca.assignment_id) AS total_assignments,
  COUNT(DISTINCT ca.assignment_id) FILTER (WHERE ca.status = 'completed') AS completed_assignments,
  COUNT(DISTINCT ca.assignment_id) FILTER (WHERE ca.status = 'pending') AS pending_assignments,

  -- Coverage metrics
  CASE
    WHEN COUNT(DISTINCT ct.target_id) = 0 THEN 0
    ELSE ROUND(
      100.0 * COUNT(DISTINCT ct.target_id) FILTER (
        WHERE ct.current_evaluations >= c.min_evaluations_per_target
      ) / COUNT(DISTINCT ct.target_id), 1
    )
  END AS compliance_rate,

  -- Fairness gap (max - min evaluations across targets)
  COALESCE(MAX(ct.current_evaluations) - MIN(ct.current_evaluations), 0) AS fairness_gap,

  -- Active alerts
  (SELECT COUNT(*) FROM cohort_coverage_alerts cca
   WHERE cca.cohort_id = c.cohort_id AND cca.status = 'active') AS active_alerts

FROM evaluation_cohorts c
LEFT JOIN cohort_targets ct ON c.cohort_id = ct.cohort_id
LEFT JOIN cohort_evaluators ce ON c.cohort_id = ce.cohort_id
LEFT JOIN cohort_assignments ca ON c.cohort_id = ca.cohort_id
GROUP BY c.cohort_id, c.name, c.cohort_type, c.status,
         c.period_start, c.period_end,
         c.min_evaluations_per_target, c.max_evaluations_per_target;

-- Assignment matrix view (evaluator × target)
CREATE OR REPLACE VIEW cohort_assignment_matrix AS
SELECT
  ca.cohort_id,
  ca.evaluator_id,
  p_eval.display_name AS evaluator_name,
  p_eval.department_code AS evaluator_dept,
  ca.target_id,
  ca.target_type,
  ca.assignment_method,
  ca.status AS assignment_status,
  ca.session_id,
  ca.assigned_at,
  ca.deadline,
  ca.completed_at
FROM cohort_assignments ca
JOIN persons p_eval ON ca.evaluator_id = p_eval.person_id;

COMMIT;
