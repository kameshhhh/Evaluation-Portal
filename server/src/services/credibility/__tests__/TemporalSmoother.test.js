// ============================================================
// TEMPORAL SMOOTHER TESTS — EMA-Based Profile Updating
// ============================================================
// Tests the TemporalSmoother's EMA algorithm, dynamic alpha,
// safeguards, band classification, and grace period handling.
// All tests are pure math (no DB, no mocking needed).
//
// Run: npx jest server/src/services/credibility/__tests__/TemporalSmoother.test.js
// ============================================================

const TemporalSmoother = require("../compositors/TemporalSmoother");

// ============================================================
// MISSING INPUT
// ============================================================
describe("TemporalSmoother — Missing Input", () => {
  test("null newComposite → returns current profile unchanged", () => {
    const result = TemporalSmoother.smooth({
      currentProfile: 0.7,
      newComposite: null,
      sessionCount: 10,
    });

    expect(result.smoothed_score).toBe(0.7);
    expect(result.change).toBe(0);
    expect(result.metadata.missing_input).toBe(true);
  });

  test("null currentProfile + null newComposite → default 0.5", () => {
    const result = TemporalSmoother.smooth({
      currentProfile: null,
      newComposite: null,
      sessionCount: 0,
    });

    expect(result.smoothed_score).toBe(0.5);
  });
});

// ============================================================
// GRACE PERIOD
// ============================================================
describe("TemporalSmoother — Grace Period", () => {
  test("session < minSessions → grace period with gentle alpha", () => {
    const result = TemporalSmoother.smooth({
      currentProfile: 0.5,
      newComposite: 0.8,
      sessionCount: 1, // < 3 (default min)
    });

    expect(result.metadata.grace_period).toBe(true);
    expect(result.effective_alpha).toBe(0.1); // Grace alpha
    // Change should be small: 0.1 * 0.8 + 0.9 * 0.5 = 0.53
    expect(result.smoothed_score).toBeCloseTo(0.53, 2);
  });

  test("session >= minSessions → full EMA (no grace)", () => {
    const result = TemporalSmoother.smooth({
      currentProfile: 0.5,
      newComposite: 0.8,
      sessionCount: 5,
    });

    expect(result.metadata.grace_period).toBe(false);
    expect(result.effective_alpha).toBeGreaterThan(0.1);
  });
});

// ============================================================
// EMA SMOOTHING
// ============================================================
describe("TemporalSmoother — EMA Calculation", () => {
  test("EMA with alpha=0.2: profile moves toward new composite", () => {
    const result = TemporalSmoother.smooth({
      currentProfile: 0.5,
      newComposite: 0.8,
      sessionCount: 20, // Well-established → alpha near base
      config: { alpha: 0.2 },
    });

    // At session 20, dynamic alpha ≈ 0.2 + 0.8*e^(-20/3) ≈ 0.2 + 0.001 ≈ 0.201
    // raw = 0.201 * 0.8 + 0.799 * 0.5 ≈ 0.161 + 0.399 ≈ 0.560
    expect(result.smoothed_score).toBeGreaterThan(0.5);
    expect(result.smoothed_score).toBeLessThan(0.8);
  });

  test("new evaluator has higher effective alpha (faster learning)", () => {
    const resultNew = TemporalSmoother.smooth({
      currentProfile: 0.5,
      newComposite: 0.8,
      sessionCount: 3,
    });

    const resultOld = TemporalSmoother.smooth({
      currentProfile: 0.5,
      newComposite: 0.8,
      sessionCount: 20,
    });

    // New evaluator should have higher alpha → bigger change
    expect(resultNew.effective_alpha).toBeGreaterThan(
      resultOld.effective_alpha,
    );
    expect(resultNew.smoothed_score).toBeGreaterThan(resultOld.smoothed_score);
  });
});

// ============================================================
// MAX-CHANGE SAFEGUARD
// ============================================================
describe("TemporalSmoother — Max Change Safeguard", () => {
  test("large jump is clamped to maxChange (0.15)", () => {
    const result = TemporalSmoother.smooth({
      currentProfile: 0.5,
      newComposite: 0.1, // Huge drop
      sessionCount: 3, // High alpha → raw change would be large
      config: { maxChange: 0.15 },
    });

    // Change should be clamped to -0.15
    expect(result.was_clamped).toBe(true);
    expect(result.is_anomalous).toBe(true);
    expect(Math.abs(result.change)).toBeLessThanOrEqual(0.15);
    expect(result.smoothed_score).toBeCloseTo(0.35, 1);
  });

  test("small change is not clamped", () => {
    const result = TemporalSmoother.smooth({
      currentProfile: 0.7,
      newComposite: 0.72,
      sessionCount: 20, // Low alpha → tiny change
    });

    expect(result.was_clamped).toBe(false);
    expect(result.is_anomalous).toBe(false);
  });
});

// ============================================================
// BAND CLASSIFICATION
// ============================================================
describe("TemporalSmoother — Band Classification", () => {
  test("score >= 0.75 → HIGH band", () => {
    expect(TemporalSmoother.classifyBand(0.75)).toBe("HIGH");
    expect(TemporalSmoother.classifyBand(0.95)).toBe("HIGH");
  });

  test("0.45 <= score < 0.75 → MEDIUM band", () => {
    expect(TemporalSmoother.classifyBand(0.45)).toBe("MEDIUM");
    expect(TemporalSmoother.classifyBand(0.74)).toBe("MEDIUM");
  });

  test("score < 0.45 → LOW band", () => {
    expect(TemporalSmoother.classifyBand(0.44)).toBe("LOW");
    expect(TemporalSmoother.classifyBand(0.1)).toBe("LOW");
  });
});

// ============================================================
// DYNAMIC ALPHA
// ============================================================
describe("TemporalSmoother — Dynamic Alpha", () => {
  test("alpha decreases as session count increases", () => {
    const result3 = TemporalSmoother.smooth({
      currentProfile: 0.5,
      newComposite: 0.7,
      sessionCount: 3,
    });

    const result10 = TemporalSmoother.smooth({
      currentProfile: 0.5,
      newComposite: 0.7,
      sessionCount: 10,
    });

    const result50 = TemporalSmoother.smooth({
      currentProfile: 0.5,
      newComposite: 0.7,
      sessionCount: 50,
    });

    // Alpha should monotonically decrease with more sessions
    expect(result3.effective_alpha).toBeGreaterThan(result10.effective_alpha);
    expect(result10.effective_alpha).toBeGreaterThan(result50.effective_alpha);
  });
});

// ============================================================
// OUTPUT STRUCTURE
// ============================================================
describe("TemporalSmoother — Output Structure", () => {
  test("output includes all expected fields", () => {
    const result = TemporalSmoother.smooth({
      currentProfile: 0.6,
      newComposite: 0.7,
      sessionCount: 5,
    });

    expect(result).toHaveProperty("smoothed_score");
    expect(result).toHaveProperty("previous_score");
    expect(result).toHaveProperty("raw_ema_score");
    expect(result).toHaveProperty("change");
    expect(result).toHaveProperty("raw_change");
    expect(result).toHaveProperty("was_clamped");
    expect(result).toHaveProperty("band");
    expect(result).toHaveProperty("effective_alpha");
    expect(result).toHaveProperty("session_count");
    expect(result).toHaveProperty("is_anomalous");
    expect(result).toHaveProperty("metadata");
  });
});

// ============================================================
// SCORE BOUNDS
// ============================================================
describe("TemporalSmoother — Score Bounds", () => {
  test("smoothed score never below 0.1", () => {
    const result = TemporalSmoother.smooth({
      currentProfile: 0.1,
      newComposite: 0.0, // Trying to drag below 0.1
      sessionCount: 5,
    });

    expect(result.smoothed_score).toBeGreaterThanOrEqual(0.1);
  });

  test("smoothed score never above 0.95", () => {
    const result = TemporalSmoother.smooth({
      currentProfile: 0.95,
      newComposite: 1.0,
      sessionCount: 5,
    });

    expect(result.smoothed_score).toBeLessThanOrEqual(0.95);
  });
});
