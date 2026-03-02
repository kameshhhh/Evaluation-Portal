// ============================================================
// FACULTY SCOPE ROUTES
// ============================================================
// API Endpoints for managing faculty evaluation scopes.
// ============================================================

const express = require('express');
const router = express.Router();
const facultyScopeController = require('../controllers/facultyScopeController');
const { authenticate, authorize } = require('../middleware/auth'); // Assumes generic auth middleware

// Get current faculty scope
router.get('/me', authenticate, facultyScopeController.getMyScope);

// Get available departments
router.get('/departments', authenticate, facultyScopeController.getDepartments);

// Setup/Update scope (Faculty self-service during onboarding)
router.post('/setup', authenticate, facultyScopeController.setupScope);

// Admin Updates
router.put('/admin/:facultyId', authenticate, authorize(['admin']), facultyScopeController.updateFacultyScope);

module.exports = router;
