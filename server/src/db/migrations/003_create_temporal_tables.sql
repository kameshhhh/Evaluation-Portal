-- ============================================================
-- MIGRATION 003: CREATE TEMPORAL TABLES
-- ============================================================
-- Creates tables for time-aware project tracking:
--   academic_months: defines the academic calendar periods
--   project_month_plans: monthly plans submitted by teams
--   work_logs: individual member work records per month
--
-- These tables make TIME a first-class dimension in the system.
-- Every piece of work is anchored to an academic month period.
-- ============================================================

-- ============================================================
-- ACADEMIC MONTHS TABLE — College calendar abstraction
-- ============================================================
-- Defines the academic calendar as discrete month periods.
-- Each semester has 6 months, and each month can be marked
-- as an evaluation month (when project reviews happen).
--
-- Academic year structure at Bitsathy:
--   Odd semester: June(1), July(2), Aug(3), Sep(4), Oct(5), Nov(6)
--   Even semester: Dec(1), Jan(2), Feb(3), Mar(4), Apr(5), May(6)
-- ============================================================
CREATE TABLE IF NOT EXISTS academic_months (
    -- Primary key for this period
    period_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which academic year this period belongs to (e.g., 2026)
    academic_year INTEGER NOT NULL,

    -- Which semester: 1 = Odd (June-Nov), 2 = Even (Dec-May)
    semester INTEGER NOT NULL CHECK (semester IN (1, 2)),

    -- Sequential month index within the semester (1 through 6)
    -- Month 1 = first month of semester, Month 6 = last month
    month_index INTEGER NOT NULL CHECK (month_index BETWEEN 1 AND 6),

    -- Human-readable month name for display
    -- Example: "June", "July", "August"
    month_name VARCHAR(20) NOT NULL,

    -- Start date of this academic month period
    start_date DATE NOT NULL,

    -- End date of this academic month period (inclusive)
    end_date DATE NOT NULL,

    -- Whether this month is an evaluation month
    -- Evaluation months have special rules:
    --   - Projects may be frozen for review
    --   - Work logs may be locked
    --   - Monthly plans must be submitted before freeze
    is_evaluation_month BOOLEAN NOT NULL DEFAULT FALSE,

    -- UNIQUE constraint: only one entry per year + semester + month
    -- Prevents duplicate calendar entries
    UNIQUE(academic_year, semester, month_index)
);

-- Fast lookup of periods by academic year and semester
CREATE INDEX IF NOT EXISTS idx_academic_months_year ON academic_months(academic_year, semester);

-- Fast lookup of evaluation months (for scheduling)
CREATE INDEX IF NOT EXISTS idx_academic_months_eval ON academic_months(is_evaluation_month)
    WHERE is_evaluation_month = TRUE;

-- ============================================================
-- PROJECT MONTH PLANS TABLE — Monthly planning records
-- ============================================================
-- Each team submits a plan for what they'll accomplish each month.
-- Plans become IMMUTABLE once submitted — you can only submit
-- a new version (higher version number), never edit existing ones.
--
-- This supports temporal queries:
--   "What did team X plan to do in October 2026?"
-- ============================================================
CREATE TABLE IF NOT EXISTS project_month_plans (
    -- Primary key for this plan entry
    plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which project this plan belongs to
    -- ON DELETE RESTRICT = can't delete a project with plans
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE RESTRICT,

    -- Which academic month period this plan covers
    period_id UUID NOT NULL REFERENCES academic_months(period_id),

    -- The plan text — what the team intends to accomplish
    -- Must be non-empty (NOT NULL) to prevent blank submissions
    plan_text TEXT NOT NULL,

    -- When this plan was submitted (set once, never changes)
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Who submitted this plan (must be a project member)
    submitted_by UUID NOT NULL REFERENCES persons(person_id),

    -- Whether this plan was submitted AFTER an evaluation freeze
    -- If true, evaluators should know this was a late submission
    -- Does NOT block submission — just flags it for transparency
    submitted_after_freeze BOOLEAN NOT NULL DEFAULT FALSE,

    -- Version number for this plan (project + period combination)
    -- Version 1 = original plan, Version 2 = revised plan, etc.
    -- Plans are NEVER updated — new versions are new rows
    version INTEGER NOT NULL DEFAULT 1,

    -- Timestamp of plan creation (same as submitted_at for new plans)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- UNIQUE: only one plan per project per period per version
    -- Prevents duplicate submissions
    UNIQUE(project_id, period_id, version)
);

-- Fast lookup of plans by project and period
CREATE INDEX IF NOT EXISTS idx_project_plans ON project_month_plans(project_id, period_id);

-- Fast lookup of plans by submitter
CREATE INDEX IF NOT EXISTS idx_project_plans_submitter ON project_month_plans(submitted_by);

-- ============================================================
-- WORK LOGS TABLE — Individual member work records
-- ============================================================
-- Each team member records their work for each academic month.
-- Work logs capture: what they did, how many hours they spent.
-- These logs can be frozen when evaluation begins for that period.
--
-- Work logs are INFORMATIONAL — they help evaluators understand
-- what each member contributed, but do NOT directly affect scores.
-- Scores are determined by comparative evaluation, not self-reports.
-- ============================================================
CREATE TABLE IF NOT EXISTS work_logs (
    -- Primary key for this work log entry
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which project this work log belongs to
    -- ON DELETE RESTRICT = can't delete a project with work logs
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE RESTRICT,

    -- Which person wrote this work log
    -- Must be an active member of the project during this period
    person_id UUID NOT NULL REFERENCES persons(person_id),

    -- Which academic month period this work log covers
    period_id UUID NOT NULL REFERENCES academic_months(period_id),

    -- Description of work performed during this period
    -- Must be non-empty — blank work logs are not allowed
    work_description TEXT NOT NULL,

    -- Self-reported hours spent during this period
    -- CHECK: must be non-negative and capped at 200 (reasonable monthly max)
    -- This is purely informational — not used in scoring calculations
    hours_spent DECIMAL(5,2) CHECK (hours_spent >= 0 AND hours_spent <= 200),

    -- When this work log was submitted
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- When this work log was last modified (NULL if never modified)
    -- Can only be modified BEFORE the period is frozen
    last_modified_at TIMESTAMPTZ,

    -- Whether this work log is frozen (locked for evaluation)
    -- Once frozen: NO modifications allowed at all
    -- Frozen by the FreezeService when evaluation starts
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,

    -- When this work log was frozen (NULL if not yet frozen)
    frozen_at TIMESTAMPTZ,

    -- UNIQUE: only one work log per person per project per period
    -- A member can only have one log entry per month per project
    UNIQUE(project_id, person_id, period_id)
);

-- Fast lookup of work logs by project and period
-- Used when displaying all member contributions for a month
CREATE INDEX IF NOT EXISTS idx_work_logs_temporal ON work_logs(project_id, period_id);

-- Fast lookup of work logs by person and period
-- Used when displaying a person's contributions across projects
CREATE INDEX IF NOT EXISTS idx_member_work ON work_logs(person_id, period_id);

-- Fast filter for frozen work logs
CREATE INDEX IF NOT EXISTS idx_work_logs_frozen ON work_logs(is_frozen) WHERE is_frozen = TRUE;
