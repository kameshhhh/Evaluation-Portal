-- ============================================================
-- MIGRATION 025: Student Track Selection & Team Formation
-- ============================================================
-- Phase 1 of Session Planner system.
-- 
-- Adds:
--   1. student_track_selections — one-time track choice per student
--   2. team_formation_requests — leader-initiated team invites
--   3. Extends project_members trigger to support track-based sizes
--
-- Tracks:
--   - "core"       → team of 3-4 (leader picks members)
--   - "it_core"    → solo (team size = 1, auto-created)
--   - "premium"    → team of 1-2 (strict)
--
-- Team Formation Flow:
--   Student selects track → for core/premium: picks members →
--   invitations sent → members accept → admin approves → team formed
--   For it_core: auto solo team, no invitation needed
-- ============================================================

-- ============================================================
-- 1. STUDENT TRACK SELECTIONS
-- One-time choice: core / it_core / premium
-- Once selected, cannot be changed
-- ============================================================
CREATE TABLE IF NOT EXISTS student_track_selections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,
    track           VARCHAR(20) NOT NULL CHECK (track IN ('core', 'it_core', 'premium')),
    academic_year   INTEGER NOT NULL,
    semester        INTEGER NOT NULL CHECK (semester IN (1, 2)),
    selected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Each student can only select a track once per academic year+semester
    CONSTRAINT uq_student_track UNIQUE (person_id, academic_year, semester)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_student_track_person 
    ON student_track_selections(person_id);
CREATE INDEX IF NOT EXISTS idx_student_track_year_sem 
    ON student_track_selections(academic_year, semester);

-- ============================================================
-- 2. TEAM FORMATION REQUESTS
-- Tracks the team building workflow:
--   pending → accepted/rejected by each member → admin_approved/admin_rejected
-- ============================================================
CREATE TABLE IF NOT EXISTS team_formation_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- The project being formed (created in draft state first)
    project_id      UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    
    -- Who initiated the team (team leader)
    leader_id       UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,
    
    -- Track determines team size rules
    track           VARCHAR(20) NOT NULL CHECK (track IN ('core', 'it_core', 'premium')),
    
    -- Overall status of the team formation
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' 
                    CHECK (status IN (
                        'pending',           -- waiting for member responses
                        'members_accepted',  -- all members accepted, awaiting admin
                        'admin_approved',    -- admin approved, team is official
                        'admin_rejected',    -- admin rejected
                        'cancelled',         -- leader cancelled
                        'expired'            -- timed out
                    )),
    
    academic_year   INTEGER NOT NULL,
    semester        INTEGER NOT NULL CHECK (semester IN (1, 2)),
    
    -- Admin who approved/rejected
    reviewed_by     UUID REFERENCES persons(person_id),
    reviewed_at     TIMESTAMPTZ,
    review_note     TEXT,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One active formation per project
    CONSTRAINT uq_team_formation_project UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_team_formation_leader 
    ON team_formation_requests(leader_id);
CREATE INDEX IF NOT EXISTS idx_team_formation_status 
    ON team_formation_requests(status);
CREATE INDEX IF NOT EXISTS idx_team_formation_track 
    ON team_formation_requests(track);

-- ============================================================
-- 3. TEAM INVITATIONS
-- Individual invitation per member in a team formation
-- ============================================================
CREATE TABLE IF NOT EXISTS team_invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Links to the formation request
    formation_id    UUID NOT NULL REFERENCES team_formation_requests(id) ON DELETE CASCADE,
    
    -- The student being invited
    invitee_id      UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,
    
    -- Invitation status
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    
    responded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Each student can only be invited once per formation
    CONSTRAINT uq_invitation_per_formation UNIQUE (formation_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_team_invitation_invitee 
    ON team_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_team_invitation_status 
    ON team_invitations(status);

-- ============================================================
-- 4. SESSION PLANNER ASSIGNMENTS
-- Admin/Faculty assigns faculty evaluators → students/teams
-- ============================================================
CREATE TABLE IF NOT EXISTS session_planner_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Which evaluation session this belongs to
    session_id      UUID NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
    
    -- The faculty evaluator
    faculty_id      UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,
    
    -- The assigned student (individual)
    student_id      UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,
    
    -- Optional: if assigned via a project/team
    project_id      UUID REFERENCES projects(project_id) ON DELETE SET NULL,
    
    -- Who made this assignment
    assigned_by     UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,
    
    -- Assignment status
    status          VARCHAR(20) NOT NULL DEFAULT 'assigned'
                    CHECK (status IN (
                        'assigned',          -- faculty is assigned to evaluate this student
                        'evaluation_done',   -- faculty has completed evaluation
                        'feedback_given',    -- student has given feedback to faculty
                        'completed',         -- both directions done
                        'removed'            -- removed after completion
                    )),
    
    -- Track the bidirectional evaluation progress
    faculty_evaluated_at    TIMESTAMPTZ,    -- when faculty submitted evaluation
    student_feedback_at     TIMESTAMPTZ,    -- when student gave feedback
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Each student can only be assigned to ONE faculty per session
    CONSTRAINT uq_student_faculty_session UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_planner_session 
    ON session_planner_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_planner_faculty 
    ON session_planner_assignments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_planner_student 
    ON session_planner_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_planner_project 
    ON session_planner_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_planner_status 
    ON session_planner_assignments(status);

-- ============================================================
-- 5. HELPER VIEW — Students available for team formation
-- Shows students who have selected a track but are NOT yet
-- in an approved team (for the current academic period)
-- ============================================================
CREATE OR REPLACE VIEW available_students_for_teams AS
SELECT 
    sts.person_id,
    sts.track,
    sts.academic_year,
    sts.semester,
    p.display_name,
    p.department_code,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM team_formation_requests tfr
            JOIN team_invitations ti ON ti.formation_id = tfr.id
            WHERE (ti.invitee_id = sts.person_id OR tfr.leader_id = sts.person_id)
            AND tfr.status IN ('pending', 'members_accepted', 'admin_approved')
            AND tfr.academic_year = sts.academic_year
            AND tfr.semester = sts.semester
        ) THEN true
        ELSE false
    END AS has_pending_or_approved_team
FROM student_track_selections sts
JOIN persons p ON p.person_id = sts.person_id
WHERE p.person_type = 'student'
  AND p.status = 'active'
  AND p.is_deleted = false;

-- ============================================================
-- 6. HELPER VIEW — Session planner overview
-- Shows assignment counts per faculty per session
-- ============================================================
CREATE OR REPLACE VIEW session_planner_overview AS
SELECT 
    spa.session_id,
    spa.faculty_id,
    fp.display_name AS faculty_name,
    fp.department_code AS faculty_department,
    COUNT(*) AS total_students,
    COUNT(*) FILTER (WHERE spa.status = 'assigned') AS pending_evaluation,
    COUNT(*) FILTER (WHERE spa.status = 'evaluation_done') AS evaluated,
    COUNT(*) FILTER (WHERE spa.status = 'feedback_given') AS feedback_received,
    COUNT(*) FILTER (WHERE spa.status = 'completed') AS completed
FROM session_planner_assignments spa
JOIN persons fp ON fp.person_id = spa.faculty_id
WHERE spa.status != 'removed'
GROUP BY spa.session_id, spa.faculty_id, fp.display_name, fp.department_code;
