// ============================================================
// APP.JSX — Root Application Component
// ============================================================
// The top-level React component that composes the full application.
// Sets up routing, authentication context, and error boundaries.
// Mobile-first with bottom navigation and hidden debug drawer.
// ============================================================

import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { SocketProvider } from "./contexts/SocketContext";
import ErrorBoundary from "./components/Common/ErrorBoundary";
import LoginPage from "./components/Login/LoginPage";
import SetupScopePage from "./components/Scope/SetupScopePage";
import DashboardRouter from "./components/Dashboard/DashboardRouter";
import ScarcityEvaluationPage from "./components/scarcity/ScarcityEvaluationPage";
import SessionStatusDashboard from "./components/scarcity/SessionStatusDashboard";
import ResultsDisplay from "./components/scarcity/ResultsDisplay";
import WeightedResultsDashboard from "./components/scarcity/WeightedResultsDashboard";
import ShowcasePage from "./components/scarcity/ShowcasePage";
import CreateSessionForm from "./components/scarcity/CreateSessionForm";
import StudentResultsView from "./components/scarcity/StudentResultsView";
import CredibilityBandsOverview from "./components/credibility/CredibilityBandsOverview";
import AnalyticsDashboard from "./components/scarcity/analytics/AnalyticsDashboard";
import EnhancedProjectDashboard from "./components/projects/EnhancedProjectDashboard";
import CreateProjectPage from "./components/projects/CreateProjectPage";
import ProjectListPage from "./components/projects/ProjectListPage";
import FacultyEvaluationPage from "./components/faculty-evaluation/FacultyEvaluationPage";
import StudentEvaluationDashboard from "./components/faculty-evaluation/StudentEvaluationDashboard";
import FacultyResultsDashboard from "./components/faculty-evaluation/FacultyResultsDashboard";
import NormalizationConfig from "./components/faculty-evaluation/NormalizationConfig";
import WhatIfSimulatorPage from "./components/faculty-evaluation/WhatIfSimulatorPage";
import NormalizationBreakdownPage from "./components/faculty-evaluation/NormalizationBreakdownPage";
import PeerRankingSurveyPage from "./components/peer-ranking/PeerRankingSurveyPage";
import ComparativeEvaluationPage from "./components/comparative/ComparativeEvaluationPage";
import AdminRoundManager from "./components/comparative/AdminRoundManager";
import ZeroScoreAnalyticsPage from "./components/analytics/ZeroScoreAnalyticsPage";
import TeamFormationPage from "./components/Dashboard/student/TeamFormationPage";
import SessionPlannerPage from "./components/Dashboard/SessionPlannerPage";
import SessionPlannerListPage from "./components/Dashboard/SessionPlannerListPage";
import SessionDetailPage from "./components/Dashboard/SessionDetailPage";
import Navbar from "./components/Layout/Navbar";
import BottomNavigation from "./components/Layout/BottomNavigation";
import DebugDrawer from "./components/Layout/DebugDrawer";
import ProtectedRoute from "./components/Layout/ProtectedRoute";
import { ROUTES } from "./utils/constants";

/**
 * App component — the root of the React component tree.
 * Wraps the entire application in:
 * 1. ErrorBoundary — catches unhandled errors
 * 2. AuthProvider — provides authentication context to all children
 * 3. Router — enables client-side routing
 */
const App = () => {
  return (
    // ErrorBoundary — last line of defense against crashes
    <ErrorBoundary>
      {/* Router — enables declarative client-side routing */}
      <Router>
        {/* AuthProvider — makes auth state available via useAuth() */}
        <AuthProvider>
          {/* SocketProvider — real-time WebSocket connection */}
          <SocketProvider>
            {/* Application shell — Premium Violet Glassmorphism */}
            <div className="min-h-screen bg-white relative">
              {/* Subtle violet gradient overlay - barely perceptible */}
              <div
                className="fixed inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(139, 92, 246, 0.005) 0%, transparent 50%, rgba(139, 92, 246, 0.003) 100%)",
                }}
              />

              {/* Navbar — persistent top navigation */}
              <Navbar />

              {/* Main content area — bottom padding for mobile nav */}
              <main className="relative pb-20 sm:pb-0">
                {/* Route definitions */}
                <Routes>
                  {/* Public route — Login page */}
                  <Route path={ROUTES.LOGIN} element={<LoginPage />} />

                  {/* Protected route — Dashboard (requires authentication) */}
                  <Route
                    path={ROUTES.DASHBOARD}
                    element={
                      <ProtectedRoute>
                        <DashboardRouter />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Scope Setup (Faculty) */}
                  <Route
                    path={ROUTES.SCOPE_SETUP}
                    element={
                      <ProtectedRoute>
                        <SetupScopePage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Scarcity Evaluation Page */}
                  <Route
                    path={ROUTES.SCARCITY_EVALUATION}
                    element={
                      <ProtectedRoute>
                        <ScarcityEvaluationPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Scarcity Results Display */}
                  <Route
                    path={ROUTES.SCARCITY_RESULTS}
                    element={
                      <ProtectedRoute>
                        <ResultsDisplay />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Credibility-Weighted Results (Step 5) */}
                  <Route
                    path={ROUTES.WEIGHTED_RESULTS}
                    element={
                      <ProtectedRoute>
                        <WeightedResultsDashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Showcase Presentation Page (Step 5 — Part 4.5) */}
                  <Route
                    path={ROUTES.SHOWCASE}
                    element={
                      <ProtectedRoute>
                        <ShowcasePage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Session Status Dashboard */}
                  <Route
                    path={ROUTES.SESSION_STATUS}
                    element={
                      <ProtectedRoute>
                        <SessionStatusDashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Create Evaluation Session */}
                  <Route
                    path={ROUTES.CREATE_SESSION}
                    element={
                      <ProtectedRoute>
                        <CreateSessionForm />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Student Results View */}
                  <Route
                    path={ROUTES.MY_RESULTS}
                    element={
                      <ProtectedRoute>
                        <StudentResultsView />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Credibility Bands Overview (admin only, SRS 7.2) */}
                  <Route
                    path={ROUTES.ADMIN_CREDIBILITY}
                    element={
                      <ProtectedRoute>
                        <CredibilityBandsOverview />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — SRS Analytics Dashboard (Sections 6, 6.2, 7, 4.4.3, 4.5.3) */}
                  <Route
                    path={ROUTES.ANALYTICS}
                    element={
                      <ProtectedRoute>
                        <AnalyticsDashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Enhanced Project Dashboard (SRS 4.1.1, 4.1.2 + GitHub-Lite) */}
                  <Route
                    path={ROUTES.PROJECT_DASHBOARD}
                    element={
                      <ProtectedRoute>
                        <EnhancedProjectDashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Create New Project */}
                  <Route
                    path={ROUTES.CREATE_PROJECT}
                    element={
                      <ProtectedRoute>
                        <CreateProjectPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Project List */}
                  <Route
                    path={ROUTES.PROJECT_LIST}
                    element={
                      <ProtectedRoute>
                        <ProjectListPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Faculty Evaluation (SRS §4.4) */}
                  {/* Students evaluate faculty — NOT for faculty users */}
                  <Route
                    path={ROUTES.FACULTY_EVALUATION_DASHBOARD}
                    element={
                      <ProtectedRoute requiredRole="student">
                        <StudentEvaluationDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={ROUTES.FACULTY_EVALUATION}
                    element={
                      <ProtectedRoute requiredRole="student">
                        <FacultyEvaluationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={ROUTES.FACULTY_EVALUATION_SESSION}
                    element={
                      <ProtectedRoute requiredRole="student">
                        <FacultyEvaluationPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Faculty Results Dashboard (SRS §4.4.3) */}
                  <Route
                    path={ROUTES.FACULTY_RESULTS}
                    element={
                      <ProtectedRoute>
                        <FacultyResultsDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={ROUTES.FACULTY_RESULTS_SESSION}
                    element={
                      <ProtectedRoute>
                        <FacultyResultsDashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* Admin Faculty Results (SRS §4.4.3) */}
                  <Route
                    path={ROUTES.ADMIN_FACULTY_RESULTS}
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <FacultyResultsDashboard isAdmin />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={ROUTES.ADMIN_FACULTY_RESULTS_SESSION}
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <FacultyResultsDashboard isAdmin />
                      </ProtectedRoute>
                    }
                  />

                  {/* Admin Normalization Config (SRS §4.4.3) */}
                  <Route
                    path={ROUTES.ADMIN_NORMALIZATION}
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <NormalizationConfig />
                      </ProtectedRoute>
                    }
                  />

                  {/* What-If Simulator — SRS §4.4.3 B-02 */}
                  <Route
                    path={ROUTES.WHAT_IF_SIMULATOR}
                    element={
                      <ProtectedRoute>
                        <WhatIfSimulatorPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={ROUTES.WHAT_IF_SIMULATOR_BASE}
                    element={
                      <ProtectedRoute>
                        <WhatIfSimulatorPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Normalization Breakdown — SRS §4.4.3 B-02 */}
                  <Route
                    path={ROUTES.NORMALIZATION_BREAKDOWN}
                    element={
                      <ProtectedRoute>
                        <NormalizationBreakdownPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={ROUTES.NORMALIZATION_BREAKDOWN_BASE}
                    element={
                      <ProtectedRoute>
                        <NormalizationBreakdownPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Peer Ranking Survey (SRS §4.5) */}
                  <Route
                    path={ROUTES.PEER_RANKING}
                    element={
                      <ProtectedRoute>
                        <PeerRankingSurveyPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={ROUTES.PEER_RANKING_SURVEY}
                    element={
                      <ProtectedRoute>
                        <PeerRankingSurveyPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Comparative Evaluation (SRS §4.3) */}
                  <Route
                    path={ROUTES.COMPARATIVE_ADMIN}
                    element={
                      <ProtectedRoute>
                        <AdminRoundManager />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={ROUTES.COMPARATIVE_SESSION}
                    element={
                      <ProtectedRoute>
                        <ComparativeEvaluationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={ROUTES.COMPARATIVE}
                    element={
                      <ProtectedRoute>
                        <ComparativeEvaluationPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Zero-Score Analytics (SRS §4.1.5, §5.3) */}
                  <Route
                    path={ROUTES.ZERO_SCORE_ANALYTICS}
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <ZeroScoreAnalyticsPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Team Formation (students) */}
                  <Route
                    path={ROUTES.TEAM_FORMATION}
                    element={
                      <ProtectedRoute requiredRole="student">
                        <TeamFormationPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Session Planner List (admin + faculty) */}
                  <Route
                    path={ROUTES.SESSION_PLANNER_BASE}
                    element={
                      <ProtectedRoute>
                        <SessionPlannerListPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Session Detail View (faculty full-page) */}
                  <Route
                    path={ROUTES.SESSION_PLANNER_DETAIL}
                    element={
                      <ProtectedRoute>
                        <SessionDetailPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected route — Session Planner Detail (admin + faculty) */}
                  <Route
                    path={ROUTES.SESSION_PLANNER}
                    element={
                      <ProtectedRoute>
                        <SessionPlannerPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Default redirect — send root to login */}
                  <Route
                    path="/"
                    element={<Navigate to={ROUTES.LOGIN} replace />}
                  />

                  {/* Catch-all — redirect unknown routes to login */}
                  <Route
                    path="*"
                    element={<Navigate to={ROUTES.LOGIN} replace />}
                  />
                </Routes>
              </main>

              {/* Mobile bottom navigation — hidden on desktop */}
              <BottomNavigation />

              {/* Debug drawer — console logs, hidden by default */}
              <DebugDrawer />
            </div>
          </SocketProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
