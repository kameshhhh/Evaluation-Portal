// ============================================================
// FACULTY SCOPE SERVICE
// ============================================================
// Manages faculty evaluation scope governance.
// Enforces track-based assignment rules and strict filtering.
// ============================================================

const { pool } = require("../config/database");
const { randomUUID } = require('crypto');

/**
 * Service for managing faculty evaluation scopes
 */
class FacultyScopeService {
    /**
     * Sets up or updates the faculty's evaluation scope.
     * Enforces rules:
     * - PREMIUM track must have NULL department_id
     * - Tracks must exist
     */
    async setupScope(facultyId, { tracks, departments }, client = pool) {
        // 1. Validate Input
        if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
            throw new Error("At least one track must be selected.");
        }

        // 2. Fetch all tracks for normalization
        const trackRes = await client.query("SELECT id, name FROM tracks");
        const trackMap = new Map();
        trackRes.rows.forEach(t => trackMap.set(t.name.toLowerCase(), t.id));

        // 3. Prepare Scope Entries
        const scopeEntries = [];

        for (const trackInput of tracks) {
            const normalizedInput = trackInput.toLowerCase();
            const trackId = trackMap.get(normalizedInput);

            if (!trackId) {
                throw new Error(`Invalid track: ${trackInput}`);
            }

            if (normalizedInput === "premium") {
                // PREMIUM Rule: Department MUST be NULL
                scopeEntries.push({ facultyId, trackId, departmentCode: null });
            } else {
                // CORE/IT Rule: Must have departments
                if (!departments || departments.length === 0) {
                    throw new Error(`Departments are required for ${trackInput} track.`);
                }
                for (const dept of departments) {
                    scopeEntries.push({ facultyId, trackId, departmentCode: dept });
                }
            }
        }

        // 4. Save Scopes (Transaction recommended at controller level, but we can do batch insert here)
        // We use a transaction here to ensure atomicity of the setup

        // Note: If scope already exists, we might want to deactivate old ones or just add new ones?
        // User requirement: "First Login Setup". 
        // If updating, we should probably deactivate old active scopes first if this is a full reset, 
        // OR just insert new ones ignoring duplicates handling via UI?
        // "Force first login setup" implies fresh start.
        // Let's assume we deactivate all previous active scopes for this faculty to ensure clean state?
        // User said "Admin can edit anytime". 
        // Let's go with: Deactivate all current, Insert new.

        try {
            await client.query("BEGIN");

            // Deactivate existing active scopes
            await client.query(
                "UPDATE faculty_evaluation_scope SET is_active = false WHERE faculty_id = $1 AND is_active = true",
                [facultyId]
            );

            // 5. Generate Shared Scope Version (Traceability)
            const scopeVersion = randomUUID();

            // Insert new scopes
            for (const entry of scopeEntries) {
                await client.query(
                    `INSERT INTO faculty_evaluation_scope 
                (faculty_id, track_id, department_code, is_active, scope_version)
                VALUES ($1, $2, $3, true, $4)`,
                    [entry.facultyId, entry.trackId, entry.departmentCode || null, scopeVersion]
                );
            }

            await client.query("COMMIT");
            return { success: true, count: scopeEntries.length };
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
    }

    /**
     * Gets the current active scope for a faculty member.
     * Returns refined format for UI badges.
     */
    async getScope(facultyId) {
        const res = await pool.query(`
      SELECT 
        s.track_id, 
        t.name as track_name, 
        s.department_code 
      FROM faculty_evaluation_scope s
      JOIN tracks t ON s.track_id = t.id
      WHERE s.faculty_id = $1 AND s.is_active = true
    `, [facultyId]);

        // Group by Track
        // Format: { CORE: ['ECE', 'MECH'], IT: ['CSE'], PREMIUM: [] }
        const scopeMap = {};
        const labels = [];

        res.rows.forEach(row => {
            if (!scopeMap[row.track_name]) {
                scopeMap[row.track_name] = [];
            }
            if (row.department_code) {
                scopeMap[row.track_name].push(row.department_code);
            }
        });

        // Generate Labels e.g., "CORE • ECE, MECH"
        for (const [track, depts] of Object.entries(scopeMap)) {
            if (depts.length > 0) {
                labels.push(`${track} • ${depts.join(', ')}`);
            } else {
                labels.push(track); // e.g., PREMIUM
            }
        }


        return {
            scopes: res.rows,
            scope_status: res.rows.length > 0 ? 'exists' : 'missing',
            scope_labels: labels
        };
    }

    /**
     * Admin: Get all faculty scopes
     */
    async getAllFacultyScopes() {
        const query = `
            SELECT 
                u.internal_user_id as faculty_id,
                p.display_name,
                p.department_code,
                (
                    SELECT json_agg(
                        json_build_object(
                            'track_id', t.id,
                            'track_name', t.name, 
                            'department_code', fes.department_code
                        )
                    )
                    FROM faculty_evaluation_scope fes
                    JOIN tracks t ON t.id = fes.track_id
                    WHERE fes.faculty_id = u.internal_user_id AND fes.is_active = true
                ) as scopes
            FROM users u
            JOIN persons p ON p.identity_id = u.internal_user_id
            WHERE u.user_role = 'faculty'
            ORDER BY p.display_name
        `;
        const result = await pool.query(query);
        return result.rows;
    }

    /**
    * Checks if a faculty is allowed to evaluate a specific student.
    * @param {string} facultyId
    * @param {string} studentId
    * @returns {Promise<boolean>}
    */
    async isStudentAllowed(facultyId, personId) {
        // We need to fetch student's track and department from persons + track_selections
        // NOTE: facultyId may be a person_id (UUID from persons table).
        // faculty_evaluation_scope.faculty_id stores identity_id, so we resolve
        // through the persons table to handle both person_id and identity_id inputs.
        const query = `
            SELECT 1 
            FROM persons p
            JOIN users u ON u.internal_user_id = p.identity_id
            JOIN student_track_selections sts ON sts.person_id = p.person_id
            JOIN faculty_evaluation_scope fes ON fes.is_active = true
              AND fes.faculty_id = (
                SELECT COALESCE(
                  (SELECT identity_id FROM persons WHERE person_id = $1::uuid),
                  $1::uuid
                )
              )
            JOIN tracks t ON fes.track_id = t.id
            WHERE p.person_id = $2
            AND u.user_role = 'student'
            AND (
                -- OR Logic: Match Track AND (Dept Match OR Rule allows NULL dept for PREMIUM/global)
                (t.name = sts.track AND (fes.department_code IS NULL OR fes.department_code = p.department_code))
            )
            LIMIT 1;
        `;

        const res = await pool.query(query, [facultyId, personId]);
        return res.rows.length > 0;
    }

    /**
     * Get all available department codes from the canonical registry.
     * Replaces the slow dynamic query with a reliable static source.
     */
    async getDepartments() {
        const { getAllDepartments } = require("./personalization/academic/DepartmentRegistry");
        return getAllDepartments();
    }
}

module.exports = new FacultyScopeService();
