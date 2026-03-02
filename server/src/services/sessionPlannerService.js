// ============================================================
// SESSION PLANNER SERVICE
// ============================================================
// Service layer for session planning logic, including 
// scope-based student filtering.
// ============================================================

const { pool } = require("../config/database");
const facultyScopeService = require("./facultyScopeService");

class SessionPlannerService {

  /**
   * Retrieves students for a session, filtered by faculty scope.
   * used by getPlannerOverview and other lookups.
   * 
   * @param {string} sessionId 
   * @param {string} facultyId - The viewer's ID (person_id or user_id?)
   *                             Controller passes req.user.personId usually.
   *                             But scope is linked to user_id (faculty_id in users).
   *                             We need to check if facultyId passed matches user_id in scope table.
   *                             Usually person_id is used for business logic, but identity_id (user_id) for auth/scope.
   *                             Let's assume the controller resolves this. 
   *                             Actually, faculty_evaluation_scope uses faculty_id which references users(user_id).
   *                             req.user.user_id is available in controller.
   */
  async getScopedStudents(sessionId, userId) {
    // 1. Get Faculty Scope
    const { scopes } = await facultyScopeService.getScope(userId);

    // If no scope defined, return empty list (Strict Governance)
    // Unless admin? Controller should handle admin bypass.
    if (!scopes || scopes.length === 0) {
      return [];
    }

    // 2. Build Scope Filter Clause
    // Logic: (track = 'A' AND dept = 'A') OR (track = 'B' AND dept IS NULL) ...

    // Group depts by track first
    const trackMap = {}; // { 'CORE': ['ECE', 'MECH'], 'PREMIUM': [null] }

    scopes.forEach(s => {
      if (!trackMap[s.track_name]) {
        trackMap[s.track_name] = [];
      }
      trackMap[s.track_name].push(s.department_code);
    });

    const conditions = [];
    const params = [sessionId]; // $1
    let paramIdx = 2;

    Object.entries(trackMap).forEach(([track, depts]) => {
      const trackParam = `$${paramIdx++}`;
      params.push(track);

      const deptConditions = [];
      let hasNullDept = false;

      const validDepts = [];
      depts.forEach(d => {
        if (d === null) hasNullDept = true;
        else validDepts.push(d);
      });

      if (validDepts.length > 0) {
        // "department_code IN (...)"
        // We can pass array to ANY
        const deptParam = `$${paramIdx++}`;
        params.push(validDepts);
        deptConditions.push(`p.department_code = ANY(${deptParam})`);
      }

      if (hasNullDept) {
        // For PREMIUM or Global tracks, allow ANY department? 
        // Implementation Plan says: "PREMIUM track must have NULL department_id" -> meaning ALL departments allowed for this track.
        // So if hasNullDept, we match ONLY the track, ignoring dept code.
        deptConditions.push("TRUE"); // effectively OR TRUE -> ignores dept check
      }

      if (deptConditions.length > 0) {
        // (sts.track = $T AND (p.department_code = ANY($D) OR TRUE))
        // deptConditions already contains the correct logic fragments
        conditions.push(`(sts.track = ${trackParam} AND (${deptConditions.join(' OR ')}))`);
      }
    });

    if (conditions.length === 0) return []; // Should not happen if scopes exist

    const whereClause = `AND (${conditions.join(' OR ')})`;

    // 3. Execute Query
    // This is the massive query from controller, adapted
    const query = `
        SELECT 
         p.person_id, p.display_name, p.department_code, p.admission_year,
         sts.track,
         t.id as track_id, -- Payload enrichment
         tfr.id as formation_id, tfr.status as team_status,
         tfr.project_id,
         prj.title as project_title,
         CASE WHEN tfr.leader_id = p.person_id THEN true ELSE false END as is_leader,
         spa.faculty_id as assigned_faculty_id,
         spa.status as assignment_status,
         afp.display_name as assigned_faculty_name,
         fsr.normalized_score,
         fsr.confidence_score
       FROM persons p
       JOIN users u ON u.internal_user_id = p.identity_id
       LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
       LEFT JOIN tracks t ON t.name = sts.track -- Join for track_id
       LEFT JOIN team_formation_requests tfr ON (
         tfr.leader_id = p.person_id 
         AND tfr.status = 'admin_approved'
       )
       LEFT JOIN team_invitations ti ON (
         ti.invitee_id = p.person_id AND ti.status = 'accepted'
       )
       LEFT JOIN team_formation_requests tfr2 ON (
         tfr2.id = ti.formation_id AND tfr2.status = 'admin_approved'
         AND tfr.id IS NULL
       )
       LEFT JOIN projects prj ON prj.project_id = COALESCE(tfr.project_id, tfr2.project_id)
       LEFT JOIN session_planner_assignments spa ON (
         spa.student_id = p.person_id AND spa.session_id = $1 AND spa.status != 'removed'
       )
       LEFT JOIN persons afp ON afp.person_id = spa.faculty_id
       LEFT JOIN final_student_results fsr ON (
         fsr.session_id = $1 AND fsr.student_id = p.person_id
       )
       WHERE u.user_role = 'student'
         AND p.status = 'active' AND p.is_deleted = false
         ${whereClause}
       ORDER BY p.display_name
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }
}

module.exports = new SessionPlannerService();
