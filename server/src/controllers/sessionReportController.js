// ============================================================
// SESSION REPORT CONTROLLER — Admin Session Insights & Reporting
// ============================================================
// Provides endpoints for the admin "Session Report" tab:
//   1. GET /sessions — List sessions with year/month filters
//   2. GET /sessions/:sessionId/report — Full evaluation report
//
// Data sources:
//   - faculty_evaluation_sessions — session metadata
//   - session_planner_assignments — who is assigned / evaluated
//   - final_student_results — computed scores
//   - persons — student & faculty details
//   - evaluation_heads — rubric names
//   - judge_credibility_metrics — faculty credibility
// ============================================================

const { query } = require("../config/database");
const logger = require("../utils/logger");

// ============================================================
// LIST SESSIONS — Filterable by year and month
// GET /api/session-report/sessions?year=2026&month=3
// ============================================================
const listSessions = async (req, res) => {
  try {
    const { year, month } = req.query;

    let sql = `
      SELECT 
        fes.id AS session_id,
        fes.title,
        fes.status,
        fes.academic_year,
        fes.semester,
        fes.session_date,
        fes.opens_at,
        fes.closes_at,
        fes.created_at,
        fes.evaluation_mode,
        fes.group_id,
        fes.track,
        sg.title AS group_title,
        p.display_name AS created_by_name,
        (SELECT COUNT(DISTINCT spa.student_id) 
         FROM session_planner_assignments spa 
         WHERE spa.session_id = fes.id AND spa.status != 'removed') AS student_count,
        (SELECT COUNT(DISTINCT spa.faculty_id) 
         FROM session_planner_assignments spa 
         WHERE spa.session_id = fes.id AND spa.status != 'removed') AS faculty_count
      FROM faculty_evaluation_sessions fes
      LEFT JOIN persons p ON p.person_id = fes.created_by
      LEFT JOIN session_groups sg ON sg.id = fes.group_id
      WHERE 1=1
    `;
    const params = [];

    if (year) {
      params.push(parseInt(year));
      sql += ` AND EXTRACT(YEAR FROM COALESCE(fes.session_date, fes.opens_at, fes.created_at)) = $${params.length}`;
    }

    if (month) {
      // Filter by month from session_date or opens_at or created_at
      params.push(parseInt(month));
      sql += ` AND EXTRACT(MONTH FROM COALESCE(fes.session_date, fes.opens_at, fes.created_at)) = $${params.length}`;
    }

    sql += ` ORDER BY fes.created_at DESC`;

    const result = await query(sql, params);

    // Also return distinct years for the year filter dropdown
    // Derive from session_date (always populated) — avoids academic_year format issues
    const yearsResult = await query(
      `SELECT DISTINCT EXTRACT(YEAR FROM session_date)::int AS yr
       FROM faculty_evaluation_sessions
       WHERE session_date IS NOT NULL
       ORDER BY yr DESC`
    );

    return res.json({
      success: true,
      data: {
        sessions: result.rows,
        availableYears: yearsResult.rows.map((r) => r.yr),
      },
    });
  } catch (err) {
    logger.error("Session report — list sessions failed", {
      error: err.message,
    });
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// GET SESSION REPORT — Full evaluation data for one session
// GET /api/session-report/sessions/:sessionId/report
// ============================================================
const getSessionReport = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 50, 10), 200);
    const trackFilter = req.query.track || null;  // e.g. "core", "it_core", "premium"

    // ----------------------------------------------------------
    // 1. Session metadata
    // ----------------------------------------------------------
    const sessionResult = await query(
      `SELECT id AS session_id, title, status, academic_year, semester,
              session_date, opens_at, closes_at, evaluation_mode,
              preferred_rubric_ids, min_judges, finalized_at, batch_year
       FROM faculty_evaluation_sessions
       WHERE id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Session not found" });
    }

    const session = sessionResult.rows[0];

    // ----------------------------------------------------------
    // 2. Rubric names (for preferred_rubric_ids mapping)
    // ----------------------------------------------------------
    const rubricsResult = await query(
      `SELECT head_id, head_name FROM evaluation_heads WHERE is_active = true`
    );
    const rubricMap = {};       // UUID → name
    const rubricNameToId = {};   // name → UUID (reverse lookup)
    rubricsResult.rows.forEach((r) => {
      rubricMap[r.head_id] = r.head_name;
      rubricNameToId[r.head_name] = r.head_id;
    });

    // ----------------------------------------------------------
    // 3. All assignments for this session (students + faculty)
    // ----------------------------------------------------------
    const assignmentsResult = await query(
      `SELECT 
        spa.id AS assignment_id,
        spa.student_id,
        spa.faculty_id,
        spa.project_id,
        spa.status,
        spa.rubric_marks,
        spa.zero_feedback,
        spa.marks,
        spa.feedback,
        spa.faculty_evaluated_at,
        spa.marks_submitted_at,
        spa.team_formation_id,
        sp.display_name AS student_name,
        sp.department_code AS student_dept,
        sp.admission_year AS student_year,
        sp.graduation_year AS student_batch_year,
        sp.person_type AS student_type,
        fp.display_name AS faculty_name,
        fp.department_code AS faculty_dept
      FROM session_planner_assignments spa
      JOIN persons sp ON sp.person_id = spa.student_id
      JOIN persons fp ON fp.person_id = spa.faculty_id
      WHERE spa.session_id = $1
        AND spa.status != 'removed'
      ORDER BY sp.display_name, fp.display_name`,
      [sessionId]
    );

    // ----------------------------------------------------------
    // 4. All students in the system (to find NOT ASSIGNED ones)
    //    Filtered by session batch_year when set, so only same-batch
    //    students appear as "not assigned" (not every student in DB).
    // ----------------------------------------------------------
    const allStudentsResult = await query(
      `SELECT p.person_id, p.display_name, p.department_code, p.admission_year,
              p.graduation_year AS batch_year, sts.track
       FROM persons p
       LEFT JOIN student_track_selections sts 
         ON sts.person_id = p.person_id
       WHERE p.person_type = 'student' 
         AND p.status = 'active' 
         AND (p.is_deleted IS NULL OR p.is_deleted = false)
         AND (
           $1::int IS NULL
           OR p.graduation_year = $1
         )
       ORDER BY p.display_name`,
      [session.batch_year || null]
    );

    // ----------------------------------------------------------
    // 5. Final student results for this session
    // ----------------------------------------------------------
    const resultsResult = await query(
      `SELECT student_id, display_score, rubric_breakdown, 
              judge_count, confidence_score, aggregated_score
       FROM final_student_results
       WHERE session_id = $1`,
      [sessionId]
    );
    const resultsMap = {};
    resultsResult.rows.forEach((r) => {
      resultsMap[r.student_id] = r;
    });

    // ----------------------------------------------------------
    // 6. Faculty credibility scores
    // ----------------------------------------------------------
    const credibilityResult = await query(
      `SELECT evaluator_id, credibility_score, credibility_band
       FROM judge_credibility_metrics
       WHERE evaluator_id IN (
         SELECT DISTINCT faculty_id FROM session_planner_assignments
         WHERE session_id = $1 AND status != 'removed'
       )`,
      [sessionId]
    );
    const credibilityMap = {};
    credibilityResult.rows.forEach((r) => {
      credibilityMap[r.evaluator_id] = {
        compositeScore: parseFloat(r.credibility_score) || 0,
        band: r.credibility_band || "NEW",
      };
    });

    // ----------------------------------------------------------
    // Build student rows — merge assignments, results, and status
    // ----------------------------------------------------------
    const assignedStudentIds = new Set(
      assignmentsResult.rows.map((a) => a.student_id)
    );

    // Group assignments by student
    // Build a quick person_id → track lookup from allStudentsResult
    const personTrackMap = {};
    allStudentsResult.rows.forEach(r => {
      if (!personTrackMap[r.person_id]) personTrackMap[r.person_id] = r.track;
    });

    const studentAssignments = {};
    assignmentsResult.rows.forEach((a) => {
      if (!studentAssignments[a.student_id]) {
        studentAssignments[a.student_id] = {
          studentId: a.student_id,
          studentName: a.student_name,
          department: a.student_dept,
          admissionYear: a.student_year,
          batchYear: a.student_batch_year || (a.student_year ? a.student_year + 4 : null),
          track: personTrackMap[a.student_id] || null,
          assignments: [],
        };
      }
      studentAssignments[a.student_id].assignments.push({
        assignmentId: a.assignment_id,
        facultyId: a.faculty_id,
        facultyName: a.faculty_name,
        facultyDept: a.faculty_dept,
        status: a.status,
        rubricMarks: a.rubric_marks,
        zeroFeedback: a.zero_feedback,
        marks: a.marks,
        feedback: a.feedback,
        evaluatedAt: a.faculty_evaluated_at,
        marksSubmittedAt: a.marks_submitted_at,
      });
    });

    // ----------------------------------------------------------
    // Helper: compute raw avg rubric breakdown from assignments
    // Returns { rubricUUID: { avg, scores: [v1,v2,...], count } }
    // ----------------------------------------------------------
    const computeRawBreakdown = (assignments) => {
      // Deduplicate: only latest submission per faculty
      const latestByFaculty = {};
      assignments.forEach((a) => {
        if (!a.rubricMarks) return;
        const existing = latestByFaculty[a.facultyId];
        if (!existing || (a.marksSubmittedAt && (!existing.marksSubmittedAt || a.marksSubmittedAt > existing.marksSubmittedAt))) {
          latestByFaculty[a.facultyId] = a;
        }
      });
      const dedupedAssignments = Object.values(latestByFaculty);

      const sums = {};   // rubricId → { total, count, scores }
      dedupedAssignments.forEach((a) => {
        Object.entries(a.rubricMarks).forEach(([rid, val]) => {
          const num = Number(val);
          if (isNaN(num)) return; // skip non-numeric rubric values
          if (!sums[rid]) sums[rid] = { total: 0, count: 0, scores: [] };
          sums[rid].total += num;
          sums[rid].count += 1;
          sums[rid].scores.push(num);
        });
      });
      const breakdown = {};
      Object.entries(sums).forEach(([rid, s]) => {
        breakdown[rid] = {
          avg: s.count > 0 ? s.total / s.count : null,
          count: s.count,
          scores: s.scores,
        };
      });
      return Object.keys(breakdown).length > 0 ? breakdown : null;
    };

    // ----------------------------------------------------------
    // Helper: re-key finalized rubric_breakdown to UUID keys
    // Handles BOTH old format (name keys) and new format (UUID keys)
    // ----------------------------------------------------------
    const rekeyFinalBreakdown = (breakdown) => {
      if (!breakdown || typeof breakdown !== "object") return null;
      const result = {};
      Object.entries(breakdown).forEach(([key, data]) => {
        // Check if key is already a UUID (new format from Fix 1)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(key);
        if (isUUID) {
          result[key] = {
            avg: data.weighted_avg != null ? data.weighted_avg : data.raw_avg,
            name: data.name || rubricMap[key] || key,
            raw_avg: data.raw_avg,
            weighted_avg: data.weighted_avg,
            judge_count: data.judge_count,
          };
        } else {
          // Old format: key is rubric name like "Clarity"
          const uuid = rubricNameToId[key];
          if (uuid) {
            result[uuid] = {
              avg: data.weighted_avg != null ? data.weighted_avg : data.raw_avg,
              name: key,
              raw_avg: data.raw_avg,
              weighted_avg: data.weighted_avg,
              judge_count: data.judge_count,
            };
          }
        }
      });
      return Object.keys(result).length > 0 ? result : null;
    };

    // Build final students array (assigned + not assigned)
    let students = [];

    // Add assigned students
    Object.values(studentAssignments).forEach((s) => {
      const result = resultsMap[s.studentId];
      const isEvaluated = s.assignments.some(
        (a) =>
          a.status === "evaluation_done" ||
          a.status === "completed" ||
          a.rubricMarks
      );

      // Raw avg: computed from assignment rubric_marks
      let rawBreakdown = computeRawBreakdown(s.assignments);

      // Finalized: from final_student_results, re-keyed from names→UUIDs
      const finalBreakdown = result
        ? rekeyFinalBreakdown(result.rubric_breakdown)
        : null;

      // Fallback: if assignments have no rubric_marks (legacy data), derive raw from finalized raw_avg
      if (!rawBreakdown && finalBreakdown) {
        const fallback = {};
        Object.entries(finalBreakdown).forEach(([rid, data]) => {
          fallback[rid] = {
            avg: data.raw_avg != null ? data.raw_avg : data.avg,
            count: data.judge_count || 0,
            scores: [],
          };
        });
        if (Object.keys(fallback).length > 0) rawBreakdown = fallback;
      }

      students.push({
        ...s,
        status: isEvaluated ? "evaluated" : "assigned",
        displayScore: result?.display_score != null ? parseFloat(result.display_score) : null,
        rubricBreakdownRaw: rawBreakdown,
        rubricBreakdownFinal: finalBreakdown,
        // Keep rubricBreakdown pointing to raw for backward compat
        rubricBreakdown: rawBreakdown,
        judgeCount: result ? parseInt(result.judge_count, 10) || 0 : 0,
        confidenceScore: result?.confidence_score != null ? parseFloat(result.confidence_score) : null,
      });
    });

    // Add NOT ASSIGNED students (but check if they have finalized results)
    const studentIdsInList = new Set(students.map(s => s.studentId));
    allStudentsResult.rows.forEach((s) => {
      if (!studentIdsInList.has(s.person_id)) {
        studentIdsInList.add(s.person_id); // prevent duplicates from multi-track join
        const result = resultsMap[s.person_id];
        const finalBreakdown = result
          ? rekeyFinalBreakdown(result.rubric_breakdown)
          : null;

        // Derive raw from finalized raw_avg if available
        let rawBreakdown = null;
        if (finalBreakdown) {
          const fallback = {};
          Object.entries(finalBreakdown).forEach(([rid, data]) => {
            fallback[rid] = {
              avg: data.raw_avg != null ? data.raw_avg : data.avg,
              count: data.judge_count || 0,
              scores: [],
            };
          });
          if (Object.keys(fallback).length > 0) rawBreakdown = fallback;
        }

        students.push({
          studentId: s.person_id,
          studentName: s.display_name,
          department: s.department_code,
          admissionYear: s.admission_year,
          batchYear: s.batch_year || (s.admission_year ? s.admission_year + 4 : null),
          track: s.track,
          assignments: [],
          status: result ? "evaluated" : "not_assigned",
          displayScore: result ? parseFloat(result.display_score) : null,
          rubricBreakdownRaw: rawBreakdown,
          rubricBreakdownFinal: finalBreakdown,
          rubricBreakdown: rawBreakdown,
          judgeCount: result ? result.judge_count : 0,
          confidenceScore: result?.confidence_score != null ? parseFloat(result.confidence_score) : null,
        });
      }
    });

    // ── Track filter (if requested) ──
    if (trackFilter) {
      students = students.filter((s) => {
        // Assigned students: check their track from student_track_selections join
        if (s.track) return s.track === trackFilter;
        // For assigned students without explicit track field, check allStudentsResult
        const found = allStudentsResult.rows.find(r => r.person_id === s.studentId);
        return found && found.track === trackFilter;
      });
    }

    // ── Pagination ──
    const totalStudents = students.length;
    const totalPages = Math.ceil(totalStudents / pageSize);
    const paginatedStudents = students.slice((page - 1) * pageSize, page * pageSize);

    // ----------------------------------------------------------
    // Build faculty rows
    // ----------------------------------------------------------
    const facultyMap = {};
    assignmentsResult.rows.forEach((a) => {
      if (!facultyMap[a.faculty_id]) {
        facultyMap[a.faculty_id] = {
          facultyId: a.faculty_id,
          facultyName: a.faculty_name,
          department: a.faculty_dept,
          assignedCount: 0,
          evaluatedCount: 0,
          pendingCount: 0,
          credibility: credibilityMap[a.faculty_id] || {
            compositeScore: 0,
            band: "NEW",
          },
          studentsEvaluated: [],
        };
      }

      const f = facultyMap[a.faculty_id];
      f.assignedCount++;

      const isEval =
        a.status === "evaluation_done" ||
        a.status === "completed" ||
        a.rubric_marks;
      if (isEval) {
        f.evaluatedCount++;
        f.studentsEvaluated.push({
          studentId: a.student_id,
          studentName: a.student_name,
          rubricMarks: a.rubric_marks,
          marks: a.marks,
        });
      } else {
        f.pendingCount++;
      }
    });

    const faculty = Object.values(facultyMap);

    // ----------------------------------------------------------
    // Summary counts (computed from full list, not paginated)
    // ----------------------------------------------------------
    // Compute counts from the (possibly track-filtered) students list
    const filteredAssignedCount = students.filter(s => s.assignments && s.assignments.length > 0).length;
    const evaluatedCount = students.filter(
      (s) => s.status === "evaluated"
    ).length;
    const assignedCount = filteredAssignedCount;
    const notEvaluatedCount = Math.max(0, assignedCount - evaluatedCount);
    const notAssignedCount = Math.max(0, totalStudents - assignedCount);

    return res.json({
      success: true,
      data: {
        session,
        rubricMap,
        summary: {
          totalStudents,
          totalFaculty: faculty.length,
          assignedCount,
          evaluatedCount,
          notEvaluatedCount,
          notAssignedCount,
        },
        pagination: {
          page,
          pageSize,
          totalPages,
          totalItems: totalStudents,
        },
        students: paginatedStudents,
        faculty,
      },
    });
  } catch (err) {
    logger.error("Session report — get report failed", {
      error: err.message,
      sessionId: req.params.sessionId,
    });
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// DOWNLOAD SESSION REPORT — CSV export with track filter
// GET /api/session-report/sessions/:sessionId/download?format=csv&track=core
// ============================================================
const downloadSessionReport = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const trackFilter = req.query.track || null;
    const format = req.query.format || 'csv';

    // Reuse the report data logic
    const sessionResult = await query(
      `SELECT id AS session_id, title, status, track
       FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }
    const session = sessionResult.rows[0];

    // Rubric map (sorted by name for deterministic CSV column order)
    const rubricsResult = await query(
      `SELECT head_id, head_name FROM evaluation_heads WHERE is_active = true ORDER BY head_name ASC`
    );
    const rubricMap = {};
    rubricsResult.rows.forEach(r => { rubricMap[r.head_id] = r.head_name; });

    // Final results
    const resultsResult = await query(
      `SELECT student_id, display_score, rubric_breakdown, judge_count
       FROM final_student_results WHERE session_id = $1`,
      [sessionId]
    );
    const resultsMap = {};
    resultsResult.rows.forEach(r => { resultsMap[r.student_id] = r; });

    // Get assigned students with track
    const studentsResult = await query(
      `SELECT DISTINCT ON (spa.student_id)
         spa.student_id,
         sp.display_name AS student_name,
         sp.department_code,
         sp.admission_year,
         sp.graduation_year AS batch_year,
         sts.track,
         (SELECT COUNT(*) FROM session_planner_assignments x 
          WHERE x.session_id = $1 AND x.student_id = spa.student_id AND x.status != 'removed') AS judge_count
       FROM session_planner_assignments spa
       JOIN persons sp ON sp.person_id = spa.student_id
       LEFT JOIN student_track_selections sts ON sts.person_id = spa.student_id
       WHERE spa.session_id = $1 AND spa.status != 'removed'
       ORDER BY spa.student_id, sp.display_name`,
      [sessionId]
    );

    let rows = studentsResult.rows;
    if (trackFilter) {
      rows = rows.filter(r => r.track === trackFilter);
    }

    // Build CSV
    const rubricIds = Object.keys(rubricMap);
    const rubricHeaders = rubricIds.map(id => `"${(rubricMap[id] || id).replace(/"/g, '""')}"`);

    let csv = ['S.No', 'Student Name', 'Department', 'Batch Year', 'Track', ...rubricHeaders, 'Final Score', 'Judges'].join(',') + '\n';

    rows.forEach((row, idx) => {
      const result = resultsMap[row.student_id];
      const breakdown = result?.rubric_breakdown || {};
      const rubricScores = rubricIds.map(id => {
        const entry = breakdown[id] || breakdown[rubricMap[id]];
        if (entry) return (entry.weighted_avg ?? entry.raw_avg ?? '-');
        return '-';
      });

      csv += [
        idx + 1,
        `"${(row.student_name || '').replace(/"/g, '""')}"`,
        `"${(row.department_code || '-').replace(/"/g, '""')}"`,
        row.batch_year || row.admission_year || '-',
        `"${(row.track || '-').replace(/"/g, '""')}"`,
        ...rubricScores,
        result?.display_score != null ? parseFloat(result.display_score).toFixed(2) : '-',
        (result ? result.judge_count : row.judge_count) || 0,
      ].join(',') + '\n';
    });

    const trackLabel = trackFilter ? `_${trackFilter}` : '';
    const filename = `session_report_${(session.title || 'untitled').replace(/[^a-zA-Z0-9]/g, '_')}${trackLabel}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);

  } catch (err) {
    logger.error("downloadSessionReport failed", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// EXPORT CONTROLLER FUNCTIONS
// ============================================================
module.exports = {
  listSessions,
  getSessionReport,
  downloadSessionReport,
};
