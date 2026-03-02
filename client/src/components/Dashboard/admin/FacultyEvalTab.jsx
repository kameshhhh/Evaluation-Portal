// ============================================================
// FACULTY EVAL TAB — Admin Faculty Evaluation Analytics Tab
// ============================================================
// SRS §4.4.3 — Tab inside AdminDashboard showing:
//   1. Normalization weights configuration
//   2. Faculty results + normalized scores
//   3. Quick links to full analytics pages
// ============================================================

import React from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, BarChart3, Sliders } from "lucide-react";
import NormalizationConfig from "../../faculty-evaluation/NormalizationConfig";
import { ROUTES } from "../../../utils/constants";

const FacultyEvalTab = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Quick action links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => navigate(ROUTES.ADMIN_FACULTY_RESULTS)}
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-200 hover:border-violet-300 hover:shadow-md transition-all text-left"
        >
          <div className="p-2.5 bg-violet-100 rounded-xl">
            <BarChart3 className="h-5 w-5 text-violet-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Faculty Results Dashboard
            </p>
            <p className="text-xs text-gray-500">
              Normalized scores, department rankings, response rates
            </p>
          </div>
          <ExternalLink className="h-4 w-4 text-gray-400" />
        </button>

        <button
          onClick={() => navigate(ROUTES.ADMIN_NORMALIZATION)}
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-200 hover:border-violet-300 hover:shadow-md transition-all text-left"
        >
          <div className="p-2.5 bg-indigo-100 rounded-xl">
            <Sliders className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Normalization Settings
            </p>
            <p className="text-xs text-gray-500">
              Configure exposure normalization weights (full page)
            </p>
          </div>
          <ExternalLink className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Inline normalization config */}
      <NormalizationConfig />
    </div>
  );
};

export default FacultyEvalTab;
