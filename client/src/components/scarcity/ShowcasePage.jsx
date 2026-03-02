// ============================================================
// SHOWCASE PAGE — Standalone Presentation of Platform Intelligence
// ============================================================
// A dedicated route that demonstrates the credibility-weighting
// system's capabilities in a visually impressive, self-contained
// page. Designed for stakeholder demos, faculty onboarding, and
// "wow-factor" presentations.
//
// SECTIONS:
//   1. Hero — Gradient banner introducing the concept
//   2. Interactive Demo — Hands-on slider experience (no real data)
//   3. Live Results Showcase — Real data if sessionId is provided
//   4. Report Generator — PDF export capability
//
// ROUTES: /showcase/:sessionId (with real data)
//         /showcase (demo-only mode, no backend call)
//
// ARCHITECTURE: Composes all showcase sub-components.
//   - With sessionId: fetches real data from weighted-results API
//   - Without sessionId: shows only the interactive demo
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

// Showcase components
import CredibilityHero from "./showcase/CredibilityHero";
import ComparisonDashboard from "./showcase/ComparisonDashboard";
import InteractiveDemo from "./showcase/InteractiveDemo";
import ProfessionalReport from "./showcase/ProfessionalReport";

// API
import { getWeightedSessionResults } from "../../services/scarcityApi";

// Icons
import {
  ArrowLeft,
  Sparkles,
  BarChart3,
  SlidersHorizontal,
  FileText,
  Loader2,
  AlertCircle,
  Shield,
  ExternalLink,
  ChevronDown,
} from "lucide-react";

import { ROUTES } from "../../utils/constants";

// ============================================================
// SECTION NAVIGATION BUTTON
// ============================================================
const SectionButton = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
      active
        ? "bg-white text-blue-700 shadow-md border border-blue-200/50 scale-105"
        : "text-gray-600 hover:text-blue-600 hover:bg-white/60"
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

// ============================================================
// MAIN COMPONENT: ShowcasePage
// ============================================================
const ShowcasePage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const chartRef = useRef(null);

  // ── State ──────────────────────────────────────
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!sessionId);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState("demo"); // "hero" | "demo" | "charts" | "report"

  // Section refs for smooth scrolling
  const heroRef = useRef(null);
  const demoRef = useRef(null);
  const chartsRef = useRef(null);
  const reportRef = useRef(null);

  const sectionRefs = {
    hero: heroRef,
    demo: demoRef,
    charts: chartsRef,
    report: reportRef,
  };

  // ── Data fetch (only when sessionId is present) ──
  const loadData = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      setError(null);
      const resp = await getWeightedSessionResults(sessionId, "detailed");
      setData(resp.data || resp);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to load session data",
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) loadData();
  }, [sessionId, loadData]);

  // ── Section navigation ─────────────────────────
  const scrollToSection = (sectionKey) => {
    setActiveSection(sectionKey);
    sectionRefs[sectionKey]?.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  // ── Derived data ───────────────────────────────
  const hasData = data && data.person_results && data.person_results.length > 0;
  const session = data?.session;
  const summary = data?.summary;
  const personResults = data?.person_results;
  const evaluatorAnalysis = data?.evaluator_analysis;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* ════════════════════════════════════════════════════ */}
      {/* TOP BAR — Navigation + context                       */}
      {/* ════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
            {/* Left: Back + title */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Credibility Intelligence Showcase
                </h1>
                {sessionId && (
                  <p className="text-[11px] text-gray-400">
                    Session: {sessionId.substring(0, 8)}...
                  </p>
                )}
              </div>
            </div>

            {/* Right: Section nav */}
            <div className="hidden sm:flex items-center gap-1 bg-gray-100/80 rounded-xl p-1">
              {hasData && (
                <SectionButton
                  icon={Shield}
                  label="Impact"
                  active={activeSection === "hero"}
                  onClick={() => scrollToSection("hero")}
                />
              )}
              <SectionButton
                icon={SlidersHorizontal}
                label="Demo"
                active={activeSection === "demo"}
                onClick={() => scrollToSection("demo")}
              />
              {hasData && (
                <>
                  <SectionButton
                    icon={BarChart3}
                    label="Charts"
                    active={activeSection === "charts"}
                    onClick={() => scrollToSection("charts")}
                  />
                  <SectionButton
                    icon={FileText}
                    label="Report"
                    active={activeSection === "report"}
                    onClick={() => scrollToSection("report")}
                  />
                </>
              )}
            </div>

            {/* Link to full dashboard */}
            {sessionId && (
              <Link
                to={ROUTES.WEIGHTED_RESULTS.replace(":sessionId", sessionId)}
                className="hidden lg:flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                Full Dashboard
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════ */}
      {/* LOADING STATE                                         */}
      {/* ════════════════════════════════════════════════════ */}
      {loading && (
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto" />
            <p className="mt-4 text-sm text-gray-500">
              Loading showcase data...
            </p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════ */}
      {/* ERROR STATE                                           */}
      {/* ════════════════════════════════════════════════════ */}
      {error && (
        <div className="max-w-2xl mx-auto px-4 pt-12">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-center gap-3 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">Error Loading Session</p>
                <p className="text-xs mt-1">{error}</p>
              </div>
            </div>
            <button
              onClick={loadData}
              className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════ */}
      {/* MAIN CONTENT                                          */}
      {/* ════════════════════════════════════════════════════ */}
      {!loading && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
          {/* ── GRADIENT HERO INTRO (always shown) ────────── */}
          {!hasData && !sessionId && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-xl mb-6">
                <Sparkles className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
                Credibility-Weighted Evaluation
              </h2>
              <p className="text-gray-500 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
                Explore how evaluator credibility transforms raw scores into
                fairer, more accurate results. Try the interactive demo below.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => scrollToSection("demo")}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl
                             font-semibold text-sm shadow-lg hover:shadow-xl hover:bg-blue-700 transition-all"
                >
                  Try the Demo
                  <ChevronDown className="h-4 w-4 animate-bounce" />
                </button>
              </div>
            </div>
          )}

          {/* ── CREDIBILITY HERO (real data only) ─────────── */}
          {hasData && (
            <section ref={heroRef}>
              <CredibilityHero
                summary={summary}
                personResults={personResults}
                evaluatorAnalysis={evaluatorAnalysis}
                poolSize={session?.pool_size}
              />
            </section>
          )}

          {/* ── INTERACTIVE DEMO (always shown) ──────────── */}
          <section ref={demoRef}>
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-purple-600" />
                Interactive Credibility Demo
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Adjust evaluator credibility sliders to see how weighting
                affects the final score in real time
              </p>
            </div>
            <InteractiveDemo />
          </section>

          {/* ── CHART.JS COMPARISON (real data only) ──────── */}
          {hasData && (
            <section ref={chartsRef}>
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  Visual Score Comparison
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Chart.js-powered grouped bar chart — raw vs weighted scores
                  per person
                </p>
              </div>
              <div ref={chartRef}>
                <ComparisonDashboard
                  personResults={personResults}
                  poolSize={session?.pool_size}
                />
              </div>
            </section>
          )}

          {/* ── PROFESSIONAL REPORT (real data only) ──────── */}
          {hasData && (
            <section ref={reportRef}>
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-600" />
                  Report Generator
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Download a complete PDF report with all data and analysis
                </p>
              </div>
              <ProfessionalReport
                session={session}
                summary={summary}
                personResults={personResults}
                evaluatorAnalysis={evaluatorAnalysis}
                chartContainerRef={chartRef}
              />
            </section>
          )}

          {/* ── FOOTER ────────────────────────────────────── */}
          <div className="border-t border-gray-200/50 pt-6 text-center">
            <p className="text-xs text-gray-400 flex items-center justify-center gap-1.5">
              <Shield className="h-3 w-3" />
              Credibility-Weighted Evaluation Engine · Scarcity-Based Peer
              Assessment
            </p>
            {sessionId && (
              <div className="mt-3">
                <Link
                  to={ROUTES.WEIGHTED_RESULTS.replace(":sessionId", sessionId)}
                  className="text-xs text-blue-500 hover:text-blue-700 transition-colors inline-flex items-center gap-1"
                >
                  View Full Results Dashboard
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShowcasePage;
