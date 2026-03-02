// ============================================================
// SESSION AUTO-FINALIZER — Zero Admin Intervention
// ============================================================
// FULLY AUTOMATED SESSION FINALIZATION & CREDIBILITY UPDATE
//
// This worker runs on an interval and:
//   1. Finds sessions past their evaluation_window_end deadline
//   2. Auto-finalizes them (open → closed → locked)
//   3. Triggers credibility recalculation for ALL participants
//   4. Logs everything for audit trail
//
// SRS COMPLIANCE:
//   §5.1 — Credibility scores update automatically
//   §5.2 — No admin intervention required
//
// AUTOMATION GUARANTEE:
//   "If the entire admin team goes on vacation for 2 weeks,
//    will evaluators still have accurate credibility scores?"
//   ANSWER: YES — this worker handles everything.
// ============================================================

"use strict";

// Data access
const db = require("../config/database");
const logger = require("../utils/logger");

// Services — these are singleton instances
const sessionFinalizationService = require("../services/scarcity/SessionFinalizationService");
const CredibilityEngine = require("../services/credibility/CredibilityEngine");

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  // Check every minute for sessions to finalize
  INTERVAL_MS: 60 * 1000, // 1 minute

  // Maximum sessions to process per cycle (prevent overload)
  BATCH_SIZE: 10,

  // Grace period after deadline before auto-finalize (seconds)
  // Allows for last-second submissions
  GRACE_PERIOD_SECONDS: 60,
};

class SessionAutoFinalizer {
  constructor() {
    this._intervalId = null;
    this._isProcessing = false;
  }

  // ============================================================
  // PUBLIC: start()
  // ============================================================
  // Starts the automated worker. Call once on server boot.
  // ============================================================
  start() {
    if (this._intervalId) {
      logger.warn("SessionAutoFinalizer: Already running, ignoring start()");
      return;
    }

    logger.info(
      "SessionAutoFinalizer: Starting automated session finalization",
      {
        intervalMs: CONFIG.INTERVAL_MS,
        batchSize: CONFIG.BATCH_SIZE,
        gracePeriodSeconds: CONFIG.GRACE_PERIOD_SECONDS,
      },
    );

    console.log(
      "🚀 SessionAutoFinalizer started — Sessions will auto-finalize at deadline",
    );

    // Run immediately on start, then on interval
    this._process().catch((err) => {
      logger.error("SessionAutoFinalizer: Initial process failed", {
        error: err.message,
      });
    });

    this._intervalId = setInterval(() => {
      this._process().catch((err) => {
        logger.error("SessionAutoFinalizer: Process cycle failed", {
          error: err.message,
        });
      });
    }, CONFIG.INTERVAL_MS);
  }

  // ============================================================
  // PUBLIC: stop()
  // ============================================================
  // Stops the worker. Call on graceful shutdown.
  // ============================================================
  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
      logger.info("SessionAutoFinalizer: Stopped");
      console.log("🛑 SessionAutoFinalizer stopped");
    }
  }

  // ============================================================
  // PRIVATE: _process()
  // ============================================================
  // Main processing loop. Finds and finalizes expired sessions.
  // Uses locking to prevent concurrent processing.
  // ============================================================
  async _process() {
    // Prevent overlapping runs
    if (this._isProcessing) {
      logger.debug(
        "SessionAutoFinalizer: Previous cycle still running, skipping",
      );
      return;
    }

    this._isProcessing = true;
    const startTime = Date.now();

    try {
      // 1. Find sessions that need auto-finalization
      const expiredSessions = await this._findExpiredSessions();

      if (expiredSessions.length === 0) {
        logger.debug("SessionAutoFinalizer: No expired sessions found");
        return;
      }

      logger.info("SessionAutoFinalizer: Found expired sessions", {
        count: expiredSessions.length,
        sessionIds: expiredSessions.map((s) => s.session_id),
      });

      // 2. Process each session
      const results = {
        finalized: 0,
        credibilityUpdated: 0,
        failed: 0,
        errors: [],
      };

      for (const session of expiredSessions) {
        try {
          await this._processSession(session);
          results.finalized++;
          results.credibilityUpdated++;
        } catch (err) {
          results.failed++;
          results.errors.push({
            sessionId: session.session_id,
            error: err.message,
          });
          logger.error("SessionAutoFinalizer: Failed to process session", {
            sessionId: session.session_id,
            error: err.message,
          });
        }
      }

      const durationMs = Date.now() - startTime;
      logger.info("SessionAutoFinalizer: Cycle complete", {
        ...results,
        durationMs,
      });
    } catch (err) {
      logger.error("SessionAutoFinalizer: Unexpected error in process cycle", {
        error: err.message,
        stack: err.stack,
      });
    } finally {
      this._isProcessing = false;
    }
  }

  // ============================================================
  // PRIVATE: _findExpiredSessions()
  // ============================================================
  // Finds sessions where:
  //   - evaluation_window_end has passed (+ grace period)
  //   - status is 'open' or 'in_progress' (not already finalized)
  //   - has at least one allocation (not empty)
  // ============================================================
  async _findExpiredSessions() {
    const query = `
      SELECT 
        es.session_id,
        es.evaluation_window_end,
        es.status,
        es.created_at,
        COUNT(DISTINCT sa.evaluator_id) as evaluator_count
      FROM evaluation_sessions es
      LEFT JOIN scarcity_allocations sa ON es.session_id = sa.session_id
      WHERE 
        -- Deadline has passed (with grace period)
        es.evaluation_window_end IS NOT NULL
        AND es.evaluation_window_end < NOW() - INTERVAL '${CONFIG.GRACE_PERIOD_SECONDS} seconds'
        -- Not already finalized
        AND es.status IN ('open', 'in_progress')
      GROUP BY es.session_id, es.evaluation_window_end, es.status, es.created_at
      HAVING COUNT(DISTINCT sa.evaluator_id) > 0
      ORDER BY es.evaluation_window_end ASC
      LIMIT ${CONFIG.BATCH_SIZE}
    `;

    const result = await db.query(query);
    return result.rows || [];
  }

  // ============================================================
  // PRIVATE: _processSession()
  // ============================================================
  // Full automation pipeline for a single session:
  //   1. Finalize (open → closed → locked)
  //   2. Process credibility for ALL participants
  // ============================================================
  async _processSession(session) {
    const sessionId = session.session_id;

    logger.info("SessionAutoFinalizer: Processing session", {
      sessionId,
      deadline: session.evaluation_window_end,
      status: session.status,
      evaluatorCount: session.evaluator_count,
    });

    // STEP 1: Finalize the session
    // This transitions: open/in_progress → closed → locked
    try {
      const finalizationReport =
        await sessionFinalizationService.finalizeSession(sessionId, {
          force: true, // Skip completeness checks — deadline passed
          reason: "auto_finalized_deadline_passed",
          adminId: null, // System-triggered, no admin
        });

      logger.info("SessionAutoFinalizer: Session finalized", {
        sessionId,
        finalState: finalizationReport.finalState,
        sealHash: finalizationReport.cryptographicSeal?.hash?.substring(0, 16),
      });
    } catch (err) {
      // If finalization fails due to state (already locked), continue to credibility
      if (
        err.code === "INVALID_STATE_TRANSITION" &&
        err.details?.current === "locked"
      ) {
        logger.info(
          "SessionAutoFinalizer: Session already locked, proceeding to credibility",
          {
            sessionId,
          },
        );
      } else {
        throw err;
      }
    }

    // STEP 2: Process credibility for ALL evaluators
    // This calculates alignment, stability, discipline signals
    try {
      const credibilityResult =
        await CredibilityEngine.processSession(sessionId);

      logger.info(
        "SessionAutoFinalizer: Credibility updated for all participants",
        {
          sessionId,
          evaluatorsProcessed: credibilityResult.evaluators_processed,
          signalsStored: credibilityResult.total_signals_stored,
          profilesUpdated: credibilityResult.profiles_updated,
        },
      );
    } catch (err) {
      // Log but don't fail — session is already finalized
      logger.error("SessionAutoFinalizer: Credibility processing failed", {
        sessionId,
        error: err.message,
      });
      // Re-throw so it's counted as a failure in results
      throw new Error(`Credibility processing failed: ${err.message}`);
    }

    // STEP 3: Mark session as auto-finalized (if column exists)
    try {
      await db.query(
        `UPDATE evaluation_sessions 
         SET auto_finalized = true, 
             auto_finalized_at = NOW()
         WHERE session_id = $1`,
        [sessionId],
      );
    } catch (err) {
      // Column might not exist if migration hasn't run yet — ignore
      if (
        !err.message.includes("column") &&
        !err.message.includes("auto_finalized")
      ) {
        logger.warn(
          "SessionAutoFinalizer: Could not update auto_finalized flag",
          {
            sessionId,
            error: err.message,
          },
        );
      }
    }

    logger.info("SessionAutoFinalizer: Session fully processed", {
      sessionId,
      automation: "complete",
    });
  }

  // ============================================================
  // PUBLIC: getStatus()
  // ============================================================
  // Returns the current status of the worker (for monitoring)
  // ============================================================
  getStatus() {
    return {
      running: !!this._intervalId,
      processing: this._isProcessing,
      config: CONFIG,
    };
  }
}

// Export singleton instance
module.exports = new SessionAutoFinalizer();
