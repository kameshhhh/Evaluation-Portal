// ============================================================
// APPEALS CONTROLLER — Student Score Appeal Endpoints
// ============================================================
// POST   /api/appeals          — Student files appeal
// GET    /api/appeals/my       — Student's own appeals
// GET    /api/appeals/check/:sessionId — Check appeal eligibility
// GET    /api/appeals          — Admin lists all appeals
// PUT    /api/appeals/:id      — Admin resolves appeal
// ============================================================

const appealService = require("../services/appealService");
const logger = require("../utils/logger");

/**
 * POST /api/appeals — Student files a score appeal
 * Body: { sessionId, reason, disputedFacultyId? }
 */
const fileAppeal = async (req, res) => {
  try {
    const studentId = req.user.personId;
    const { sessionId, reason, disputedFacultyId } = req.body;

    if (!sessionId || !reason) {
      return res.status(400).json({
        success: false,
        error: "sessionId and reason are required.",
      });
    }

    const result = await appealService.fileAppeal(
      studentId,
      sessionId,
      reason,
      disputedFacultyId || null
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (err) {
    logger.error("fileAppeal error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/appeals/check/:sessionId — Check if student can appeal
 */
const checkEligibility = async (req, res) => {
  try {
    const studentId = req.user.personId;
    const { sessionId } = req.params;

    const result = await appealService.checkEligibility(studentId, sessionId);
    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error("checkEligibility error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/appeals/my — Student's own appeals
 */
const getMyAppeals = async (req, res) => {
  try {
    const studentId = req.user.personId;
    const appeals = await appealService.getStudentAppeals(studentId);
    return res.json({ success: true, data: appeals });
  } catch (err) {
    logger.error("getMyAppeals error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/appeals — Admin: list all appeals (optional ?status=pending)
 */
const listAppeals = async (req, res) => {
  try {
    const statusFilter = req.query.status || null;
    const appeals = await appealService.listAppeals(statusFilter);
    return res.json({ success: true, data: appeals });
  } catch (err) {
    logger.error("listAppeals error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * PUT /api/appeals/:id — Admin resolves an appeal
 * Body: { status: 'accepted'|'rejected', resolutionNotes? }
 */
const resolveAppeal = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes } = req.body;
    const resolvedBy = req.user.personId;

    const result = await appealService.resolveAppeal(
      id,
      status,
      resolvedBy,
      resolutionNotes
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    logger.error("resolveAppeal error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  fileAppeal,
  checkEligibility,
  getMyAppeals,
  listAppeals,
  resolveAppeal,
};
