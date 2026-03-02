// ============================================================
// ZERO SCORE ANALYTICS PAGE — Standalone Dashboard for Zero-Score Reasons
// ============================================================
// SRS §4.1.5 — Zero-Score Reason Capture Analytics
// SRS §5.3 — Anti-Collusion Behavior Detection
//
// PURPOSE:
//   Zero scores in a scarcity-based system are NOT failures — they are
//   deliberate classification decisions. This dashboard provides insights
//   into why evaluators assign zeros and detects potential issues.
//
// FEATURES:
//   - Distribution of reason classifications (scarcity/below/insufficient)
//   - Anomaly detection (lazy/harsh evaluators)
//   - Collusion detection (SRS §5.3)
//   - Monthly trends
//   - Export functionality (CSV/JSON)
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  BarChart2,
  Download,
  Filter,
  RefreshCw,
  Users,
  TrendingUp,
  Eye,
  Target,
  Calendar,
  FileDown,
  AlertCircle,
  Shield,
  Activity,
  Loader2,
} from "lucide-react";
import {
  getEnhancedAnalytics,
  downloadCSV,
  downloadJSON,
} from "../../services/zeroScoreAnalyticsApi";

// ============================================================
// Color constants for classification types
// ============================================================
const CLASSIFICATION_COLORS = {
  scarcity_driven: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-200",
    fill: "#3B82F6",
    label: "Scarcity-Driven",
  },
  below_expectation: {
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-red-200",
    fill: "#EF4444",
    label: "Below Expectation",
  },
  insufficient_observation: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    border: "border-yellow-200",
    fill: "#F59E0B",
    label: "Insufficient Observation",
  },
};

// ============================================================
// Summary Card Component
// ============================================================
const SummaryCard = ({ title, value, subtitle, icon: Icon, color }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className={`text-2xl font-bold mt-1 ${color || "text-gray-900"}`}>
          {value}
        </p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
      {Icon && (
        <div className={`p-3 rounded-lg bg-gray-50`}>
          <Icon className="w-6 h-6 text-gray-400" />
        </div>
      )}
    </div>
  </div>
);

// ============================================================
// Distribution Bar Component
// ============================================================
const DistributionBar = ({ data }) => {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return <div className="text-gray-400 text-sm">No data</div>;

  return (
    <div className="space-y-3">
      {Object.entries(CLASSIFICATION_COLORS).map(([key, config]) => {
        const count = data[key] || 0;
        const percentage = ((count / total) * 100).toFixed(1);
        return (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className={config.text}>{config.label}</span>
              <span className="text-gray-600">
                {count} ({percentage}%)
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: config.fill,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================
// Anomaly Card Component
// ============================================================
const AnomalyCard = ({ title, items, icon: Icon, color, description }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`w-5 h-5 ${color}`} />
      <h3 className="font-semibold text-gray-900">{title}</h3>
    </div>
    <p className="text-xs text-gray-500 mb-3">{description}</p>
    {items && items.length > 0 ? (
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.slice(0, 10).map((item, idx) => (
          <div
            key={idx}
            className="flex justify-between items-center text-sm py-1.5 px-2 bg-gray-50 rounded"
          >
            <span className="text-gray-700 truncate max-w-[60%]">
              {item.evaluator_name ||
                item.name ||
                `Evaluator ${item.evaluator_id}`}
            </span>
            <span className="text-gray-500 text-xs">
              {item.percentage?.toFixed(1) || item.rate?.toFixed(1)}% (
              {item.count || item.total})
            </span>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm text-gray-400 italic">No anomalies detected</p>
    )}
  </div>
);

// ============================================================
// Collusion Alert Component
// ============================================================
const CollusionAlert = ({ patterns }) => {
  if (!patterns || patterns.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-600" />
          <span className="text-green-800 font-medium">
            No collusion patterns detected
          </span>
        </div>
        <p className="text-green-700 text-sm mt-1">
          Evaluator pairs show healthy variation in their target overlaps.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-red-600" />
        <span className="text-red-800 font-medium">
          Potential Collusion Detected ({patterns.length} pairs)
        </span>
      </div>
      <p className="text-red-700 text-sm mb-3">
        These evaluator pairs show unusually high target overlap (&gt;70%),
        which may indicate coordinated scoring.
      </p>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {patterns.map((pair, idx) => (
          <div
            key={idx}
            className="flex justify-between items-center text-sm py-2 px-3 bg-white rounded border border-red-100"
          >
            <span className="text-gray-700">
              {pair.evaluator1_name || `Evaluator ${pair.evaluator1_id}`} ↔{" "}
              {pair.evaluator2_name || `Evaluator ${pair.evaluator2_id}`}
            </span>
            <span className="text-red-600 font-medium">
              {pair.overlap_percentage?.toFixed(1)}% overlap
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// Monthly Trend Chart Component
// ============================================================
const MonthlyTrendChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="text-gray-400 text-sm text-center py-8">
        No trend data available
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.total_count || 0));

  return (
    <div className="space-y-4">
      {data.slice(-6).map((month, idx) => (
        <div key={idx} className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{month.month}</span>
            <span>{month.total_count} zeros</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all duration-500"
              style={{
                width: `${maxCount > 0 ? (month.total_count / maxCount) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="flex gap-1 h-1">
            {Object.entries(CLASSIFICATION_COLORS).map(([key, config]) => {
              const count = month[key] || 0;
              const width =
                month.total_count > 0 ? (count / month.total_count) * 100 : 0;
              return (
                <div
                  key={key}
                  className="h-full rounded-full"
                  style={{
                    width: `${width}%`,
                    backgroundColor: config.fill,
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// Main Page Component
// ============================================================
const ZeroScoreAnalyticsPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    evaluationType: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  // Fetch enhanced analytics
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getEnhancedAnalytics(filters);
      setData(result);
    } catch (err) {
      console.error("Failed to fetch zero-score analytics:", err);
      setError(err.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle export
  const handleExport = async (format) => {
    setExporting(true);
    try {
      if (format === "csv") {
        await downloadCSV(filters);
      } else {
        await downloadJSON(filters);
      }
    } catch (err) {
      console.error("Export failed:", err);
      setError("Export failed: " + (err.message || "Unknown error"));
    } finally {
      setExporting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-violet-600 animate-spin mx-auto" />
          <p className="mt-2 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <div className="flex items-center gap-2 text-red-800 mb-2">
            <AlertCircle className="w-5 h-5" />
            <span className="font-semibold">Error Loading Data</span>
          </div>
          <p className="text-red-700 text-sm">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4 inline mr-2" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const {
    baseAnalytics,
    anomalies,
    collusion,
    monthlyTrend,
    sessionBreakdown,
  } = data || {};

  const distribution = {
    scarcity_driven: Number(baseAnalytics?.scarcity_driven_count) || 0,
    below_expectation: Number(baseAnalytics?.below_expectation_count) || 0,
    insufficient_observation:
      Number(baseAnalytics?.insufficient_observation_count) || 0,
  };
  const totalZeros = Object.values(distribution).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 className="w-7 h-7 text-violet-600" />
              Zero-Score Reason Analytics
            </h1>
            <p className="text-gray-500 mt-1">
              SRS §4.1.5 — Understanding why evaluators assign zeros
            </p>
          </div>

          <div className="flex gap-2">
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                showFilters
                  ? "bg-violet-100 text-violet-800"
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>

            {/* Refresh */}
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>

            {/* Export dropdown */}
            <div className="relative group">
              <button
                disabled={exporting}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-2"
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export
              </button>
              <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={() => handleExport("csv")}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                >
                  <FileDown className="w-4 h-4 inline mr-2" />
                  CSV
                </button>
                <button
                  onClick={() => handleExport("json")}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg"
                >
                  <FileDown className="w-4 h-4 inline mr-2" />
                  JSON
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, startDate: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, endDate: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Activity className="w-4 h-4 inline mr-1" />
                  Evaluation Type
                </label>
                <select
                  value={filters.evaluationType}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      evaluationType: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                >
                  <option value="">All Types</option>
                  <option value="peer_ranking">Peer Ranking</option>
                  <option value="faculty_evaluation">Faculty Evaluation</option>
                  <option value="comparative">Comparative</option>
                  <option value="scarcity">Scarcity</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            title="Total Zero-Scores"
            value={totalZeros.toLocaleString()}
            subtitle={`Across ${baseAnalytics?.unique_evaluators || 0} evaluators`}
            icon={BarChart2}
          />
          <SummaryCard
            title="Scarcity-Driven"
            value={`${totalZeros > 0 ? ((distribution.scarcity_driven / totalZeros) * 100).toFixed(1) : 0}%`}
            subtitle={`${distribution.scarcity_driven} zeros`}
            icon={Target}
            color="text-blue-600"
          />
          <SummaryCard
            title="Below Expectation"
            value={`${totalZeros > 0 ? ((distribution.below_expectation / totalZeros) * 100).toFixed(1) : 0}%`}
            subtitle={`${distribution.below_expectation} zeros`}
            icon={TrendingUp}
            color="text-red-600"
          />
          <SummaryCard
            title="Insufficient Observation"
            value={`${totalZeros > 0 ? ((distribution.insufficient_observation / totalZeros) * 100).toFixed(1) : 0}%`}
            subtitle={`${distribution.insufficient_observation} zeros`}
            icon={Eye}
            color="text-yellow-600"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Distribution Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-violet-600" />
              Classification Distribution
            </h2>
            <DistributionBar data={distribution} />
          </div>

          {/* Monthly Trends */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-violet-600" />
              Monthly Trends
            </h2>
            <MonthlyTrendChart data={monthlyTrend} />
          </div>

          {/* Session Breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-violet-600" />
              By Evaluation Type
            </h2>
            {sessionBreakdown && sessionBreakdown.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {sessionBreakdown.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center text-sm py-1.5 px-2 bg-gray-50 rounded"
                  >
                    <span className="text-gray-700 capitalize">
                      {item.evaluation_type?.replace(/_/g, " ") || "Unknown"}
                    </span>
                    <span className="text-gray-500">{item.count} zeros</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No session data available</p>
            )}
          </div>
        </div>

        {/* Collusion Detection (SRS §5.3) */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-violet-600" />
            Collusion Detection (SRS §5.3)
          </h2>
          <CollusionAlert patterns={collusion} />
        </div>

        {/* Anomaly Detection */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-violet-600" />
            Anomaly Detection
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AnomalyCard
              title="Lazy Evaluators"
              items={anomalies?.lazyEvaluators}
              icon={Eye}
              color="text-yellow-600"
              description="Evaluators with >50% 'Insufficient Observation' — may indicate avoidance"
            />
            <AnomalyCard
              title="Harsh Evaluators"
              items={anomalies?.harshEvaluators}
              icon={AlertTriangle}
              color="text-red-600"
              description="Evaluators with >60% 'Below Expectation' — may need calibration"
            />
            <AnomalyCard
              title="Low Variety"
              items={anomalies?.lowVariety}
              icon={Users}
              color="text-orange-600"
              description="Evaluators using only 1 classification — may indicate inattention"
            />
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-8 text-center text-xs text-gray-400">
          Zero scores in scarcity-based evaluation are deliberate classification
          decisions, not failures.
          <br />
          This dashboard helps distinguish strategic zeros (scarcity) from
          performance-based zeros (below expectation).
        </div>
      </div>
    </div>
  );
};

export default ZeroScoreAnalyticsPage;
