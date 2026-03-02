// ============================================================
// CREDIBILITY COMPOSITOR TESTS — Weighted Signal Fusion
// ============================================================
// Tests the CredibilityCompositor's ability to combine three
// signal scores into one composite with non-linear adjustments.
// All tests are pure math (no DB, no mocking needed).
//
// Run: npx jest server/src/services/credibility/__tests__/CredibilityCompositor.test.js
// ============================================================

const CredibilityCompositor = require("../compositors/CredibilityCompositor");

// ============================================================
// MISSING SIGNALS
// ============================================================
describe("CredibilityCompositor — Missing Signals", () => {
  test("null signals → neutral default 0.5", () => {
    const result = CredibilityCompositor.compose({ signals: null });

    expect(result.composite_score).toBe(0.5);
    expect(result.flags).toContain("no_signals");
    expect(result.metadata.missing_signals).toBe(true);
  });
});

// ============================================================
// BALANCED SIGNALS
// ============================================================
describe("CredibilityCompositor — Balanced Signals", () => {
  test("all signals at 0.8 → composite ≈ 0.8 (no penalties)", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 0.8,
        stability_score: 0.8,
        discipline_score: 0.8,
      },
    });

    // Weighted: 0.8*0.5 + 0.8*0.3 + 0.8*0.2 = 0.8
    // No penalties (no critical signals, spread = 0)
    expect(result.composite_score).toBeCloseTo(0.8, 2);
    expect(result.adjustments.total_penalty).toBe(0);
    expect(result.flags).not.toContain("mixed_signals");
  });

  test("default weights: alignment 0.5, stability 0.3, discipline 0.2", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 1.0,
        stability_score: 0.0,
        discipline_score: 0.5,
      },
    });

    // Raw: 1.0*0.5 + 0.0*0.3 + 0.5*0.2 = 0.5 + 0 + 0.1 = 0.6
    expect(result.raw_composite).toBeCloseTo(0.6, 1);
  });
});

// ============================================================
// CUSTOM WEIGHTS
// ============================================================
describe("CredibilityCompositor — Custom Weights", () => {
  test("custom weights override defaults", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 0.9,
        stability_score: 0.5,
        discipline_score: 0.7,
      },
      weights: { alignment: 0.3, stability: 0.3, discipline: 0.4 },
    });

    // Raw: 0.9*0.3 + 0.5*0.3 + 0.7*0.4 = 0.27 + 0.15 + 0.28 = 0.7
    expect(result.raw_composite).toBeCloseTo(0.7, 1);
    expect(result.weights_used.alignment).toBe(0.3);
    expect(result.weights_used.discipline).toBe(0.4);
  });
});

// ============================================================
// DRAG-DOWN PENALTY
// ============================================================
describe("CredibilityCompositor — Drag-Down Penalty", () => {
  test("one critically low signal (<0.2) triggers drag-down", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 0.9,
        stability_score: 0.9,
        discipline_score: 0.1, // critically low
      },
    });

    // Without penalty: 0.9*0.5 + 0.9*0.3 + 0.1*0.2 = 0.45 + 0.27 + 0.02 = 0.74
    // With penalty: reduced by drag-down
    expect(result.adjustments.drag_down_penalty).toBeLessThan(0);
    expect(result.composite_score).toBeLessThan(result.raw_composite);
  });
});

// ============================================================
// DIVERGENCE PENALTY
// ============================================================
describe("CredibilityCompositor — Divergence Penalty", () => {
  test("wide signal spread (>0.4) triggers divergence penalty", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 0.9,
        stability_score: 0.4, // Spread = 0.9 - 0.4 = 0.5 > 0.4
        discipline_score: 0.7,
      },
    });

    expect(result.adjustments.divergence_penalty).toBeLessThan(0);
    expect(result.flags).toContain("mixed_signals");
  });

  test("narrow spread → no divergence penalty", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 0.7,
        stability_score: 0.6,
        discipline_score: 0.65,
      },
    });

    // Spread = 0.7 - 0.6 = 0.1 < 0.4 → no penalty
    expect(result.adjustments.divergence_penalty).toBe(0);
    expect(result.flags).not.toContain("mixed_signals");
  });
});

// ============================================================
// DIAGNOSTIC FLAGS
// ============================================================
describe("CredibilityCompositor — Diagnostic Flags", () => {
  test("flags low_alignment when alignment < 0.3", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 0.2,
        stability_score: 0.6,
        discipline_score: 0.6,
      },
    });

    expect(result.flags).toContain("low_alignment");
  });

  test("flags exemplary_evaluator when all scores high", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 0.85,
        stability_score: 0.75,
        discipline_score: 0.8,
      },
    });

    expect(result.flags).toContain("exemplary_evaluator");
  });

  test("flags low_stability when stability < 0.3", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 0.7,
        stability_score: 0.2,
        discipline_score: 0.7,
      },
    });

    expect(result.flags).toContain("low_stability");
  });
});

// ============================================================
// SCORE BOUNDS (safeguards)
// ============================================================
describe("CredibilityCompositor — Score Bounds", () => {
  test("composite never goes below 0.1 (MIN_CREDIBILITY)", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 0.05,
        stability_score: 0.05,
        discipline_score: 0.05,
      },
    });

    expect(result.composite_score).toBeGreaterThanOrEqual(0.1);
  });

  test("composite never exceeds 0.95 (MAX_CREDIBILITY)", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 1.0,
        stability_score: 1.0,
        discipline_score: 1.0,
      },
    });

    expect(result.composite_score).toBeLessThanOrEqual(0.95);
  });
});

// ============================================================
// SIGNAL COMPONENTS IN OUTPUT
// ============================================================
describe("CredibilityCompositor — Output Structure", () => {
  test("output includes all expected fields", () => {
    const result = CredibilityCompositor.compose({
      signals: {
        alignment_score: 0.7,
        stability_score: 0.6,
        discipline_score: 0.8,
      },
    });

    expect(result).toHaveProperty("composite_score");
    expect(result).toHaveProperty("raw_composite");
    expect(result).toHaveProperty("adjusted_composite");
    expect(result).toHaveProperty("signal_components");
    expect(result).toHaveProperty("weights_used");
    expect(result).toHaveProperty("adjustments");
    expect(result).toHaveProperty("flags");
    expect(result).toHaveProperty("metadata");

    expect(result.signal_components.alignment).toBe(0.7);
    expect(result.signal_components.stability).toBe(0.6);
    expect(result.signal_components.discipline).toBe(0.8);
  });
});
