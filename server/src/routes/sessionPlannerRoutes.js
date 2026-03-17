// ============================================================
// SESSION PLANNER ROUTES — Track, Team & Assignment API
// ============================================================
// Mounted at: /api/session-planner
//
// Sections:
//   1. Student track selection (any student)
//   2. Team formation (students)
//   3. Admin team approval
//   4. Session planner assignments (admin + faculty, password-gated)
//   5. Dashboard views (role-specific)
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  // Track
  getMyTrack,
  selectTrack,
  getTrackConfig,
  // Team
  getAvailableStudents,
  createTeam,
  getMyTeam,
  respondToInvitation,
  getPendingInvitations,
  // Admin team management
  listTeamFormations,
  approveTeam,
  rejectTeam,
  deleteTeam,
  // Session planner
  verifyPlannerPassword,
  getPlannerOverview,
  assignFaculty,
  checkExistingAssignments,
  unassignStudent,
  getMyAssignments,
  getMyEvaluator,
  getAllStudents,
  getMySessions,
  getSessionHistory,
  submitMarks,
  // Scheduling
  setSchedule,
  setMeetLink,
  getStudentSchedules,
  getMySchedules,
  testAutoAssign,
  resetTestAssignments,
  suggestEvaluators,
  finalizeSessionManual,
  // Session Groups
  createSessionGroup,
  listSessionGroups,
  getSessionGroupDetail,
} = require("../controllers/sessionPlannerController");

// ============================================================
// 1. TRACK SELECTION (Student)
// ============================================================
router.get("/track-config", authenticate, getTrackConfig);
router.get("/my-track", authenticate, authorize("student"), getMyTrack);
router.post("/select-track", authenticate, authorize("student"), selectTrack);

// ============================================================
// 2. TEAM FORMATION (Student)
// ============================================================
router.get(
  "/available-students",
  authenticate,
  authorize("student"),
  getAvailableStudents,
);
router.post("/create-team", authenticate, authorize("student"), createTeam);
router.get("/my-team", authenticate, authorize("student"), getMyTeam);
router.get(
  "/pending-invitations",
  authenticate,
  authorize("student"),
  getPendingInvitations,
);
router.post(
  "/invitations/:invitationId/respond",
  authenticate,
  authorize("student"),
  respondToInvitation,
);

// ============================================================
// 3. ADMIN TEAM MANAGEMENT
// ============================================================
router.get(
  "/admin/teams",
  authenticate,
  authorize("admin"),
  listTeamFormations,
);
router.post(
  "/admin/teams/:formationId/approve",
  authenticate,
  authorize("admin"),
  approveTeam,
);
router.post(
  "/admin/teams/:formationId/reject",
  authenticate,
  authorize("admin"),
  rejectTeam,
);
router.delete(
  "/admin/teams/:formationId",
  authenticate,
  authorize("admin"),
  deleteTeam,
);

// ============================================================
// 4. SESSION PLANNER (Admin + Faculty, Password-Gated)
// ============================================================
router.post(
  "/planner/verify-password",
  authenticate,
  authorize("admin", "faculty"),
  verifyPlannerPassword,
);
router.get(
  "/planner/overview/:sessionId",
  authenticate,
  authorize("admin", "faculty"),
  getPlannerOverview,
);
router.post(
  "/planner/assign-faculty",
  authenticate,
  authorize("admin", "faculty"),
  assignFaculty,
);
router.get(
  "/planner/check-assignments/:sessionId/:studentId",
  authenticate,
  authorize("admin", "faculty"),
  checkExistingAssignments,
);
router.delete(
  "/planner/unassign",
  authenticate,
  authorize("admin", "faculty"),
  unassignStudent,
);
router.post(
  "/planner/submit-marks",
  authenticate,
  authorize("admin", "faculty"),
  submitMarks,
);

// Auto-Assignment Suggestions
router.post(
  "/planner/suggest-evaluators",
  authenticate,
  authorize("admin", "faculty"),
  suggestEvaluators,
);

// Test Auto-Assignment (Admin Only)
router.post(
  "/planner/test-auto-assign",
  authenticate,
  authorize("admin"),
  testAutoAssign,
);
router.delete(
  "/planner/test-auto-assign",
  authenticate,
  authorize("admin"),
  resetTestAssignments,
);

// Session Finalization (Admin Only)
router.post(
  "/planner/finalize",
  authenticate,
  authorize("admin"),
  finalizeSessionManual,
);

// ============================================================
// 5. ROLE-SPECIFIC VIEWS
// ============================================================

// Faculty: see my assigned students
router.get(
  "/planner/my-assignments",
  authenticate,
  authorize("faculty", "admin"),
  getMyAssignments,
);

// Student: see which faculty is assigned to evaluate me
router.get(
  "/planner/my-evaluator",
  authenticate,
  authorize("student"),
  getMyEvaluator,
);

// Admin/Faculty: see all students with track + team info
router.get(
  "/all-students",
  authenticate,
  authorize("admin", "faculty"),
  getAllStudents,
);

// Faculty/Admin: my assigned sessions with student details
router.get(
  "/my-sessions",
  authenticate,
  authorize("admin", "faculty"),
  getMySessions,
);

// Admin/Faculty: all sessions history with assignment stats
router.get(
  "/session-history",
  authenticate,
  authorize("admin", "faculty"),
  getSessionHistory,
);

// ============================================================
// 6. SCHEDULING (Faculty + Student views)
// ============================================================

// Faculty: set date/time/venue for student group
router.post(
  "/planner/set-schedule",
  authenticate,
  authorize("admin", "faculty"),
  setSchedule,
);

// Faculty: send meet link to a specific student
router.post(
  "/planner/set-meet-link",
  authenticate,
  authorize("admin", "faculty"),
  setMeetLink,
);

// Faculty/Admin: get all schedules for a student in a session (conflict view)
router.get(
  "/planner/student-schedules/:sessionId/:studentId",
  authenticate,
  authorize("admin", "faculty"),
  getStudentSchedules,
);

// Student: see all my scheduled evaluations
router.get(
  "/planner/my-schedules",
  authenticate,
  authorize("student"),
  getMySchedules,
);

// ============================================================
// 7. SESSION GROUPS (Admin — Track-Based Parent-Child Sessions)
// ============================================================
router.post(
  "/session-groups",
  authenticate,
  authorize("admin"),
  createSessionGroup,
);
router.get(
  "/session-groups",
  authenticate,
  authorize("admin", "faculty"),
  listSessionGroups,
);
router.get(
  "/session-groups/:groupId",
  authenticate,
  authorize("admin", "faculty"),
  getSessionGroupDetail,
);

module.exports = router;

