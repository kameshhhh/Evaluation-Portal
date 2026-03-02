-- ============================================================
-- MIGRATION 002: CREATE PROJECT TABLES
-- ============================================================
-- Creates the projects, project_state_transitions, and
-- project_members tables.
--
-- Projects are the PRIMARY entities that get evaluated.
-- They have a strict lifecycle managed by a state machine:
--   DRAFT → ACTIVE → UNDER_REVIEW → LOCKED → ARCHIVED
--
-- Project members are constrained to 2-4 per project.
-- This is enforced by a database trigger function.
--
-- Run: psql -d bitsathy_auth -f 002_create_project_tables.sql
-- ============================================================

-- ============================================================
-- PROJECTS TABLE — The main entity that gets evaluated
-- ============================================================
-- Each project is created by a team of 2-4 members.
-- Projects move through strict lifecycle states.
-- Once frozen for evaluation, they become immutable snapshots.
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
    -- Immutable primary identifier — UUID v4, never changes
    -- This is what evaluation scores are recorded against
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Project title — human-readable name for display
    -- Max 200 chars — enforced at DB level to prevent abuse
    title VARCHAR(200) NOT NULL,

    -- Detailed description of the project
    -- TEXT type = unlimited length for comprehensive descriptions
    description TEXT,

    -- Academic year this project belongs to (e.g., 2026, 2027)
    -- Used for grouping projects into evaluation cohorts
    academic_year INTEGER NOT NULL,

    -- Semester within the academic year
    -- 1 = Odd semester (June-November)
    -- 2 = Even semester (December-May)
    -- CHECK constraint enforces only valid values
    semester INTEGER NOT NULL CHECK (semester IN (1, 2)),

    -- Project temporal boundaries
    -- start_date: when the project officially begins
    -- expected_end_date: when the project is expected to complete
    start_date DATE NOT NULL,
    expected_end_date DATE NOT NULL,

    -- Current lifecycle state — managed by the state machine
    -- 'draft' = initial state, team formation and setup
    -- 'active' = project is underway, work logs being recorded
    -- 'under_review' = evaluation in progress, modifications restricted
    -- 'locked' = evaluation complete, permanently immutable
    -- 'archived' = terminal state, project is historical record
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'under_review', 'locked', 'archived')),

    -- Freeze metadata — populated when project enters evaluation
    -- frozen_at: timestamp when the freeze was applied
    frozen_at TIMESTAMPTZ,

    -- frozen_by: which person (usually a faculty/admin) triggered the freeze
    frozen_by UUID REFERENCES persons(person_id),

    -- freeze_version: counter for how many times this project has been frozen
    -- Increments each evaluation cycle to track snapshot versions
    freeze_version INTEGER NOT NULL DEFAULT 0,

    -- Audit trail: creation
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES persons(person_id),

    -- Audit trail: last modification
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID NOT NULL REFERENCES persons(person_id),

    -- Optimistic locking version — prevents lost concurrent updates
    version INTEGER NOT NULL DEFAULT 1,

    -- Soft-delete flag — NEVER hard-delete projects
    -- Historical projects are preserved for 7+ year compliance
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

    -- CONSTRAINT: start_date must be before expected_end_date
    -- Prevents impossible date ranges at the database level
    CONSTRAINT valid_dates CHECK (start_date < expected_end_date),

    -- CONSTRAINT: project duration cannot exceed 1 year
    -- Prevents accidentally creating multi-year projects
    CONSTRAINT max_duration CHECK (expected_end_date <= start_date + INTERVAL '1 year')
);

-- ============================================================
-- INDEXES on projects table for query performance
-- ============================================================

-- Filter by status (most common query: "show all active projects")
CREATE INDEX IF NOT EXISTS idx_project_status ON projects(status);

-- Filter by academic year + semester (evaluation cohort queries)
CREATE INDEX IF NOT EXISTS idx_project_academic_year ON projects(academic_year, semester);

-- Find frozen projects (evaluation session queries)
CREATE INDEX IF NOT EXISTS idx_project_frozen ON projects(frozen_at) WHERE frozen_at IS NOT NULL;

-- Exclude soft-deleted projects from normal queries
CREATE INDEX IF NOT EXISTS idx_project_active ON projects(is_deleted) WHERE is_deleted = FALSE;

-- ============================================================
-- PROJECT STATE TRANSITIONS — Audit trail for lifecycle changes
-- ============================================================
-- Every time a project changes state, a row is appended here.
-- This is APPEND-ONLY — transitions are never updated or deleted.
-- Enables: "show me every state change for project X"
-- ============================================================
CREATE TABLE IF NOT EXISTS project_state_transitions (
    -- Primary key for this transition record
    transition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which project transitioned
    -- ON DELETE RESTRICT = can't delete a project with transition history
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE RESTRICT,

    -- The state the project was in BEFORE the transition
    from_status VARCHAR(20) NOT NULL,

    -- The state the project moved TO after the transition
    to_status VARCHAR(20) NOT NULL,

    -- When the transition happened
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Which person triggered the transition
    transitioned_by UUID NOT NULL REFERENCES persons(person_id),

    -- Human-readable reason for the transition (optional)
    -- Example: "Ready for mid-semester evaluation"
    reason TEXT,

    -- Additional metadata about the transition as JSON
    -- Example: {"evaluation_session_id": "uuid", "auto_transition": false}
    metadata JSONB
);

-- Fast lookup of transitions by project, newest first
CREATE INDEX IF NOT EXISTS idx_project_transitions ON project_state_transitions(project_id, transitioned_at DESC);

-- ============================================================
-- PROJECT MEMBERS TABLE — Team membership with 2-4 constraint
-- ============================================================
-- Links persons to projects with temporal membership tracking.
-- A person joins a project (joined_at) and optionally leaves (left_at).
-- The team size constraint (2-4 active members) is enforced by a trigger.
--
-- DESIGN: Composite primary key includes joined_at because a person
-- could leave and rejoin the same project (rare but possible).
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
    -- Which project this membership belongs to
    -- ON DELETE RESTRICT = can't delete a project with members
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE RESTRICT,

    -- Which person is a member
    -- ON DELETE RESTRICT = can't delete a person who is a project member
    person_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,

    -- Informational role within the project (visible to judges)
    -- Example: "Team Lead", "Backend Developer", "Designer"
    -- This is PURELY informational — it does NOT affect scoring
    role_in_project VARCHAR(50),

    -- Self-declared contribution percentage
    -- Used for reference/display, NOT for score calculation
    -- Scores are determined by comparative evaluation, not self-reporting
    -- CHECK constraint ensures 0-100 range
    declared_share_percentage DECIMAL(5,2) CHECK (
        declared_share_percentage >= 0 AND declared_share_percentage <= 100
    ),

    -- When this person joined the project
    -- Set at INSERT time, never changes
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- When this person left the project (NULL = still active member)
    -- Only set if the person formally leaves the team
    left_at TIMESTAMPTZ,

    -- Reason for leaving (if applicable)
    -- Example: "Switched to another project", "Graduated mid-semester"
    left_reason TEXT,

    -- Audit trail: who added this member
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES persons(person_id),

    -- Composite primary key: project + person + join time
    -- This allows tracking if someone leaves and rejoins
    PRIMARY KEY (project_id, person_id, joined_at)
);

-- Partial unique index: only one ACTIVE membership per person per project
-- left_at IS NULL means "currently active"
-- This prevents a person from being added twice without leaving first
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_membership
    ON project_members(project_id, person_id)
    WHERE left_at IS NULL;

-- Fast lookup of all members for a project
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id) WHERE left_at IS NULL;

-- Fast lookup of all projects for a person
CREATE INDEX IF NOT EXISTS idx_project_members_person ON project_members(person_id) WHERE left_at IS NULL;

-- ============================================================
-- TEAM SIZE ENFORCEMENT TRIGGER
-- ============================================================
-- This trigger runs AFTER every INSERT or UPDATE on project_members.
-- It counts the active members and raises an exception if the count
-- is outside the allowed range of 2-4.
--
-- NOTE: The trigger only enforces the UPPER bound (max 4) on INSERT.
-- The LOWER bound (min 2) is enforced at the application level during
-- project creation and activation, because a project starts with 0
-- members and grows to 2+ during the creation transaction.
-- ============================================================
CREATE OR REPLACE FUNCTION check_team_size_constraint()
RETURNS TRIGGER AS $$
DECLARE
    -- Variable to hold the current count of active members
    current_count INTEGER;
BEGIN
    -- Count active members (where left_at is NULL) for this project
    SELECT COUNT(*)
    INTO current_count
    FROM project_members
    WHERE project_id = NEW.project_id
      AND left_at IS NULL;

    -- Enforce maximum team size of 4
    -- We only check the upper bound in the trigger
    -- Lower bound (2) is checked at application level during creation
    IF current_count > 4 THEN
        -- Raise exception blocks the INSERT/UPDATE transaction
        RAISE EXCEPTION 'TEAM_SIZE_TOO_LARGE: Project cannot have more than 4 active members (current: %)', current_count;
    END IF;

    -- Return NEW to allow the INSERT/UPDATE to proceed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists (idempotent recreation)
DROP TRIGGER IF EXISTS enforce_team_size ON project_members;

-- Create the trigger to fire AFTER each row INSERT or UPDATE
CREATE TRIGGER enforce_team_size
    AFTER INSERT OR UPDATE ON project_members
    FOR EACH ROW
    EXECUTE FUNCTION check_team_size_constraint();
