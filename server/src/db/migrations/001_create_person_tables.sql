-- ============================================================
-- MIGRATION 001: CREATE PERSON TABLES
-- ============================================================
-- Creates the 'persons' table and 'person_history' table.
-- persons: maps authenticated identities to evaluatable entities.
-- person_history: append-only audit trail of all person changes.
--
-- The persons table links to the existing users table via identity_id.
-- This is an ADDITIVE migration — it does NOT modify existing tables.
--
-- Run: psql -d bitsathy_auth -f 001_create_person_tables.sql
-- ============================================================

-- Enable pgcrypto for gen_random_uuid() if not already enabled
-- Our existing initDatabase.js enables this, but we re-declare for safety
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PERSONS TABLE — The evaluatable entity derived from identity
-- ============================================================
-- Each authenticated user (from the users table) gets a person record.
-- person_type determines their role in the evaluation system.
-- status tracks their lifecycle (active → graduated → archived).
-- admission_year and department_code map to college ERP data.
--
-- DESIGN CHOICE: Separate from users table because:
--   - users table is for AUTHENTICATION (login/logout)
--   - persons table is for EVALUATION (projects/scores/reviews)
--   - Separation of concerns prevents auth changes from breaking eval
-- ============================================================
CREATE TABLE IF NOT EXISTS persons (
    -- Primary immutable identifier — UUID v4, never changes
    -- This is the person's identity within the evaluation system
    person_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to the authentication identity from Part 1 (users table)
    -- UNIQUE ensures one person per authenticated user
    -- REFERENCES ensures referential integrity — can't create ghost persons
    identity_id UUID NOT NULL UNIQUE REFERENCES users(internal_user_id) ON DELETE RESTRICT,

    -- Business classification of this person
    -- 'student' = can be project member and evaluation subject
    -- 'faculty' = can be evaluator and project guide
    -- 'admin' = can manage evaluation sessions and system settings
    -- CHECK constraint makes invalid types impossible at the DB level
    person_type VARCHAR(20) NOT NULL CHECK (person_type IN ('student', 'faculty', 'admin')),

    -- Lifecycle status of this person within the evaluation system
    -- 'active' = currently participating in projects/evaluations
    -- 'inactive' = temporarily not participating (leave, suspension)
    -- 'graduated' = completed studies, record preserved for history
    -- 'archived' = permanently removed from active evaluation
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'graduated', 'archived')),

    -- College-specific temporal metadata
    -- admission_year: when the student joined (e.g., 2023, 2024)
    -- Required for students — NULL for faculty/admin
    admission_year INTEGER,

    -- Department code from college ERP (CSE, ECE, MECH, etc.)
    -- Used for filtering and reporting, not for scoring
    department_code VARCHAR(10),

    -- Expected graduation year — used for temporal planning
    -- Required for students — NULL for faculty/admin
    graduation_year INTEGER,

    -- Full name for display purposes (informational only)
    -- Does NOT affect scoring — purely for human readability
    display_name VARCHAR(200),

    -- Audit trail: who created this record and when
    -- created_at is set once at INSERT time and never changes
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- created_by references the person who performed the creation
    -- For the very first person (bootstrap), this self-references
    created_by UUID REFERENCES persons(person_id),

    -- Audit trail: who last modified this record and when
    -- updated_at changes on every UPDATE operation
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- updated_by references the person who performed the last update
    updated_by UUID REFERENCES persons(person_id),

    -- Optimistic locking version counter
    -- Every UPDATE increments this by 1
    -- Prevents lost updates when two admins edit the same person
    -- Before UPDATE: check that version matches, else reject
    version INTEGER NOT NULL DEFAULT 1,

    -- Soft-delete flag — we NEVER hard-delete persons
    -- false = this person's record is archived but preserved
    -- Essential for 7+ year audit compliance
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

    -- CONSTRAINT: Students MUST have an admission_year
    -- Faculty and admin do NOT have admission years
    -- This makes invalid data impossible at the database level
    CONSTRAINT valid_student_years CHECK (
        (person_type = 'student' AND admission_year IS NOT NULL) OR
        (person_type != 'student')
    )
);

-- ============================================================
-- INDEXES on persons table for query performance
-- ============================================================

-- Fast lookup by identity_id (used during login → person resolution)
CREATE INDEX IF NOT EXISTS idx_person_identity ON persons(identity_id);

-- Filter by type and status (used for listing active students, faculty)
CREATE INDEX IF NOT EXISTS idx_person_type_status ON persons(person_type, status);

-- Filter by department (used for department-level reports)
CREATE INDEX IF NOT EXISTS idx_person_department ON persons(department_code);

-- Filter by admission year (used for batch/cohort queries)
CREATE INDEX IF NOT EXISTS idx_person_admission ON persons(admission_year);

-- ============================================================
-- PERSON HISTORY TABLE — Append-only audit trail
-- ============================================================
-- Every change to a person record creates a new row here.
-- NEVER updated, NEVER deleted — truly append-only.
-- The hash chain ensures cryptographic integrity:
--   current_hash = SHA256(snapshot + previous_hash)
-- If anyone tampers with historical records, the chain breaks.
-- ============================================================
CREATE TABLE IF NOT EXISTS person_history (
    -- Primary key for this history entry
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which person this history entry belongs to
    -- ON DELETE RESTRICT = cannot delete a person with history
    person_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,

    -- Complete snapshot of ALL person fields at the time of change
    -- Stored as JSONB for flexible querying without schema changes
    -- Example: {"person_type":"student","status":"active","department_code":"CSE"}
    snapshot JSONB NOT NULL,

    -- When this change was recorded (immutable)
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Who made this change (immutable)
    changed_by UUID REFERENCES persons(person_id),

    -- What kind of change was made
    -- 'create' = initial person creation
    -- 'update' = field modification (status, department, etc.)
    -- 'status_change' = lifecycle state transition
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('create', 'update', 'status_change')),

    -- Human-readable reason for the change (optional)
    -- Example: "Student graduated in May 2026"
    change_reason TEXT,

    -- Hash of the PREVIOUS history record for this person
    -- NULL for the very first history entry
    -- Creates a cryptographic chain that detects tampering
    previous_hash VARCHAR(64),

    -- SHA-256 hash of THIS record's content
    -- Calculated as: SHA256(snapshot + changed_at + changed_by + previous_hash)
    current_hash VARCHAR(64) NOT NULL
);

-- Fast lookup of history by person, ordered newest first
-- Essential for "what was this person's state on date X?" queries
CREATE INDEX IF NOT EXISTS idx_person_history ON person_history(person_id, changed_at DESC);

-- Fast lookup by change type for audit reports
CREATE INDEX IF NOT EXISTS idx_person_history_type ON person_history(change_type);
