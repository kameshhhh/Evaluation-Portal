-- ============================================================
-- ACADEMIC IDENTITY INFRASTRUCTURE — DATABASE MIGRATION
-- ============================================================
-- Adds academic metadata columns to the persons table and
-- creates the academic_history audit table.
--
-- BACKWARD COMPATIBLE:
--   - All new columns are NULLABLE (no existing rows break)
--   - No existing columns are modified or dropped
--   - No existing constraints are changed
--   - Rollback is safe: just drop columns and table
--
-- RUN THIS MIGRATION:
--   psql -U postgres -d bitsathy_auth -f server/src/migrations/004_academic_identity.sql
-- ============================================================

-- ============================================================
-- STEP 1: Add academic columns to persons table
-- These columns store the parsed academic identity data
-- ============================================================

-- Department name column (full official name from registry)
-- Complements the existing department_code column
-- Example: 'Mechatronics Engineering', 'Computer Science Engineering'
ALTER TABLE persons
ADD COLUMN IF NOT EXISTS department_name VARCHAR(100);

-- Academic confidence level for the department/year inference
-- HIGH = parsed from email and validated against registry
-- LOW = could not be parsed, needs manual input
-- ADMIN_OVERRIDE = manually set by admin
ALTER TABLE persons
ADD COLUMN IF NOT EXISTS academic_confidence VARCHAR(20) DEFAULT 'LOW';

-- Flag indicating whether the user needs to manually complete
-- their academic profile (department, year, etc.)
-- true = profile is incomplete, show completion prompt
-- false = profile is complete (either parsed or manually set)
ALTER TABLE persons
ADD COLUMN IF NOT EXISTS requires_manual_completion BOOLEAN DEFAULT true;

-- Source of the academic data (how it was determined)
-- EMAIL_PARSER = automatically parsed from email
-- ADMIN_OVERRIDE = manually set by admin
-- MANUAL_INPUT = entered by user during profile completion
ALTER TABLE persons
ADD COLUMN IF NOT EXISTS academic_source VARCHAR(50) DEFAULT 'EMAIL_PARSER';

-- ============================================================
-- STEP 2: Create academic_history table
-- Audit trail for all academic identity changes
-- Every time department, year, or confidence changes, a row
-- is added here for traceability.
-- ============================================================
CREATE TABLE IF NOT EXISTS academic_history (
  -- Unique identifier for this history entry
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The person whose academic data changed
  -- References the PEMM persons table
  person_id UUID NOT NULL REFERENCES persons(person_id),

  -- What department code was set (may be null if removed)
  department_code VARCHAR(10),

  -- What department name was set
  department_name VARCHAR(100),

  -- What admission year was set (may be null if removed)
  admission_year INTEGER,

  -- Confidence level at the time of this change
  confidence VARCHAR(20) NOT NULL DEFAULT 'LOW',

  -- How this change was made
  -- EMAIL_PARSER = auto-parsed from email
  -- ADMIN_OVERRIDE = admin changed it manually
  -- MANUAL_INPUT = user completed their profile
  -- BACKFILL = data migration script
  source VARCHAR(50) NOT NULL DEFAULT 'EMAIL_PARSER',

  -- When this change was recorded
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who made the change (person_id of the actor)
  -- NULL = system (auto-parsed)
  -- UUID = specific admin or user
  changed_by UUID REFERENCES persons(person_id)
);

-- ============================================================
-- STEP 3: Create index for efficient history lookups
-- ============================================================

-- Index on person_id for fast history retrieval per person
CREATE INDEX IF NOT EXISTS idx_academic_history_person_id
ON academic_history(person_id);

-- Index on changed_at for chronological history queries
CREATE INDEX IF NOT EXISTS idx_academic_history_changed_at
ON academic_history(changed_at DESC);

-- ============================================================
-- STEP 4: Add comment annotations for documentation
-- ============================================================
COMMENT ON COLUMN persons.department_name IS 'Official department name from canonical registry';
COMMENT ON COLUMN persons.academic_confidence IS 'Confidence level: HIGH, LOW, or ADMIN_OVERRIDE';
COMMENT ON COLUMN persons.requires_manual_completion IS 'Whether user needs to manually complete academic profile';
COMMENT ON COLUMN persons.academic_source IS 'Source of academic data: EMAIL_PARSER, ADMIN_OVERRIDE, MANUAL_INPUT';
COMMENT ON TABLE academic_history IS 'Audit trail for academic identity changes per person';

-- ============================================================
-- MIGRATION COMPLETE
-- Verify: SELECT column_name FROM information_schema.columns WHERE table_name = 'persons';
-- Verify: SELECT * FROM academic_history LIMIT 0;
-- ============================================================
