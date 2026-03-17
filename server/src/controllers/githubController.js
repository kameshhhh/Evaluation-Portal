"use strict";

const GitHubTokenService = require("../services/GitHubTokenService");
const GitHubProfileService = require("../services/GitHubProfileService");
const { broadcastChange } = require("../socket");
const logger = require("../utils/logger");

// POST /token — Student saves their GitHub PAT
const saveToken = async (req, res) => {
  try {
    const personId = req.user.personId;
    const { token } = req.body;

    if (!token || typeof token !== "string" || token.trim().length < 10) {
      return res.status(400).json({ success: false, error: "A valid GitHub Personal Access Token is required" });
    }

    const result = await GitHubTokenService.saveToken(personId, token.trim());
    broadcastChange("github_token", "saved", { personId, username: result.github_username });
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    logger.error("Save GitHub token failed", { error: error.message });
    const status = error.message.includes("Missing required scopes") || error.message.includes("Invalid") ? 400 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
};

// GET /token/status — Student checks their token status
const getTokenStatus = async (req, res) => {
  try {
    const personId = req.user.personId;
    const status = await GitHubTokenService.getTokenStatus(personId);
    return res.json({ success: true, data: status });
  } catch (error) {
    logger.error("Get token status failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get token status" });
  }
};


// PUT /token — Student updates their token
const updateToken = async (req, res) => {
  try {
    const personId = req.user.personId;
    const { token } = req.body;

    if (!token || typeof token !== "string" || token.trim().length < 10) {
      return res.status(400).json({ success: false, error: "A valid GitHub Personal Access Token is required" });
    }

    const result = await GitHubTokenService.saveToken(personId, token.trim());
    broadcastChange("github_token", "updated", { personId, username: result.github_username });
    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error("Update GitHub token failed", { error: error.message });
    const status = error.message.includes("Missing required scopes") || error.message.includes("Invalid") ? 400 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
};

// DELETE /token — Student removes their token
const deleteToken = async (req, res) => {
  try {
    const personId = req.user.personId;
    const deleted = await GitHubTokenService.deleteToken(personId);
    if (!deleted) return res.status(404).json({ success: false, error: "No token found" });

    broadcastChange("github_token", "deleted", { personId });
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    logger.error("Delete GitHub token failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to delete token" });
  }
};

// POST /token/validate — Re-validate stored token
const validateToken = async (req, res) => {
  try {
    const personId = req.user.personId; 
    const result = await GitHubTokenService.revalidateToken(personId);
    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error("Validate GitHub token failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to validate token" });
  }
};

// GET /profile/:personId — Admin fetches a student's GitHub profile
const getStudentProfile = async (req, res) => {
  try {
    const { personId } = req.params;
    if (!personId) return res.status(400).json({ success: false, error: "personId is required" });

    const profile = await GitHubProfileService.getFullProfile(personId);
    return res.json({ success: true, data: profile });
  } catch (error) {
    logger.error("Get GitHub profile failed", { error: error.message, personId: req.params.personId });
    const status = error.message.includes("not linked") ? 404 : error.message.includes("rate limit") ? 429 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
};

module.exports = {
  saveToken,
  getTokenStatus,
  updateToken,
  deleteToken,
  validateToken,
  getStudentProfile,
};
