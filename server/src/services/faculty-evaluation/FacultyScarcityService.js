// ============================================================
// FACULTY SCARCITY SERVICE
// ============================================================
// SRS §4.4.1: Scarcity-Based Feedback
//
// Enforces scarcity rules for faculty evaluation point allocation.
//
// RULES:
// 1. Student receives a fixed total budget (derived from mode + faculty count)
// 2. Cannot assign points to all faculty if budget < faculty count
//    (unless session.allow_assign_all = true)
// 3. Binary mode: strictly 0 or 1 per faculty
// 4. No per-faculty upper cap in pool modes
//
// Uses raw SQL via pg Pool (project convention).
// ============================================================

const logger = require("../../utils/logger");

/**
 * @description Tier definitions per evaluation mode (mirrors controller TIER_CONFIG)
 */
const TIER_CONFIG = Object.freeze({
  binary: [
    { id: "tier1", label: "Selected", points: 1 },
    { id: "unranked", label: "Not Selected", points: 0 },
  ],
  small_pool: [
    { id: "tier1", label: "Outstanding", points: 3 },
    { id: "tier2", label: "Good", points: 2 },
    { id: "tier3", label: "Satisfactory", points: 1 },
    { id: "unranked", label: "Not Evaluated", points: 0 },
  ],
  full_pool: [
    { id: "tier1", label: "Exceptional", points: 4 },
    { id: "tier2", label: "Commendable", points: 2 },
    { id: "tier3", label: "Adequate", points: 1 },
    { id: "unranked", label: "Not Evaluated", points: 0 },
  ],
});

class FacultyScarcityService {
  // ============================================================
  // POOL CONFIGURATION
  // ============================================================

  /**
   * Get pool configuration for a scoring mode.
   * @param {string} scoringMode - 'binary' | 'small_pool' | 'full_pool'
   * @param {number} facultyCount - Number of eligible faculty
   * @returns {Object} Pool constraints
   */
  static getPoolConfig(scoringMode, facultyCount = 0) {
    switch (scoringMode) {
      case "binary":
        return {
          budget: Math.max(1, Math.floor(facultyCount * 0.3)),
          minPerFaculty: 0,
          maxPerFaculty: 1,
          allowDecimals: false,
          description: "Binary: select up to 30% of faculty — 1 point each",
          tiers: TIER_CONFIG.binary,
        };
      case "small_pool":
        return {
          budget: Math.max(3, Math.floor(facultyCount * 1.5)),
          minPerFaculty: 0,
          maxPerFaculty: 3,
          allowDecimals: false,
          description: "Small pool: distribute points across tiers (3/2/1/0)",
          tiers: TIER_CONFIG.small_pool,
        };
      case "full_pool":
        return {
          budget: 10,
          minPerFaculty: 0,
          maxPerFaculty: null, // no per-faculty cap
          allowDecimals: true,
          description: "Full pool: 10 points — tier-based (4/2/1/0)",
          tiers: TIER_CONFIG.full_pool,
        };
      default:
        throw new Error(`Unknown scoring mode: ${scoringMode}`);
    }
  }

  // ============================================================
  // VALIDATE ALLOCATION (real-time validation)
  // ============================================================

  /**
   * Validates an array of allocations against scarcity rules.
   *
   * @param {Array<{facultyId:string, tier:string, points:number}>} allocations
   * @param {string} scoringMode
   * @param {number} facultyCount - Total eligible faculty
   * @param {boolean} allowAssignAll - Session-level override
   * @returns {Object} Validation result
   */
  static validateAllocation(
    allocations,
    scoringMode,
    facultyCount,
    allowAssignAll = false,
  ) {
    const errors = [];
    const warnings = [];

    const config = this.getPoolConfig(scoringMode, facultyCount);
    const totalPoints = allocations.reduce(
      (sum, a) => sum + (a.points || 0),
      0,
    );

    // 1. Budget check
    if (totalPoints > config.budget) {
      errors.push({
        field: "total",
        message: `Total points (${totalPoints}) exceeds budget (${config.budget})`,
        severity: "error",
      });
    }

    // 2. Negative points
    if (allocations.some((a) => (a.points || 0) < 0)) {
      errors.push({
        field: "points",
        message: "Points cannot be negative",
        severity: "error",
      });
    }

    // 3. Binary mode — only 0 or 1
    if (scoringMode === "binary") {
      const invalid = allocations.filter(
        (a) => a.points !== 0 && a.points !== 1,
      );
      if (invalid.length > 0) {
        errors.push({
          field: "points",
          message: "Binary mode only allows 0 or 1 points per faculty",
          severity: "error",
        });
      }
    }

    // 4. Per-faculty cap (pool modes)
    if (config.maxPerFaculty !== null) {
      const overcap = allocations.filter(
        (a) => a.points > config.maxPerFaculty,
      );
      if (overcap.length > 0) {
        errors.push({
          field: "points",
          message: `Max ${config.maxPerFaculty} points per faculty in ${scoringMode} mode`,
          severity: "error",
        });
      }
    }

    // 5. Scarcity rule: cannot assign to ALL if budget < count
    const allocatedCount = allocations.filter((a) => a.points > 0).length;
    if (
      !allowAssignAll &&
      allocatedCount === facultyCount &&
      config.budget < facultyCount &&
      allocatedCount > 0
    ) {
      warnings.push({
        field: "distribution",
        message: `You're giving points to all ${facultyCount} faculty with only ${config.budget} points. Consider prioritizing the most impactful.`,
        severity: "warning",
      });
    }

    // 6. Status
    let status = "under";
    if (totalPoints === config.budget) status = "exact";
    else if (totalPoints > config.budget) status = "over";

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      totalPoints,
      budget: config.budget,
      remainingPoints: config.budget - totalPoints,
      status,
      isComplete: totalPoints === config.budget,
    };
  }

  // ============================================================
  // SUGGEST ALLOCATION
  // ============================================================

  /**
   * Suggest a possible allocation strategy (informational, not enforced).
   *
   * @param {Array<{id:string, name:string}>} facultyList
   * @param {Object} config - From getPoolConfig()
   * @returns {Array<Object>} Suggested allocations
   */
  static suggestAllocation(facultyList, config) {
    const count = facultyList.length;
    if (count === 0) return [];

    const basePoints = Math.floor(config.budget / count);
    const remainder = config.budget % count;

    return facultyList.map((f, i) => ({
      facultyId: f.id,
      facultyName: f.name,
      suggestedPoints: i < remainder ? basePoints + 1 : basePoints,
      reasoning:
        i < remainder ? "Even distribution + remainder" : "Even distribution",
    }));
  }

  // ============================================================
  // SCARCITY EDUCATION CONTENT
  // ============================================================

  /**
   * Returns educational content about the scarcity principle.
   * Shown to students before they evaluate.
   */
  static getScarcityEducation() {
    return {
      principle: "Scarcity over abundance",
      explanation:
        "Limited points force meaningful choices rather than rating everyone highly.",
      benefits: [
        "Identifies truly exceptional teaching",
        "Prevents evaluation inflation",
        "Forces prioritization of impact",
        "Produces more actionable feedback",
      ],
      modes: {
        binary:
          "Select only the top ~30% of faculty. Each selected receives 1 point.",
        small_pool:
          "Rank faculty into tiers: Outstanding (3), Good (2), Satisfactory (1), or Not Evaluated (0).",
        full_pool:
          "Distribute 10 points across tiers: Exceptional (4), Commendable (2), Adequate (1), or 0.",
      },
    };
  }
}

module.exports = FacultyScarcityService;
