-- ============================================================
-- MIGRATION 011: Fix Person Data Sync
-- ============================================================
-- PURPOSE: Ensure every authenticated user has a corresponding
-- person record in the PEMM system. Previously, person records
-- were created lazily (only on first dashboard visit), causing:
--   1. Faculty dashboard shows 0 students (no person records to query)
--   2. Admin dashboard shows incomplete user lists
--   3. Project membership breaks (references non-existent person_id)
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds last_login_at column to users table (missing, caused query error)
--   2. Backfills person records for any user that doesn't have one
--   3. Verifies all project_members.person_id references are valid
--
-- SAFE TO RUN MULTIPLE TIMES: Uses IF NOT EXISTS / ON CONFLICT
-- RUN: psql -d bitsathy_auth -f 011_fix_person_data_sync.sql
-- ============================================================

-- Enable UUID generation (already enabled, but re-declare for safety)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- STEP 1: Add last_login_at column to users table
-- ============================================================
-- The _getDepartmentStudents query references u.last_login_at
-- but this column was never created. This causes the query to
-- fail silently, returning an empty result, which makes the
-- Faculty "Students" tab appear empty.
-- ============================================================
DO $$
BEGIN
  -- Only add the column if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ DEFAULT NULL;
    RAISE NOTICE 'Added last_login_at column to users table';
  ELSE
    RAISE NOTICE 'last_login_at column already exists — skipping';
  END IF;
END
$$;

-- ============================================================
-- STEP 2: Backfill last_login_at from the most recent session
-- ============================================================
-- Use the user_sessions table to find the latest session per user
-- and set that as their last_login_at timestamp.
-- ============================================================
UPDATE users u
SET last_login_at = s.latest_login
FROM (
  -- user_sessions uses internal_user_id as the FK to users
  SELECT internal_user_id, MAX(issued_at) AS latest_login
  FROM user_sessions
  GROUP BY internal_user_id
) s
WHERE u.internal_user_id = s.internal_user_id
  AND u.last_login_at IS NULL;

-- ============================================================
-- STEP 3: Backfill missing person records
-- ============================================================
-- For every user in the users table that doesn't have a matching
-- person record (via identity_id), create one.
-- person_type is derived from user_role:
--   'student' → person_type = 'student'
--   'faculty' → person_type = 'faculty'
--   'admin'   → person_type = 'admin'
--   'pending' → person_type = 'student' (default assumption)
--
-- display_name is derived from the email prefix:
--   'john.doe@bitsathy.ac.in' → 'John Doe'
-- ============================================================
INSERT INTO persons (
  person_id,
  identity_id,
  person_type,
  status,
  display_name,
  department_code,
  admission_year,
  graduation_year,
  version
)
SELECT
  gen_random_uuid(),                                              -- Generate new person UUID
  u.internal_user_id,                                             -- Link to users table
  CASE                                                            -- Map user_role → person_type
    WHEN u.user_role = 'admin' THEN 'admin'
    WHEN u.user_role = 'faculty' THEN 'faculty'
    ELSE 'student'                                                -- pending/student both default to student
  END,
  'active',                                                       -- All backfilled persons start as active
  INITCAP(REPLACE(SPLIT_PART(u.normalized_email, '@', 1), '.', ' ')),  -- Email prefix → display name
  NULL,                                                           -- department_code filled by PersonProfileLinker later
  NULL,                                                           -- admission_year filled by PersonProfileLinker later
  NULL,                                                           -- graduation_year filled by PersonProfileLinker later
  1                                                               -- Initial version for optimistic locking
FROM users u
LEFT JOIN persons p ON p.identity_id = u.internal_user_id
WHERE p.person_id IS NULL                                         -- Only users without a person record
  AND u.is_active = true;                                         -- Skip deactivated users

-- ============================================================
-- STEP 4: Verify foreign key integrity
-- ============================================================
-- Check for project_members.person_id values that reference
-- non-existent person records. Log count for diagnostics.
-- ============================================================
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM project_members pm
  LEFT JOIN persons p ON pm.person_id = p.person_id
  WHERE p.person_id IS NULL;

  IF orphan_count > 0 THEN
    RAISE NOTICE 'WARNING: Found % orphan project_member records referencing non-existent persons', orphan_count;
  ELSE
    RAISE NOTICE 'All project_members.person_id references are valid';
  END IF;
END
$$;

-- ============================================================
-- STEP 5: Create index for faster person-by-identity lookups
-- ============================================================
-- PersonProfileLinker.findByIdentityId is called on every request
-- Ensure there's an index on the identity_id column
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_persons_identity_id ON persons(identity_id);

-- ============================================================
-- STEP 6: Summary diagnostic — how many records exist now
-- ============================================================
DO $$
DECLARE
  user_count INTEGER;
  person_count INTEGER;
  unlinked_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM users WHERE is_active = true;
  SELECT COUNT(*) INTO person_count FROM persons WHERE is_deleted = false;
  SELECT COUNT(*) INTO unlinked_count
  FROM users u
  LEFT JOIN persons p ON p.identity_id = u.internal_user_id
  WHERE p.person_id IS NULL AND u.is_active = true;

  RAISE NOTICE '=== MIGRATION 011 SUMMARY ===';
  RAISE NOTICE 'Active users:    %', user_count;
  RAISE NOTICE 'Active persons:  %', person_count;
  RAISE NOTICE 'Unlinked users:  % (should be 0)', unlinked_count;
  RAISE NOTICE '=============================';
END
$$;
