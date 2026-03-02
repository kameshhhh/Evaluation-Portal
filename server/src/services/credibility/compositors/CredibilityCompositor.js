// ============================================================
// CREDIBILITY COMPOSITOR — Weighted Signal Fusion
// ============================================================
// Implements SRS 5.1 "Multi-Signal Composition":
//   Combines alignment, stability, and discipline scores into
//   a single composite credibility score using configurable weights.
//
// ALGORITHM:
//   1. Apply configurable weights (default: 0.5 / 0.3 / 0.2)
//   2. Compute weighted sum → raw composite
//   3. Apply non-linear adjustments for extreme mismatches
//   4. Enforce safeguard bounds (min 0.1, max 0.95)
//   5. Generate diagnostic flags for anomalous combinations
//
// NON-LINEAR ADJUSTMENTS:
//   • If any single signal is critically low (<0.2), apply a
//     "drag-down" penalty — one terrible dimension shouldn't
//     be compensated by two good ones.
//   • If signals are wildly divergent (spread > 0.4), flag as
//     "mixed_signals" and apply a small penalty.
//
// PURE STATIC METHODS — no state, no DB, fully testable.
// ============================================================

"use strict";

class CredibilityCompositor {
  // Default signal weights per SRS 5.1
  static DEFAULT_WEIGHTS = {
    alignment: 0.5,
    stability: 0.3,
    discipline: 0.2,
  };

  // Hard bounds to prevent extreme values
  static MIN_CREDIBILITY = 0.1;
  static MAX_CREDIBILITY = 0.95;

  // Threshold below which a single signal triggers drag-down
  static CRITICAL_SIGNAL_THRESHOLD = 0.2;

  // ============================================================
  // PUBLIC: compose
  // ============================================================
  // Combines three signal scores into one composite.
  //
  // @param {Object} signals — {alignment_score, stability_score, discipline_score}
  // @param {Object} weights — Optional weight overrides
  // @returns {Object} composite result with diagnostics
  // ============================================================
  static compose({ signals, weights = null }) {
    const w = weights || this.DEFAULT_WEIGHTS;

    // Guard: missing signals — return neutral default
    if (!signals) {
      return this._handleMissingSignals();
    }

    // Extract scores with fallback to neutral 0.5
    const alignment = this._safeScore(signals.alignment_score);
    const stability = this._safeScore(signals.stability_score);
    const discipline = this._safeScore(signals.discipline_score);

    // ---- 1. Weighted linear combination ----
    const rawComposite =
      alignment * w.alignment +
      stability * w.stability +
      discipline * w.discipline;

    // ---- 2. Non-linear adjustments ----
    const adjustments = this._computeAdjustments(
      alignment,
      stability,
      discipline,
    );

    // Apply drag-down penalty and divergence penalty
    let adjustedComposite = rawComposite + adjustments.totalPenalty;

    // ---- 3. Enforce safeguard bounds ----
    const finalScore = Math.max(
      this.MIN_CREDIBILITY,
      Math.min(this.MAX_CREDIBILITY, adjustedComposite),
    );

    // ---- 4. Diagnostic flags ----
    const flags = this._generateFlags(
      alignment,
      stability,
      discipline,
      adjustments,
    );

    return {
      composite_score: parseFloat(finalScore.toFixed(4)),
      raw_composite: parseFloat(rawComposite.toFixed(4)),
      adjusted_composite: parseFloat(adjustedComposite.toFixed(4)),
      signal_components: {
        alignment: parseFloat(alignment.toFixed(4)),
        stability: parseFloat(stability.toFixed(4)),
        discipline: parseFloat(discipline.toFixed(4)),
      },
      weights_used: { ...w },
      adjustments: {
        drag_down_penalty: parseFloat(adjustments.dragDownPenalty.toFixed(4)),
        divergence_penalty: parseFloat(
          adjustments.divergencePenalty.toFixed(4),
        ),
        total_penalty: parseFloat(adjustments.totalPenalty.toFixed(4)),
      },
      flags: flags,
      metadata: {
        bounds_applied: finalScore !== adjustedComposite,
        min_bound: this.MIN_CREDIBILITY,
        max_bound: this.MAX_CREDIBILITY,
      },
    };
  }

  // ============================================================
  // PRIVATE: _computeAdjustments
  // ============================================================
  // Applies non-linear penalties for extreme signal combinations.
  // ============================================================
  static _computeAdjustments(alignment, stability, discipline) {
    let dragDownPenalty = 0;
    let divergencePenalty = 0;

    // ---- Drag-down: any critically low signal pulls composite down ----
    const scores = [alignment, stability, discipline];
    const criticallyLow = scores.filter(
      (s) => s < this.CRITICAL_SIGNAL_THRESHOLD,
    );

    if (criticallyLow.length > 0) {
      // Penalty proportional to how low the worst signal is
      const worstScore = Math.min(...scores);
      // -0.05 to -0.15 penalty depending on severity
      dragDownPenalty = -(this.CRITICAL_SIGNAL_THRESHOLD - worstScore) * 0.5;
    }

    // ---- Divergence: wildly different signals indicate inconsistency ----
    const maxSignal = Math.max(...scores);
    const minSignal = Math.min(...scores);
    const spread = maxSignal - minSignal;

    if (spread > 0.4) {
      // Small penalty: -0.02 to -0.05 for large spread
      divergencePenalty = -(spread - 0.4) * 0.1;
    }

    return {
      dragDownPenalty,
      divergencePenalty,
      totalPenalty: dragDownPenalty + divergencePenalty,
    };
  }

  // ============================================================
  // PRIVATE: _generateFlags
  // ============================================================
  // Creates diagnostic flags for the admin dashboard.
  // ============================================================
  static _generateFlags(alignment, stability, discipline, adjustments) {
    const flags = [];

    // Flag alignment issues
    if (alignment < 0.3) {
      flags.push("low_alignment");
    }

    // Flag stability issues
    if (stability < 0.3) {
      flags.push("low_stability");
    }

    // Flag discipline issues
    if (discipline < 0.3) {
      flags.push("low_discipline");
    }

    // Flag mixed signals (good in one, bad in another)
    const scores = [alignment, stability, discipline];
    const spread = Math.max(...scores) - Math.min(...scores);
    if (spread > 0.4) {
      flags.push("mixed_signals");
    }

    // Flag if penalties were applied
    if (adjustments.dragDownPenalty < -0.05) {
      flags.push("drag_down_applied");
    }

    // Flag excellent evaluator
    if (alignment > 0.8 && stability > 0.7 && discipline > 0.7) {
      flags.push("exemplary_evaluator");
    }

    return flags;
  }

  // ============================================================
  // PRIVATE: _safeScore — parse with neutral default
  // ============================================================
  static _safeScore(value) {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return 0.5; // Neutral default
    return Math.max(0, Math.min(1, parsed));
  }

  // ============================================================
  // PRIVATE: _handleMissingSignals — neutral result
  // ============================================================
  static _handleMissingSignals() {
    return {
      composite_score: 0.5,
      raw_composite: 0.5,
      adjusted_composite: 0.5,
      signal_components: {
        alignment: 0.5,
        stability: 0.5,
        discipline: 0.5,
      },
      weights_used: { ...this.DEFAULT_WEIGHTS },
      adjustments: {
        drag_down_penalty: 0,
        divergence_penalty: 0,
        total_penalty: 0,
      },
      flags: ["no_signals"],
      metadata: { missing_signals: true },
    };
  }
}

module.exports = CredibilityCompositor;
