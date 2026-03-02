
/**
 * POST /sessions/:sessionId/assign — Assign faculty to student(s) with multi-judge support & team sync
 * Body: { studentId: uuid, facultyId: uuid }
 */
const assignFaculty = async (req, res) => {
    const client = await require("../config/database").pool.connect();
    try {
        const { sessionId } = req.params;
        const { studentId, facultyId } = req.body;
        const assignedBy = req.user.personId;

        if (!studentId || !facultyId) {
            return res.status(400).json({
                success: false,
                error: "Student and Faculty are required"
            });
        }

        await client.query("BEGIN");

        // 1. Check if assignment already exists for THIS pairing
        const existing = await client.query(
            `SELECT id FROM session_planner_assignments
       WHERE session_id = $1 AND student_id = $2 AND faculty_id = $3`,
            [sessionId, studentId, facultyId]
        );

        if (existing.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                error: "This faculty is already assigned to this student for this session."
            });
        }

        // 2. Identify all students to assign (Handle Team Sync)
        // If student is in a team -> get all team members
        // If solo -> just studentId
        const teamMembers = await client.query(
            `WITH MemberTeam AS (
         SELECT project_id FROM project_members WHERE person_id = $1
       )
       SELECT pm.person_id 
       FROM project_members pm
       JOIN MemberTeam mt ON pm.project_id = mt.project_id
       -- Ensure we only sync members of the SAME active project
       JOIN projects p ON p.project_id = pm.project_id
       WHERE p.status = 'active'`,
            [studentId]
        );

        let studentsToAssign = [studentId];
        let isTeamAssignment = false;

        if (teamMembers.rows.length > 0) {
            // It's a team! Sync assignment to all members
            studentsToAssign = teamMembers.rows.map(row => row.person_id);
            isTeamAssignment = true;
        }

        // 3. Create Assignments Loop
        const results = [];
        for (const sId of studentsToAssign) {
            // Check if THIS member already has THIS faculty (avoid duplicate error)
            const checkMember = await client.query(
                `SELECT id FROM session_planner_assignments
         WHERE session_id = $1 AND student_id = $2 AND faculty_id = $3`,
                [sessionId, sId, facultyId]
            );

            if (checkMember.rows.length === 0) {
                // Insert new assignment
                const insert = await client.query(
                    `INSERT INTO session_planner_assignments 
             (session_id, faculty_id, student_id, assigned_by, status)
           VALUES ($1, $2, $3, $4, 'assigned')
           RETURNING id`,
                    [sessionId, facultyId, sId, assignedBy]
                );
                results.push({
                    studentId: sId,
                    assignmentId: insert.rows[0].id
                });
            }
        }

        await client.query("COMMIT");

        // 4. Real-Time Updates
        // Notify everyone in the session room
        const io = require("../socket").getIO();
        io.to(`session:${sessionId}`).emit("assignment:update", {
            sessionId,
            facultyId,
            students: studentsToAssign,
            isTeamSync: isTeamAssignment,
            assignedByName: req.user.displayName
        });

        logger.info("Faculty assigned", {
            sessionId,
            facultyId,
            count: results.length,
            isTeam: isTeamAssignment
        });

        return res.status(201).json({
            success: true,
            message: isTeamAssignment
                ? `Assigned faculty to student and ${results.length - 1} teammates.`
                : "Assigned faculty successfully.",
            data: {
                assignedCount: results.length,
                studentIds: studentsToAssign
            }
        });

    } catch (error) {
        await client.query("ROLLBACK");
        logger.error("Failed to assign faculty", { error: error.message });
        return res.status(500).json({ success: false, error: "Failed to assign faculty" });
    } finally {
        client.release();
    }
};

/**
 * GET /sessions/:sessionId/potential-assignments/:studentId
 * CHECK if student already has other judges (for UI Popup)
 */
const checkExistingAssignments = async (req, res) => {
    try {
        const { sessionId, studentId } = req.params;

        const result = await query(
            `SELECT 
         spa.id, 
         spa.status,
         f.display_name as faculty_name,
         ep.credibility_score
       FROM session_planner_assignments spa
       JOIN persons f ON f.person_id = spa.faculty_id
       LEFT JOIN evaluator_profiles ep ON ep.person_id = f.person_id
       WHERE spa.session_id = $1 AND spa.student_id = $2`,
            [sessionId, studentId]
        );

        return res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        logger.error("Failed to check assignments", { error: error.message });
        return res.status(500).json({ success: false, error: "Check failed" });
    }
};
