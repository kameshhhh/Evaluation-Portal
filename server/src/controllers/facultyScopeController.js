// ============================================================
// FACULTY SCOPE CONTROLLER
// ============================================================
// Handles API requests for faculty evaluation scope.
// Delegates logic to FacultyScopeService.
// ============================================================

const facultyScopeService = require("../services/facultyScopeService");
const { pool } = require("../config/database");
const socket = require("../socket");

/**
 * Setup initial scope for a faculty member.
 * Enforces validation rules.
 */
exports.setupScope = async (req, res) => {
    const { tracks, departments } = req.body;
    const facultyId = req.user.userId; // Fixed property name

    try {
        const result = await facultyScopeService.setupScope(facultyId, { tracks, departments });

        res.json({
            success: true,
            message: "Evaluation scope configured successfully.",
            data: result
        });

        // Emit real-time update
        socket.broadcastChange("faculty_scope", "updated", { facultyId });
    } catch (err) {
        console.error("Setup Scope Error:", err);
        res.status(400).json({
            success: false,
            message: err.message || "Failed to configure scope."
        });
    }
};

/**
 * Get current scope for the logged-in faculty.
 */
exports.getMyScope = async (req, res) => {
    const facultyId = req.user.userId;
    try {
        const scopeData = await facultyScopeService.getScope(facultyId);
        res.json({
            success: true,
            data: scopeData
        });
    } catch (err) {
        console.error("Get Scope Error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve scope."
        });
    }
};

/**
 * Admin: Update scope for any faculty
 */
exports.updateFacultyScope = async (req, res) => {
    const { facultyId } = req.params;
    const { tracks, departments } = req.body;

    try {
        // Re-use setup logic (admin override)
        const result = await facultyScopeService.setupScope(facultyId, { tracks, departments });

        res.json({
            success: true,
            message: "Faculty scope updated by admin.",
            data: result
        });
    } catch (err) {
        console.error("Admin Update Scope Error:", err);
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

/**
 * Get all available departments
 */
exports.getDepartments = async (req, res) => {
    try {
        const departments = await facultyScopeService.getDepartments();
        res.json({
            success: true,
            data: departments
        });
    } catch (err) {
        console.error("Get Departments Error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch departments."
        });
    }
};
