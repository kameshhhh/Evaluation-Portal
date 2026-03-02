// ============================================================
// ANALYTICS DASHBOARD PAGE — Unified SRS Analytics View
// ============================================================
// Top-level page component that aggregates all analytics panels:
//   1. Growth Trajectory Chart (SRS §6)
//   2. Person Vector Display (SRS §7)
//   3. Peer Ranking Panel (SRS §4.5.3)
//   4. Intent Selector (SRS §6.2)
//
// ROUTE: /scarcity/analytics/:personId
//
// Access: Faculty/Admin only (students see simplified versions)
//
// DOES NOT modify any existing pages or routes.
// ============================================================

import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Activity, User, Target } from "lucide-react";

import GrowthTrajectoryChart from "./GrowthTrajectoryChart";
import PersonVectorDisplay from "./PersonVectorDisplay";
import IntentSelector from "./IntentSelector";

// ============================================================
// AnalyticsDashboard Component
// ============================================================
const AnalyticsDashboard = () => {
  const { personId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  // Tab configuration
  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "growth", label: "Growth", icon: Activity },
    { id: "vector", label: "Person Vector", icon: User },
    { id: "intent", label: "Intent Analysis", icon: Target },
  ];

  // If no personId, show a selection prompt
  if (!personId) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <BarChart3 className="w-12 h-12 text-indigo-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              SRS Analytics Dashboard
            </h2>
            <p className="text-sm text-gray-500">
              Select a person from the evaluation results to view their
              analytics.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  SRS Analytics
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  Comprehensive evaluation analytics — Sections 4.4.3, 4.5.3, 6,
                  6.2, 7
                </p>
              </div>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1 mt-4 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="max-w-7xl mx-auto p-6">
        {/* OVERVIEW TAB — Shows all panels in grid */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GrowthTrajectoryChart personId={personId} />
            <PersonVectorDisplay personId={personId} />
            <div className="lg:col-span-2">
              <IntentSelector targetId={personId} />
            </div>
          </div>
        )}

        {/* GROWTH TAB — Full growth trajectory */}
        {activeTab === "growth" && (
          <div className="max-w-3xl mx-auto">
            <GrowthTrajectoryChart personId={personId} />
          </div>
        )}

        {/* VECTOR TAB — Full person vector display */}
        {activeTab === "vector" && (
          <div className="max-w-3xl mx-auto">
            <PersonVectorDisplay personId={personId} />
          </div>
        )}

        {/* INTENT TAB — Intent-aware evaluation */}
        {activeTab === "intent" && (
          <div className="max-w-3xl mx-auto">
            <IntentSelector targetId={personId} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
