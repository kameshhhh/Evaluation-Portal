-- ============================================================
-- MIGRATION 005: CREATE AUDIT & INTEGRITY TABLES
-- ============================================================
-- Creates tables for:
--   entity_freeze_snapshots: immutable snapshots for evaluation
--   entity_change_audit: append-only change log for all entities
--   integrity_verifications: records of scheduled integrity checks
--
-- These tables form the TAMPER-PROOF foundation of the system.
-- Without these, evaluation fairness cannot be guaranteed.
-- ============================================================

-- ============================================================
-- ENTITY FREEZE SNAPSHOTS — Immutable evaluation context
-- ============================================================
-- When an evaluation session opens, every project being evaluated
-- is "frozen" — a complete JSON snapshot of its state is recorded.
-- Evaluators see THIS snapshot, not the live project data.
--
-- This ensures:
-- 1. All evaluators see the exact same data (consistency)
-- 2. Teams can't modify projects during evaluation (immutability)
-- 3. We can prove what was evaluated later (auditability)
--
-- Snapshots are cryptographically hashed to detect tampering.
-- ============================================================
CREATE TABLE IF NOT EXISTS entity_freeze_snapshots (
    -- Primary key for this snapshot
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which evaluation session triggered this freeze
    session_id UUID NOT NULL REFERENCES evaluation_sessions(session_id),

    -- What type of entity was frozen
    -- 'project' = project with its team, plans, and work logs
    -- 'person' = individual person's state at evaluation time
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('project', 'person')),

    -- The ID of the entity that was frozen
    -- References either projects.project_id or persons.person_id
    -- We don't use a direct FK because this column is polymorphic
    entity_id UUID NOT NULL,

    -- Complete frozen state as JSON
    -- For projects: includes project metadata, team, plans, work logs
    -- For persons: includes person metadata, roles, department
    -- This is the AUTHORITATIVE data that evaluators see
    frozen_state JSONB NOT NULL,

    -- When the freeze was captured (immutable)
    frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- SHA-256 hash of the frozen_state JSON
    -- Used to verify the snapshot hasn't been tampered with
    -- Calculated as: SHA256(frozen_state + frozen_at + entity_id)
    state_hash VARCHAR(64) NOT NULL,

    -- Hash of the PREVIOUS snapshot for this entity in this session
    -- NULL if this is the first snapshot for this entity
    -- Creates a hash chain for tamper detection
    previous_snapshot_hash VARCHAR(64),

    -- Creation timestamp (same as frozen_at for new snapshots)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- UNIQUE: only one snapshot per entity per session
    -- A project can only be frozen once per evaluation session
    UNIQUE(session_id, entity_type, entity_id)
);

-- Fast lookup of snapshots by session and entity type
CREATE INDEX IF NOT EXISTS idx_freeze_snapshots ON entity_freeze_snapshots(session_id, entity_type);

-- Fast lookup of snapshots by entity ID (for entity history queries)
CREATE INDEX IF NOT EXISTS idx_freeze_snapshots_entity ON entity_freeze_snapshots(entity_id);

-- ============================================================
-- ENTITY CHANGE AUDIT — Append-only change log
-- ============================================================
-- EVERY change to EVERY entity goes through this table.
-- It records what changed, who changed it, when, and why.
--
-- This is the "black box flight recorder" of the evaluation system.
-- If something goes wrong, we can replay all changes to find
-- exactly what happened and who was responsible.
--
-- APPEND-ONLY: rows are NEVER updated or deleted in this table.
-- ============================================================
CREATE TABLE IF NOT EXISTS entity_change_audit (
    -- Primary key for this audit entry
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What type of entity was changed
    -- Examples: 'project', 'person', 'project_member', 'work_log'
    entity_type VARCHAR(50) NOT NULL,

    -- The ID of the entity that was changed
    -- Combined with entity_type, uniquely identifies the entity
    entity_id UUID NOT NULL,

    -- What type of action was performed
    -- 'CREATE' = new entity created
    -- 'UPDATE' = existing entity modified
    -- 'DELETE' = entity soft-deleted (never hard-deleted)
    -- 'STATE_CHANGE' = lifecycle state transition
    action VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'STATE_CHANGE')),

    -- State of the entity BEFORE the change (NULL for CREATE)
    -- Stored as JSONB for flexible field-level diffing
    old_values JSONB,

    -- State of the entity AFTER the change (NULL for DELETE)
    -- Stored as JSONB — can diff old_values vs new_values
    new_values JSONB,

    -- When the change was recorded
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Who made the change
    changed_by UUID NOT NULL REFERENCES persons(person_id),

    -- Request correlation ID for tracing across systems
    -- Links this audit entry to the HTTP request that caused it
    request_id VARCHAR(100),

    -- IP address of the user who made the change
    -- Stored for security forensics
    user_ip INET,

    -- User-Agent header from the request
    -- Helps identify if changes came from browser, API client, etc.
    user_agent TEXT
);

-- Fast lookup of all changes to a specific entity, newest first
-- Essential query: "show me all changes to project X"
CREATE INDEX IF NOT EXISTS idx_change_audit ON entity_change_audit(entity_type, entity_id, changed_at DESC);

-- Fast lookup by time (for "what happened in the last hour?" queries)
CREATE INDEX IF NOT EXISTS idx_audit_temporal ON entity_change_audit(changed_at);

-- Fast lookup by actor (for "what did person Y change?" queries)
CREATE INDEX IF NOT EXISTS idx_audit_actor ON entity_change_audit(changed_by, changed_at DESC);

-- ============================================================
-- INTEGRITY VERIFICATIONS — Scheduled integrity check records
-- ============================================================
-- Records the results of automated integrity verification runs.
-- The IntegrityVerificationService runs periodically (e.g., hourly)
-- and checks: team sizes, hash chains, temporal consistency, etc.
--
-- Each run produces a verification record with pass/fail counts.
-- Failed checks trigger alerts for manual investigation.
-- ============================================================
CREATE TABLE IF NOT EXISTS integrity_verifications (
    -- Primary key for this verification run
    verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What type of verification was performed
    -- Examples: 'team_size', 'hash_chain', 'temporal_consistency'
    verification_type VARCHAR(50) NOT NULL,

    -- When the verification was performed
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Who triggered the verification (NULL for automated/cron runs)
    verified_by UUID REFERENCES persons(person_id),

    -- Number of checks that passed in this run
    checks_passed INTEGER NOT NULL,

    -- Number of checks that failed in this run
    -- If > 0, failure_details contains specifics
    checks_failed INTEGER NOT NULL,

    -- Detailed information about each failure
    -- Stored as JSONB array: [{"entity_id":"uuid","issue":"..."}]
    failure_details JSONB,

    -- Whether the system attempted automated repair
    auto_fixed BOOLEAN NOT NULL DEFAULT FALSE,

    -- Whether a human needs to investigate
    -- true = automated repair couldn't fix the issue
    manual_intervention_required BOOLEAN NOT NULL DEFAULT FALSE
);

-- Fast lookup of verification results by time and type
CREATE INDEX IF NOT EXISTS idx_integrity_verifications ON integrity_verifications(verified_at, verification_type);

-- Fast lookup of verifications that need manual attention
CREATE INDEX IF NOT EXISTS idx_integrity_manual ON integrity_verifications(manual_intervention_required)
    WHERE manual_intervention_required = TRUE;
