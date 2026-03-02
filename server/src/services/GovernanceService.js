// ============================================================
// GOVERNANCE SERVICE — Weekly Scheduling & Admin Overrides
// ============================================================
// This service acts as the "Timekeeper" and "Auditor" for the
// Governed Multi-Track Evaluation System.
//
// Responsibilities:
//   1. Rollover session planning windows automatically (Check-on-Access)
//   2. Enforce weekly scheduling constraints
//   3. Handle Admin overrides with mandatory audit logging
//
// ============================================================

"use strict";

const { query } = require("../config/database");
const logger = require("../utils/logger");

class GovernanceService {

    // ============================================================
    // PUBLIC: ensureWeeklyWindow (Check-on-Access Logic)
    // ============================================================
    // Checks if the session's planning window is stale (in the past).
    // If so, rolls it over to the current week (Monday to Sunday).
    // This is called whenever a session is accessed (Viewer/Planner).
    // ============================================================
    async ensureWeeklyWindow(sessionId) {
        try {
            const res = await query(
                `SELECT session_week_end, session_week_start FROM faculty_evaluation_sessions WHERE id = $1`,
                [sessionId]
            );

            if (res.rows.length === 0) return; // Session not found, likely handled elsewhere

            const session = res.rows[0];
            const now = new Date();

            // Determine if rollover is needed
            let needsRollover = false;

            if (!session.session_week_end) {
                needsRollover = true; // First time init
            } else {
                const weekEnd = new Date(session.session_week_end);
                // If today is AFTER the window end, we need to roll over
                // We set the time to 23:59:59 of the end date effectively
                weekEnd.setHours(23, 59, 59, 999);
                if (now > weekEnd) {
                    needsRollover = true;
                }
            }

            if (needsRollover) {
                const { start, end } = this._getCurrentWeekRange();

                logger.info("GovernanceService: Rolling over session window", {
                    sessionId,
                    oldEnd: session.session_week_end,
                    newStart: start,
                    newEnd: end
                });

                // Atomic update
                // We also reset auto_suggested flag because new week = new planning needs
                await query(
                    `UPDATE faculty_evaluation_sessions 
           SET session_week_start = $1, 
               session_week_end = $2, 
               auto_suggested = FALSE,
               updated_at = NOW()
           WHERE id = $3`,
                    [start, end, sessionId]
                );
            }
        } catch (error) {
            logger.error("GovernanceService: Failed to ensure weekly window", {
                sessionId,
                error: error.message
            });
            // Non-blocking error - we log but don't crash the request
        }
    }

    // ============================================================
    // PUBLIC: enforceWeeklyWindow
    // ============================================================
    // Validates if a target date is within the allowed window.
    // Handles Admin overrides by logging to audit table.
    //
    // @param {string} sessionId
    // @param {string|Date} targetDate
    // @param {string} userRole - 'admin' or 'faculty'
    // @param {string} actorId - UUID of the user performing action
    // @param {boolean} adminOverride - Explicit flag to bypass checks (admin only)
    // @returns {Promise<Object>} { allowed: boolean, reason: string, warning: boolean }
    // ============================================================
    async enforceWeeklyWindow(sessionId, targetDate, userRole, actorId, adminOverride = false, overrideReason = 'Not specified') {
        const d = new Date(targetDate);
        if (isNaN(d.getTime())) {
            return { allowed: false, reason: "Invalid date format" };
        }

        const res = await query(
            `SELECT session_week_start, session_week_end FROM faculty_evaluation_sessions WHERE id = $1`,
            [sessionId]
        );

        if (res.rows.length === 0) {
            return { allowed: false, reason: "Session not found" };
        }

        const { session_week_start, session_week_end } = res.rows[0];
        let inWindow = false;

        // If no session window is configured, allow any date — scheduling is unrestricted.
        if (!session_week_start || !session_week_end) {
            return { allowed: true };
        }

        const s = new Date(session_week_start);
        const e = new Date(session_week_end);
        e.setHours(23, 59, 59, 999);
        if (d >= s && d <= e) inWindow = true;

        if (inWindow) return { allowed: true };

        // --- Violation Detected ---

        // Case 1: Faculty -> HARD BLOCK
        if (userRole !== "admin") {
            return {
                allowed: false,
                reason: `Date allowed only between ${session_week_start} and ${session_week_end}. Rollover occurs weekly.`
            };
        }

        // Case 2: Admin -> ALLOW only if override flag is TRUE
        if (!adminOverride) {
            return {
                allowed: false,
                reason: `Date outside window. Admin override required.`
            };
        }

        // Case 3: Admin + Override -> LOG AUDIT
        try {
            await query(
                `INSERT INTO governance_audit_logs 
                 (actor_id, action_type, target_entity_id, target_entity_table, override_reason, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    actorId,
                    'OVERRIDE_WEEKLY_WINDOW',
                    sessionId,
                    'faculty_evaluation_sessions',
                    overrideReason,
                    JSON.stringify({
                        target_date: targetDate,
                        window_start: session_week_start,
                        window_end: session_week_end
                    })
                ]
            );

            return {
                allowed: true,
                warning: true,
                reason: "Admin Override: Assignment scheduled outside permitted window. This action has been audited."
            };

        } catch (auditError) {
            logger.error("GovernanceService: Audit log failed", { error: auditError.message });
            return { allowed: false, reason: "System Audit Failed: Cannot proceed with override." };
        }
    }

    // ============================================================
    // PUBLIC: getWindowStatus
    // ============================================================
    async getWindowStatus(sessionId) {
        const res = await query(
            `SELECT session_week_start, session_week_end FROM faculty_evaluation_sessions WHERE id = $1`,
            [sessionId]
        );
        if (res.rows.length === 0) return null;
        return res.rows[0];
    }

    // ============================================================
    // PRIVATE: Date Helpers
    // ============================================================
    _getCurrentWeekRange() {
        const now = new Date();
        const day = now.getDay(); // 0 (Sun) to 6 (Sat)

        // Calculate Monday
        // If today is Sunday (0), we want previous Monday (-6)
        // If today is Monday (1), we want today (0)
        // Formula: date - day + (day == 0 ? -6 : 1)

        const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);

        const monday = new Date(now);
        monday.setDate(diffToMonday);
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        // Return formatted strings YYYY-MM-DD
        return {
            start: monday.toISOString().split('T')[0],
            end: sunday.toISOString().split('T')[0]
        };
    }
}

module.exports = new GovernanceService();
