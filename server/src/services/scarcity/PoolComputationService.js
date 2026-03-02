// ============================================================
// POOL COMPUTATION SERVICE — Scarcity Pool Size Calculator
// ============================================================
// Pure functions that calculate pool sizes for different
// evaluation modes. No database, no side effects.
//
// SRS REFERENCE:
//   4.1.3 — "Each judge is assigned a fixed total score pool"
//           "Score pool is proportional to team size:
//            3 members → 15 points, 4 members → 20 points"
//   4.3.1 — "Judge receives a fixed total pool (e.g., 10 points)"
//   4.4.1 — "Student receives limited points (e.g., 1, 3, 10)"
//   4.5.2 — "Student must rank limited top positions"
//
// POOL FORMULAS:
//   project_member: teamSize × POINTS_PER_MEMBER (default 5)
//   cross_project:  configurable (default 10)
//   faculty:        configurable (1, 3, or 10)
//   peer:           triangular number based on ranking depth
// ============================================================

// ============================================================
// CONSTANTS — Pool calculation parameters
// ============================================================

// Points allocated per team member for project_member mode
// SRS 4.1.3: "3 members → 15 points" = 5 per member
const POINTS_PER_MEMBER = 5;

// Valid team size range for project evaluations
// SRS 4.1.1: "Team size: 2–4 members"
const MIN_TEAM_SIZE = 2;
const MAX_TEAM_SIZE = 4;

// Default pool for cross-project comparison mode
// SRS 4.3.1: "Judge receives a fixed total pool (e.g., 10 points)"
const DEFAULT_CROSS_PROJECT_POOL = 10;

// Supported faculty evaluation pool sizes
// SRS 4.4.2: "Binary (0/1), Small pool (1–3 points), Larger pool (10 points)"
const VALID_FACULTY_POOLS = Object.freeze([1, 3, 10]);

// Default faculty pool size (small pool mode)
const DEFAULT_FACULTY_POOL = 3;

// Default ranking depth for peer evaluation
// SRS 4.5.2: "Student must rank limited top positions (1, 2, 3…)"
const DEFAULT_RANKING_DEPTH = 3;

// All supported evaluation modes — frozen enum object
// Matches the CHECK constraint on evaluation_sessions.evaluation_mode
const EVALUATION_MODES = Object.freeze({
  PROJECT_MEMBER: "project_member", // Scoring team members within a project
  CROSS_PROJECT: "cross_project", // Comparing multiple projects
  FACULTY: "faculty", // Students evaluating faculty
  PEER: "peer", // Peer ranking within a group
});

// ============================================================
// calculatePoolSize — Main pool computation function
// ============================================================
/**
 * Calculate the scarcity pool size for an evaluation session.
 *
 * The pool size determines the maximum total points an evaluator
 * can distribute across all targets. This is the core scarcity
 * mechanism — limited points force deliberate trade-offs.
 *
 * @param {string} mode - Evaluation mode (project_member/cross_project/faculty/peer)
 * @param {Object} config - Mode-specific configuration
 * @param {number} [config.teamSize] - Team size for project_member mode (2-4)
 * @param {number} [config.poolSize] - Custom pool size for cross_project/faculty modes
 * @param {number} [config.rankingDepth] - Number of ranks for peer mode (default 3)
 * @returns {number} The calculated pool size
 * @throws {Error} If mode is unknown or config is invalid
 *
 * @example
 * calculatePoolSize('project_member', { teamSize: 3 }) // → 15
 * calculatePoolSize('cross_project', { poolSize: 10 }) // → 10
 * calculatePoolSize('faculty', { poolSize: 3 })         // → 3
 * calculatePoolSize('peer', { rankingDepth: 3 })        // → 6
 */
function calculatePoolSize(mode, config = {}) {
  // Route to the correct calculator based on evaluation mode
  switch (mode) {
    case EVALUATION_MODES.PROJECT_MEMBER:
      return _calculateProjectMemberPool(config);

    case EVALUATION_MODES.CROSS_PROJECT:
      return _calculateCrossProjectPool(config);

    case EVALUATION_MODES.FACULTY:
      return _calculateFacultyPool(config);

    case EVALUATION_MODES.PEER:
      return _calculatePeerPool(config);

    default:
      throw new Error(
        `Unknown evaluation mode: '${mode}'. ` +
          `Valid modes: ${Object.values(EVALUATION_MODES).join(", ")}`,
      );
  }
}

// ============================================================
// PRIVATE HELPERS — Mode-specific calculations
// ============================================================

/**
 * Calculate pool for project member evaluation.
 * Pool = teamSize × POINTS_PER_MEMBER
 *
 * SRS 4.1.3: "Score pool is proportional to team size"
 *
 * @param {Object} config - Must contain teamSize (2-4)
 * @returns {number} Pool size
 * @throws {Error} If teamSize is missing or out of range
 */
function _calculateProjectMemberPool(config) {
  // Validate team size is provided
  if (config.teamSize === undefined || config.teamSize === null) {
    throw new Error("teamSize is required for project_member mode");
  }

  // Cast to integer (in case string is passed)
  const teamSize = parseInt(config.teamSize, 10);

  // Validate range — SRS 4.1.1: "Team size: 2–4 members"
  if (teamSize < MIN_TEAM_SIZE || teamSize > MAX_TEAM_SIZE) {
    throw new Error(
      `Invalid team size: ${teamSize}. Must be between ${MIN_TEAM_SIZE} and ${MAX_TEAM_SIZE}`,
    );
  }

  // Pool = teamSize × 5 points per member
  return teamSize * POINTS_PER_MEMBER;
}

/**
 * Calculate pool for cross-project comparison.
 * Uses the provided pool size or falls back to default.
 *
 * SRS 4.3.1: "Judge receives a fixed total pool (e.g., 10 points)"
 *
 * @param {Object} config - Optional poolSize override
 * @returns {number} Pool size
 * @throws {Error} If poolSize is not positive
 */
function _calculateCrossProjectPool(config) {
  // Use provided pool size or default
  const poolSize =
    config.poolSize !== undefined
      ? parseFloat(config.poolSize)
      : DEFAULT_CROSS_PROJECT_POOL;

  // Validate positive value
  if (poolSize <= 0) {
    throw new Error(`Pool size must be positive, got: ${poolSize}`);
  }

  return poolSize;
}

/**
 * Calculate pool for faculty evaluation.
 * Must be one of the approved pool sizes (1, 3, or 10).
 *
 * SRS 4.4.2: "Binary (0/1), Small pool (1–3 points), Larger pool (10 points)"
 *
 * @param {Object} config - Optional poolSize (must be 1, 3, or 10)
 * @returns {number} Pool size
 * @throws {Error} If poolSize is not in VALID_FACULTY_POOLS
 */
function _calculateFacultyPool(config) {
  // Use provided pool size or default
  const poolSize =
    config.poolSize !== undefined
      ? parseInt(config.poolSize, 10)
      : DEFAULT_FACULTY_POOL;

  // Validate against approved pool sizes
  if (!VALID_FACULTY_POOLS.includes(poolSize)) {
    throw new Error(
      `Invalid faculty pool size: ${poolSize}. Must be one of: ${VALID_FACULTY_POOLS.join(", ")}`,
    );
  }

  return poolSize;
}

/**
 * Calculate pool for peer ranking evaluation.
 * Uses triangular number formula: n(n+1)/2
 * This naturally creates scarcity — rank 1 gets more weight,
 * lower ranks get less.
 *
 * SRS 4.5.2: "Student must rank limited top positions (1, 2, 3…)"
 *
 * @param {Object} config - Optional rankingDepth (default 3)
 * @returns {number} Pool size (triangular number)
 * @throws {Error} If rankingDepth is less than 1
 */
function _calculatePeerPool(config) {
  // Use provided ranking depth or default
  const depth =
    config.rankingDepth !== undefined
      ? parseInt(config.rankingDepth, 10)
      : DEFAULT_RANKING_DEPTH;

  // Validate positive depth
  if (depth < 1) {
    throw new Error(`Ranking depth must be at least 1, got: ${depth}`);
  }

  // Triangular number: T(n) = n(n+1)/2
  // depth=3 → 6 points (3+2+1), depth=5 → 15 points (5+4+3+2+1)
  return (depth * (depth + 1)) / 2;
}

/**
 * Validate that a mode string is a recognized evaluation mode.
 *
 * @param {string} mode - Mode to validate
 * @returns {boolean} True if the mode is valid
 */
function isValidEvaluationMode(mode) {
  return Object.values(EVALUATION_MODES).includes(mode);
}

/**
 * Get the human-readable description for an evaluation mode.
 *
 * @param {string} mode - Evaluation mode
 * @returns {string} Description of the mode
 */
function getEvaluationModeDescription(mode) {
  // Map of mode → description for UI display
  const descriptions = {
    [EVALUATION_MODES.PROJECT_MEMBER]:
      "Score individual team members within a project",
    [EVALUATION_MODES.CROSS_PROJECT]: "Compare and rank multiple projects",
    [EVALUATION_MODES.FACULTY]: "Students evaluate faculty members",
    [EVALUATION_MODES.PEER]: "Rank peers within a group",
  };

  return descriptions[mode] || "Unknown evaluation mode";
}

// ============================================================
// MODULE EXPORTS
// ============================================================
module.exports = {
  // Main computation function
  calculatePoolSize,

  // Validation and metadata
  isValidEvaluationMode,
  getEvaluationModeDescription,

  // Constants (exported for tests and configuration)
  EVALUATION_MODES,
  POINTS_PER_MEMBER,
  MIN_TEAM_SIZE,
  MAX_TEAM_SIZE,
  DEFAULT_CROSS_PROJECT_POOL,
  VALID_FACULTY_POOLS,
  DEFAULT_FACULTY_POOL,
  DEFAULT_RANKING_DEPTH,

  // Private helpers exported with underscore prefix for testing
  _calculateProjectMemberPool,
  _calculateCrossProjectPool,
  _calculateFacultyPool,
  _calculatePeerPool,
};
