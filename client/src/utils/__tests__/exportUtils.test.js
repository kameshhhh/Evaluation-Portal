// ============================================================
// EXPORT UTILS TESTS — Unit Tests
// ============================================================
// Tests the CSV/JSON export utility functions.
//
// Run: npx react-scripts test --testPathPattern=exportUtils
// ============================================================

import {
  exportWeightedResultsToCSV,
  exportWeightedResultsToJSON,
} from "../exportUtils";

// ── Mock browser download APIs ──────────────
const mockCreateObjectURL = jest.fn(() => "blob:mock-url");
const mockRevokeObjectURL = jest.fn();
const mockClick = jest.fn();
const mockAppendChild = jest.fn();
const mockRemoveChild = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;
  document.createElement = jest.fn(() => ({
    click: mockClick,
    set href(v) {
      this._href = v;
    },
    set download(v) {
      this._download = v;
    },
  }));
  document.body.appendChild = mockAppendChild;
  document.body.removeChild = mockRemoveChild;
});

// ── Test data ───────────────────────────────
const mockData = {
  session: { session_id: "session-001", name: "Test Session" },
  summary: { avg_credibility_impact: 0.05 },
  person_results: [
    {
      person_name: "Alice",
      target_id: "p-001",
      weighted_mean: 45.5,
      raw_mean: 42.0,
      credibility_impact: 0.083,
      std_dev: 5.2,
      evaluator_count: 3,
      weighted_rank: 1,
      raw_rank: 1,
      rank_change: 0,
    },
    {
      person_name: "Bob",
      target_id: "p-002",
      weighted_mean: 38.2,
      raw_mean: 40.0,
      credibility_impact: -0.045,
      std_dev: 3.1,
      evaluator_count: 3,
      weighted_rank: 2,
      raw_rank: 2,
      rank_change: 0,
    },
  ],
};

describe("exportUtils", () => {
  describe("exportWeightedResultsToCSV", () => {
    it("should trigger a file download", () => {
      exportWeightedResultsToCSV(mockData, "session-001");
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it("should not throw when data is null", () => {
      expect(() => exportWeightedResultsToCSV(null, "s")).not.toThrow();
      expect(mockClick).not.toHaveBeenCalled();
    });

    it("should not throw when person_results is empty", () => {
      expect(() =>
        exportWeightedResultsToCSV({ person_results: [] }, "s"),
      ).not.toThrow();
    });
  });

  describe("exportWeightedResultsToJSON", () => {
    it("should trigger a file download", () => {
      exportWeightedResultsToJSON(mockData, "session-001");
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      expect(mockClick).toHaveBeenCalledTimes(1);
    });

    it("should not throw when data is null", () => {
      expect(() => exportWeightedResultsToJSON(null, "s")).not.toThrow();
      expect(mockClick).not.toHaveBeenCalled();
    });
  });
});
