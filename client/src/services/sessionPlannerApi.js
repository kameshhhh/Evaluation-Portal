// ============================================================
// SESSION PLANNER API — Track, Team & Assignment Service
// ============================================================
import api from "./api";

const BASE = "/session-planner";

// Helper: extract server JSON from Axios response
const d = (promise) => promise.then((r) => r.data);

// ============================================================
// TRACK SELECTION
// ============================================================

/** Get current student's track selection */
export const getMyTrack = () => d(api.get(`${BASE}/my-track`));

/** Select a track (one-time) */
export const selectTrack = (track, academicYear, semester) =>
  d(api.post(`${BASE}/select-track`, { track, academicYear, semester }));

/** Get track configuration rules */
export const getTrackConfig = () => d(api.get(`${BASE}/track-config`));

// ============================================================
// TEAM FORMATION
// ============================================================

/** Get students available for team formation (same track, no team) */
export const getAvailableStudents = (academicYear, semester) =>
  d(
    api.get(`${BASE}/available-students`, {
      params: {
        academicYear: academicYear || new Date().getFullYear(),
        semester: semester || 1,
      },
    }),
  );

/** Create team (leader picks members) */
export const createTeamFormation = (memberIds, title, academicYear, semester) =>
  d(
    api.post(`${BASE}/create-team`, {
      memberIds,
      title,
      academicYear: academicYear || new Date().getFullYear(),
      semester: semester || 1,
    }),
  );

/** Get my team formation status */
export const getMyTeam = (academicYear, semester) =>
  d(api.get(`${BASE}/my-team`, { params: { academicYear, semester } }));

/** Get pending team invitations */
export const getPendingInvitations = () =>
  d(api.get(`${BASE}/pending-invitations`));

/** Respond to team invitation */
export const respondToInvitation = (invitationId, action) =>
  d(api.post(`${BASE}/invitations/${invitationId}/respond`, { action }));

// ============================================================
// ADMIN TEAM MANAGEMENT
// ============================================================

/** List all team formations (admin) */
export const listTeamFormations = (filters = {}) =>
  d(api.get(`${BASE}/admin/teams`, { params: filters }));

/** Approve a team formation (admin) */
export const approveTeamFormation = (formationId, note) =>
  d(api.post(`${BASE}/admin/teams/${formationId}/approve`, { note }));

/** Reject a team formation (admin) */
export const rejectTeamFormation = (formationId, note) =>
  d(api.post(`${BASE}/admin/teams/${formationId}/reject`, { note }));

// ============================================================
// SESSION PLANNER (Password-Gated)
// ============================================================

/** Verify planner access password */
export const verifyPlannerPassword = (password) =>
  d(api.post(`${BASE}/planner/verify-password`, { password }));

/** Get full planner overview for a session */
export const getPlannerOverview = (sessionId) =>
  d(api.get(`${BASE}/planner/overview/${sessionId}`));

/** Assign students to a faculty evaluator (Multi-Judge + Team Sync) */
export const assignFaculty = (sessionId, studentIds, facultyId) =>
  d(
    api.post(`${BASE}/planner/assign-faculty`, {
      sessionId,
      studentIds,
      facultyId,
    }),
  );

/** Check existing assignments for a student (for conflict popup) */
export const checkExistingAssignments = (sessionId, studentId) =>
  d(api.get(`${BASE}/planner/check-assignments/${sessionId}/${studentId}`));

/** Unassign a student from faculty */
export const unassignStudent = (sessionId, studentId, facultyId) =>
  d(api.delete(`${BASE}/planner/unassign`, { data: { sessionId, studentId, facultyId } }));

/** Submit per-rubric marks for a student (one-time, scarcity-validated)
 *  @param {string} sessionId
 *  @param {string} studentId
 *  @param {Object} rubricMarks - { rubricId: 0-5, ... }
 *  @param {Object} zeroFeedback - { rubricId: "reason text", ... } for rubrics with 0 marks
 *  @param {string} feedback - general feedback text
 */
export const submitMarks = (sessionId, studentId, rubricMarks, zeroFeedback = {}, feedback = '') =>
  d(
    api.post(`${BASE}/planner/submit-marks`, {
      sessionId,
      studentId,
      rubricMarks,
      zeroFeedback,
      feedback,
    }),
  );

// ============================================================
// ROLE-SPECIFIC VIEWS
// ============================================================

/** Faculty: get my assigned students */
export const getMyAssignments = (sessionId) =>
  d(api.get(`${BASE}/planner/my-assignments`, { params: { sessionId } }));

/** Student: get which faculty is assigned to me */
export const getMyEvaluator = (sessionId) =>
  d(api.get(`${BASE}/planner/my-evaluator`, { params: { sessionId } }));

/** Admin/Faculty: get all students with track + team info */
export const getAllStudentsWithInfo = () => d(api.get(`${BASE}/all-students`));

// ============================================================
// SESSION LISTING & HISTORY
// ============================================================

/** Faculty/Admin: get sessions assigned to me with student details */
export const getMySessions = () => d(api.get(`${BASE}/my-sessions`));

/** Admin/Faculty: get all sessions with assignment stats */
export const getSessionHistory = () => d(api.get(`${BASE}/session-history`));

// ============================================================
// SCHEDULING
// ============================================================

/** Faculty: set date/time/venue for a group of students */
export const setSchedule = (sessionId, studentIds, date, time, venue) =>
  d(
    api.post(`${BASE}/planner/set-schedule`, {
      sessionId,
      studentIds,
      date,
      time,
      venue,
    }),
  );

/** Faculty/Admin: get all schedules for a student in a session (conflict view) */
export const getStudentSchedules = (sessionId, studentId) =>
  d(api.get(`${BASE}/planner/student-schedules/${sessionId}/${studentId}`));

/** Student: see all my scheduled evaluations */
export const getMySchedules = () => d(api.get(`${BASE}/planner/my-schedules`));

// ============================================================
// SESSION CREATION (uses faculty-evaluation endpoint)
// ============================================================

/** Create a new evaluation session */
export const createSession = (data) =>
  d(api.post("/faculty-evaluation/admin/sessions", data));

// ============================================================
// AUTO-ASSIGNMENT SUGGESTIONS
// ============================================================

/** Get ranked faculty suggestions for a student */
export const suggestEvaluators = (sessionId, studentId) =>
  d(api.post(`${BASE}/planner/suggest-evaluators`, { sessionId, studentId }));

// ============================================================
// TEST AUTO-ASSIGNMENT (Admin Only)
// ============================================================

/** Trigger instant auto-assignment (Test Mode)
 *  @param {string}   sessionId   - Session UUID
 *  @param {string[]} rubricIds   - Exactly 3 evaluation head UUIDs
 *  @param {number}   minJudges   - 2 or 3
 */
export const testAutoAssign = (sessionId, rubricIds, minJudges) =>
  d(api.post(`${BASE}/planner/test-auto-assign`, { sessionId, rubricIds, minJudges }));

/** Clear all test assignments */
export const resetTestAssignments = () =>
  d(api.delete(`${BASE}/planner/test-auto-assign`));

// ============================================================
// SESSION FINALIZATION (Admin Only)
// ============================================================

/** Finalize a session — freeze credibility snapshot + weighted aggregation */
export const finalizeSession = (sessionId) =>
  d(api.post(`${BASE}/planner/finalize`, { sessionId }));

