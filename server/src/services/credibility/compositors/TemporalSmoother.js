// ============================================================
// TEMPORAL SMOOTHER — EMA-Based Profile Updating
// ============================================================
// Implements SRS 5.1 "Exponential Moving Average (EMA)":
//   Smoothly adjusts the evaluator's long-running credibility
//   profile by blending new session composite with existing profile.
//
// ALGORITHM:
//   new_profile = α · new_composite + (1 − α) · old_profile
//
// DYNAMIC ALPHA:
//   • New evaluators (< minSessions): higher α → faster learning
//   • Established evaluators: standard α → slower, more stable
//   • α_effective = α_base + (1 − α_base) · e^(−sessions/3)
//
// SAFEGUARDS:
//   • Maximum change per update: 0.15 (prevents single-session shock)
//   • Grace period: first N sessions use default 0.5 (no EMA)
//   • Band classification: HIGH ≥ 0.75, MEDIUM ≥ 0.45, LOW < 0.45
//   • Anomaly detection: if change > 2× typical change, flag it
//
// PURE STATIC METHODS — no state, no DB, fully testable.
// ============================================================

"use strict";

class TemporalSmoother {
  // Default EMA parameters (from credibility_configuration seed)
  static DEFAULT_ALPHA = 0.2;
  static MIN_SESSIONS = 3; // Grace period before EMA kicks in
  static MAX_CHANGE = 0.15; // Max credibility shift per session

  // Band thresholds
  static BAND_HIGH = 0.75;
  static BAND_MEDIUM = 0.45;

  // ============================================================
  // PUBLIC: smooth
  // ============================================================
  // Apply EMA smoothing to update evaluator's credibility profile.
  //
  // @param {number} currentProfile — Existing credibility score (0-1)
  // @param {number} newComposite   — New session composite score (0-1)
  // @param {number} sessionCount   — Total sessions completed by evaluator
  // @param {Object} config         — Optional parameter overrides
  // @returns {Object} smoothed result with diagnostics
  // ============================================================
  static smooth({ currentProfile, newComposite, sessionCount, config = {} }) {
    const alpha = config.alpha || this.DEFAULT_ALPHA;
    const minSessions = config.minSessions || this.MIN_SESSIONS;
    const maxChange = config.maxChange || this.MAX_CHANGE;
    const startScore = config.startScore || 0.5;

    // Guard: missing inputs — return neutral default
    if (newComposite === undefined || newComposite === null) {
      return this._handleMissingInput(currentProfile, startScore);
    }

    // ---- Grace period : new evaluators with < minSessions ----
    if (sessionCount < minSessions) {
      return this._handleGracePeriod({
        currentProfile,
        newComposite,
        sessionCount,
        minSessions,
        startScore,
      });
    }

    // ---- Dynamic alpha: adapts to evaluator experience ----
    const effectiveAlpha = this._computeDynamicAlpha(alpha, sessionCount);

    // ---- EMA update ----
    const profile =
      currentProfile !== null && currentProfile !== undefined
        ? parseFloat(currentProfile)
        : startScore;
    const rawUpdated =
      effectiveAlpha * newComposite + (1 - effectiveAlpha) * profile;

    // ---- Max-change safeguard ----
    const change = rawUpdated - profile;
    const clampedChange =
      Math.abs(change) > maxChange ? Math.sign(change) * maxChange : change;
    const smoothedScore = Math.max(
      0.1,
      Math.min(0.95, profile + clampedChange),
    );

    // ---- Band classification ----
    const band = this._classifyBand(smoothedScore);

    // ---- Anomaly detection ----
    const isAnomalous = Math.abs(change) > maxChange;

    return {
      smoothed_score: parseFloat(smoothedScore.toFixed(4)),
      previous_score: parseFloat(profile.toFixed(4)),
      raw_ema_score: parseFloat(rawUpdated.toFixed(4)),
      change: parseFloat(clampedChange.toFixed(4)),
      raw_change: parseFloat(change.toFixed(4)),
      was_clamped: isAnomalous,
      band: band,
      effective_alpha: parseFloat(effectiveAlpha.toFixed(4)),
      session_count: sessionCount,
      is_anomalous: isAnomalous,
      metadata: {
        alpha_base: alpha,
        max_change_limit: maxChange,
        grace_period: false,
      },
    };
  }

  // ============================================================
  // PUBLIC: classifyBand
  // ============================================================
  // Classify a credibility score into HIGH / MEDIUM / LOW band.
  // Exposed publicly for use in other modules.
  // ============================================================
  static classifyBand(score) {
    return this._classifyBand(score);
  }

  // ============================================================
  // PRIVATE: _computeDynamicAlpha
  // ============================================================
  // Alpha increases for newer evaluators (faster initial learning).
  // α_effective = α_base + (1 − α_base) · e^(−sessionCount / 3)
  //
  // Example:
  //   session 3 → α ≈ 0.2 + 0.8 * e^(-1) ≈ 0.49 (fast learning)
  //   session 10 → α ≈ 0.2 + 0.8 * e^(-3.3) ≈ 0.23 (near base)
  //   session 20 → α ≈ 0.2 + 0.8 * e^(-6.7) ≈ 0.20 (essentially base)
  // ============================================================
  static _computeDynamicAlpha(baseAlpha, sessionCount) {
    const decayFactor = Math.exp(-sessionCount / 3);
    return baseAlpha + (1 - baseAlpha) * decayFactor;
  }

  // ============================================================
  // PRIVATE: _classifyBand
  // ============================================================
  static _classifyBand(score) {
    if (score >= this.BAND_HIGH) return "HIGH";
    if (score >= this.BAND_MEDIUM) return "MEDIUM";
    return "LOW";
  }

  // ============================================================
  // PRIVATE: _handleGracePeriod
  // ============================================================
  // During grace period, we accumulate evidence but use a simple
  // average rather than EMA. The evaluator keeps the default score
  // adjusted only mildly toward the new composite.
  // ============================================================
  static _handleGracePeriod({
    currentProfile,
    newComposite,
    sessionCount,
    minSessions,
    startScore,
  }) {
    const profile =
      currentProfile !== null && currentProfile !== undefined
        ? parseFloat(currentProfile)
        : startScore;

    // Gentle adjustment: move 10% toward the new composite per grace session
    const graceAlpha = 0.1;
    const adjusted = graceAlpha * newComposite + (1 - graceAlpha) * profile;
    const smoothedScore = Math.max(0.1, Math.min(0.95, adjusted));

    return {
      smoothed_score: parseFloat(smoothedScore.toFixed(4)),
      previous_score: parseFloat(profile.toFixed(4)),
      raw_ema_score: parseFloat(adjusted.toFixed(4)),
      change: parseFloat((smoothedScore - profile).toFixed(4)),
      raw_change: parseFloat((adjusted - profile).toFixed(4)),
      was_clamped: false,
      band: this._classifyBand(smoothedScore),
      effective_alpha: graceAlpha,
      session_count: sessionCount,
      is_anomalous: false,
      metadata: {
        grace_period: true,
        sessions_until_ema: minSessions - sessionCount,
      },
    };
  }

  // ============================================================
  // PRIVATE: _handleMissingInput — neutral fallback
  // ============================================================
  static _handleMissingInput(currentProfile, startScore) {
    const score =
      currentProfile !== null && currentProfile !== undefined
        ? parseFloat(currentProfile)
        : startScore;

    return {
      smoothed_score: parseFloat(score.toFixed(4)),
      previous_score: parseFloat(score.toFixed(4)),
      raw_ema_score: parseFloat(score.toFixed(4)),
      change: 0,
      raw_change: 0,
      was_clamped: false,
      band: this._classifyBand(score),
      effective_alpha: 0,
      session_count: 0,
      is_anomalous: false,
      metadata: { missing_input: true },
    };
  }
}

module.exports = TemporalSmoother;
