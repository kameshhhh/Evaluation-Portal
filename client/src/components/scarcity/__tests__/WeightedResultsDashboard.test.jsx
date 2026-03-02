// ============================================================
// WEIGHTED RESULTS DASHBOARD — Component Rendering Tests
// ============================================================
// Tests that the WeightedResultsDashboard and its sub-components
// render correctly given various data states.
//
// Run: npx react-scripts test --testPathPattern=WeightedResultsDashboard
// ============================================================

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@testing-library/jest-dom";

// Mock the API module before importing the component
jest.mock("../../../services/scarcityApi", () => ({
  getWeightedSessionResults: jest.fn(),
}));

import WeightedResultsDashboard from "../WeightedResultsDashboard";
import { getWeightedSessionResults } from "../../../services/scarcityApi";

// ============================================================
// MOCK DATA
// ============================================================
const mockSuccessResponse = {
  data: {
    session: {
      session_id: "session-001",
      title: "Test Evaluation",
      status: "aggregated",
      pool_size: 100,
    },
    summary: {
      total_persons: 2,
      total_evaluators: 3,
      avg_credibility_impact: 0.05,
      consensus_level: 0.78,
      max_rank_change: 1,
    },
    person_results: [
      {
        target_id: "person-001",
        person_name: "Alice",
        weighted_mean: 45.5,
        raw_mean: 42.0,
        credibility_impact: 0.083,
        std_dev: 5.2,
        evaluator_count: 3,
        weighted_rank: 1,
        raw_rank: 1,
        rank_change: 0,
        evaluator_scores: [],
      },
      {
        target_id: "person-002",
        person_name: "Bob",
        weighted_mean: 38.2,
        raw_mean: 40.0,
        credibility_impact: -0.045,
        std_dev: 3.1,
        evaluator_count: 3,
        weighted_rank: 2,
        raw_rank: 2,
        rank_change: 0,
        evaluator_scores: [],
      },
    ],
    evaluator_analysis: [],
    visualization_data: {
      impact_chart: [],
      credibility_distribution: [],
      score_distributions: {},
    },
    has_weighted_data: true,
  },
};

const mockEmptyResponse = {
  data: {
    session: {
      session_id: "session-001",
      title: "Test Evaluation",
    },
    summary: { total_persons: 0, total_evaluators: 0 },
    person_results: [],
    has_weighted_data: false,
  },
};

// ============================================================
// HELPER — Render component wrapped in Router
// ============================================================
const renderWithRouter = (sessionId = "session-001") => {
  return render(
    <MemoryRouter initialEntries={[`/scarcity/weighted-results/${sessionId}`]}>
      <Routes>
        <Route
          path="/scarcity/weighted-results/:sessionId"
          element={<WeightedResultsDashboard />}
        />
      </Routes>
    </MemoryRouter>,
  );
};

// ============================================================
// TESTS
// ============================================================
describe("WeightedResultsDashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────
  // LOADING STATE
  // ──────────────────────────────────────────────
  it("should show loading spinner on mount", () => {
    getWeightedSessionResults.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRouter();
    expect(screen.getByText(/loading weighted results/i)).toBeInTheDocument();
  });

  // ──────────────────────────────────────────────
  // SUCCESSFUL DATA LOAD
  // ──────────────────────────────────────────────
  it("should render dashboard with data on successful load", async () => {
    getWeightedSessionResults.mockResolvedValue(mockSuccessResponse);
    renderWithRouter();

    await waitFor(() => {
      expect(
        screen.getByText(/credibility-weighted results/i),
      ).toBeInTheDocument();
    });

    // Summary cards should be present
    expect(screen.getByText("2")).toBeInTheDocument(); // total persons
  });

  // ──────────────────────────────────────────────
  // EMPTY STATE
  // ──────────────────────────────────────────────
  it("should show empty state when no weighted data exists", async () => {
    getWeightedSessionResults.mockResolvedValue(mockEmptyResponse);
    renderWithRouter();

    await waitFor(() => {
      expect(
        screen.getByText(/no weighted results available/i),
      ).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────
  // ERROR STATE
  // ──────────────────────────────────────────────
  it("should show error message when API call fails", async () => {
    getWeightedSessionResults.mockRejectedValue(new Error("Network error"));
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
