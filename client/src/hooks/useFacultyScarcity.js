// ============================================================
// FACULTY SCARCITY HOOK
// ============================================================
// SRS §4.4.1 — Real-time scarcity validation for faculty evaluation.
// Provides pool configuration, allocation validation, and scarcity
// education content. Works with ScarcityAllocator component.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  validateFacultyAllocation,
  getScarcityEducation,
} from "../services/facultyEvaluationApi";

const TIER_CONFIG = {
  binary: {
    tiers: ["selected", "unranked"],
    points: { selected: 1, unranked: 0 },
    budgetFormula: (count) => Math.max(1, Math.floor(count * 0.3)),
  },
  small_pool: {
    tiers: ["tier1", "tier2", "tier3", "unranked"],
    points: { tier1: 3, tier2: 2, tier3: 1, unranked: 0 },
    budgetFormula: (count) => Math.max(3, Math.floor(count * 1.5)),
  },
  full_pool: {
    tiers: ["tier1", "tier2", "tier3", "unranked"],
    points: { tier1: 4, tier2: 2, tier3: 1, unranked: 0 },
    budgetFormula: () => 10,
  },
};

/**
 * @description Real-time scarcity validation hook for faculty evaluation
 * @param {string} scoringMode - 'binary' | 'small_pool' | 'full_pool'
 * @param {number} facultyCount - Number of eligible faculty
 * @param {boolean} allowAssignAll - Whether all-assign is permitted
 * @returns {Object} Pool config, validation state, education content
 */
export default function useFacultyScarcity(
  scoringMode = "small_pool",
  facultyCount = 0,
  allowAssignAll = false,
) {
  const [validation, setValidation] = useState({
    isValid: true,
    errors: [],
    warnings: [],
    totalPoints: 0,
    budget: 0,
    remainingPoints: 0,
    status: "incomplete",
    isComplete: false,
  });
  const [education, setEducation] = useState(null);
  const [educationLoading, setEducationLoading] = useState(false);
  const validationTimeoutRef = useRef(null);

  // Calculate pool configuration locally (mirrors backend FacultyScarcityService)
  const poolConfig = useCallback(() => {
    const config = TIER_CONFIG[scoringMode];
    if (!config) return null;

    const budget = config.budgetFormula(facultyCount);
    const tierPoints = config.points;
    const maxPerFaculty = Math.max(...Object.values(tierPoints));
    const maxAssignable = allowAssignAll
      ? facultyCount
      : Math.max(1, facultyCount - 1);

    return {
      scoringMode,
      budget,
      tiers: config.tiers,
      tierPoints,
      maxPerFaculty,
      minPerFaculty: 0,
      facultyCount,
      maxAssignable,
      allowAssignAll,
    };
  }, [scoringMode, facultyCount, allowAssignAll]);

  // Debounced server-side validation
  const validateAllocations = useCallback(
    (allocations) => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }

      validationTimeoutRef.current = setTimeout(async () => {
        if (!allocations || allocations.length === 0) {
          const config = poolConfig();
          setValidation({
            isValid: true,
            errors: [],
            warnings: [],
            totalPoints: 0,
            budget: config?.budget || 0,
            remainingPoints: config?.budget || 0,
            status: "incomplete",
            isComplete: false,
          });
          return;
        }

        try {
          const result = await validateFacultyAllocation({
            allocations,
            scoringMode,
            facultyCount,
            allowAssignAll,
          });

          if (result.success) {
            setValidation(result.data);
          }
        } catch (err) {
          // Fall back to local validation on network error
          const config = poolConfig();
          if (config) {
            const totalPoints = allocations.reduce(
              (sum, a) => sum + (config.tierPoints[a.tier] || 0),
              0,
            );
            const assignedCount = allocations.filter(
              (a) => a.tier !== "unranked",
            ).length;

            setValidation({
              isValid: totalPoints <= config.budget,
              errors:
                totalPoints > config.budget
                  ? [
                      `Budget exceeded: ${totalPoints}/${config.budget} points used`,
                    ]
                  : [],
              warnings:
                !allowAssignAll && assignedCount >= facultyCount
                  ? ["Cannot assign points to all faculty members"]
                  : [],
              totalPoints,
              budget: config.budget,
              remainingPoints: config.budget - totalPoints,
              status: totalPoints === config.budget ? "complete" : "incomplete",
              isComplete: totalPoints === config.budget,
            });
          }
        }
      }, 300);
    },
    [scoringMode, facultyCount, allowAssignAll, poolConfig],
  );

  // Load scarcity education content
  const loadEducation = useCallback(async () => {
    if (education) return;
    setEducationLoading(true);
    try {
      const result = await getScarcityEducation();
      if (result.success) {
        setEducation(result.data);
      }
    } catch {
      // Non-critical — education is supplementary
    } finally {
      setEducationLoading(false);
    }
  }, [education]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  return {
    poolConfig: poolConfig(),
    validation,
    validateAllocations,
    education,
    educationLoading,
    loadEducation,
    TIER_CONFIG,
  };
}
