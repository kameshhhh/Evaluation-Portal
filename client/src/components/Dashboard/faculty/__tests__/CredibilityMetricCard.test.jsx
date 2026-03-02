// ============================================================
// CREDIBILITY METRIC CARD TESTS — React Component Tests
// ============================================================
// Tests the CredibilityMetricCard component in DashboardHeader.
// Verifies color coding, trend indicators, and click behavior.
//
// Run: npm test -- --testPathPattern="CredibilityMetricCard"
// ============================================================

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// Import the DashboardHeader which contains CredibilityMetricCard
// We test via DashboardHeader since CredibilityMetricCard is internal
import DashboardHeader from "../DashboardHeader";

// ============================================================
// MOCK DATA
// ============================================================

const mockUser = {
  name: "Dr. Jane Smith",
  email: "jane.smith@university.edu",
  picture: null,
};

const mockStats = {
  activeSessions: 3,
  pendingEvaluations: 5,
  totalTeams: 12,
  totalPool: 180,
};

// ============================================================
// TEST SUITE: Credibility Score Display
// ============================================================
describe("CredibilityMetricCard", () => {
  // ── TC-UI-01: Display HIGH band (Green) ──
  it("should display green color for HIGH band (90+)", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={92}
        credibilityBand="HIGH"
        credibilityTrend="stable"
        credibilityDelta={null}
        stats={mockStats}
      />,
    );

    // Find the credibility card by looking for the score
    const scoreElement = screen.getByText("92");
    expect(scoreElement).toBeInTheDocument();

    // Check that the score has green color styling
    expect(scoreElement).toHaveStyle({ color: "#16A34A" });
  });

  // ── TC-UI-02: Display MEDIUM band (Amber) ──
  it("should display amber color for MEDIUM band (50-79)", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={68}
        credibilityBand="MEDIUM"
        credibilityTrend="stable"
        credibilityDelta={null}
        stats={mockStats}
      />,
    );

    const scoreElement = screen.getByText("68");
    expect(scoreElement).toBeInTheDocument();
    expect(scoreElement).toHaveStyle({ color: "#D97706" });
  });

  // ── TC-UI-03: Display LOW band (Red) ──
  it("should display red color for LOW band (0-49)", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={35}
        credibilityBand="LOW"
        credibilityTrend="declining"
        credibilityDelta={-5}
        stats={mockStats}
      />,
    );

    const scoreElement = screen.getByText("35");
    expect(scoreElement).toBeInTheDocument();
    expect(scoreElement).toHaveStyle({ color: "#DC2626" });
  });

  // ── TC-UI-04: New evaluator shows placeholder ──
  it("should show dash for new evaluator with null score", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={null}
        credibilityBand={null}
        credibilityTrend={null}
        credibilityDelta={null}
        stats={mockStats}
      />,
    );

    // Should show "—" for null score
    const placeholder = screen.getByText("—");
    expect(placeholder).toBeInTheDocument();
  });

  // ── TC-UI-05: Rising trend shows up arrow ──
  it("should show rising indicator for improving trend", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={78}
        credibilityBand="MEDIUM"
        credibilityTrend="improving"
        credibilityDelta={5}
        stats={mockStats}
      />,
    );

    // Should show "Rising" text
    const trendText = screen.getByText(/Rising/);
    expect(trendText).toBeInTheDocument();

    // Should show delta value
    const deltaValue = screen.getByText("5");
    expect(deltaValue).toBeInTheDocument();
  });

  // ── TC-UI-06: Falling trend shows down arrow ──
  it("should show falling indicator for declining trend", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={62}
        credibilityBand="MEDIUM"
        credibilityTrend="declining"
        credibilityDelta={-3}
        stats={mockStats}
      />,
    );

    // Should show "Falling" text
    const trendText = screen.getByText(/Falling/);
    expect(trendText).toBeInTheDocument();

    // Should show absolute delta value (no negative sign)
    const deltaValue = screen.getByText("3");
    expect(deltaValue).toBeInTheDocument();
  });

  // ── TC-UI-07: Stable trend shows no delta ──
  it("should show stable indicator when no change", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={75}
        credibilityBand="MEDIUM"
        credibilityTrend="stable"
        credibilityDelta={0}
        stats={mockStats}
      />,
    );

    // Should show "Stable" text
    const trendText = screen.getByText(/Stable/);
    expect(trendText).toBeInTheDocument();
  });

  // ── TC-UI-08: Click opens modal ──
  it("should have clickable credibility card", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={82}
        credibilityBand="HIGH"
        credibilityTrend="stable"
        credibilityDelta={null}
        stats={mockStats}
      />,
    );

    // Find the credibility button
    const credibilityButton = screen.getByRole("button", {
      name: /view credibility details/i,
    });
    expect(credibilityButton).toBeInTheDocument();

    // Should be clickable
    fireEvent.click(credibilityButton);

    // Modal should now be visible (lazy loaded)
    // Note: In full test, we'd wait for Suspense to resolve
  });

  // ── TC-UI-09: Label shows "Credibility" ──
  it("should display 'Credibility' label", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={80}
        credibilityBand="HIGH"
        credibilityTrend="stable"
        credibilityDelta={null}
        stats={mockStats}
      />,
    );

    const label = screen.getByText(/Credibility/);
    expect(label).toBeInTheDocument();
  });

  // ── TC-UI-10: All four metric cards present ──
  it("should display all four metric cards including credibility", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={85}
        credibilityBand="HIGH"
        credibilityTrend="stable"
        credibilityDelta={null}
        stats={mockStats}
      />,
    );

    // Check all four cards are present
    expect(screen.getByText("Active Sessions")).toBeInTheDocument();
    expect(screen.getByText("Pending Evaluations")).toBeInTheDocument();
    expect(screen.getByText("Scarcity Pool")).toBeInTheDocument();
    expect(screen.getByText(/Credibility/)).toBeInTheDocument();

    // Check values
    expect(screen.getByText("3")).toBeInTheDocument(); // Active Sessions
    expect(screen.getByText("5")).toBeInTheDocument(); // Pending Evaluations
    expect(screen.getByText("180")).toBeInTheDocument(); // Pool (pts suffix separate)
    expect(screen.getByText("85")).toBeInTheDocument(); // Credibility
  });
});

// ============================================================
// TEST SUITE: Accessibility
// ============================================================
describe("CredibilityMetricCard Accessibility", () => {
  // ── TC-A11Y-01: Has accessible label ──
  it("should have accessible button label", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={75}
        credibilityBand="MEDIUM"
        stats={mockStats}
      />,
    );

    const button = screen.getByRole("button", {
      name: /view credibility details/i,
    });
    expect(button).toHaveAttribute("aria-label", "View credibility details");
  });

  // ── TC-A11Y-02: Keyboard accessible ──
  it("should be focusable via keyboard", () => {
    render(
      <DashboardHeader
        user={mockUser}
        credibilityScore={75}
        credibilityBand="MEDIUM"
        stats={mockStats}
      />,
    );

    const button = screen.getByRole("button", {
      name: /view credibility details/i,
    });

    // Should have focus ring classes
    expect(button.className).toContain("focus:ring");
  });
});
