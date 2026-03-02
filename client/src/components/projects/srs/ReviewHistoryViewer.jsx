// ================================================================
// REVIEW HISTORY VIEWER — SRS 4.1.2 Previous Evaluations
// ================================================================
// Displays the evaluation history for a project, showing scores
// and faculty comments across review sessions.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect } from "react";
import {
  History,
  Star,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
} from "lucide-react";
import { getReviewHistory } from "../../../services/projectEnhancementApi";

const ReviewHistoryViewer = ({ projectId }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getReviewHistory(projectId);
        setReviews(res.data || []);
      } catch (err) {
        console.error("Failed to load review history:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  const scoreColor = (score) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading review history...
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <History size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm">No review history available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History size={18} className="text-blue-600" />
        <h3 className="font-semibold text-gray-900">Review History</h3>
        <span className="text-xs text-gray-500">
          ({reviews.length} reviews)
        </span>
      </div>

      <div className="space-y-2">
        {reviews.map((review, idx) => {
          const isExpanded = expandedIdx === idx;
          return (
            <div
              key={idx}
              className="bg-white border rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {review.session_date
                      ? new Date(review.session_date).toLocaleDateString()
                      : `Session ${review.session_number || idx + 1}`}
                  </span>
                  {review.score != null && (
                    <span
                      className={`flex items-center gap-1 text-sm font-bold ${scoreColor(
                        review.score,
                      )}`}
                    >
                      <Star size={12} />
                      {review.score}
                    </span>
                  )}
                  {review.session_type && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {review.session_type}
                    </span>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t space-y-3 pt-3">
                  {/* Scores breakdown */}
                  {review.criteria_scores && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 mb-2">
                        Score Breakdown
                      </h5>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(review.criteria_scores).map(
                          ([key, val]) => (
                            <div
                              key={key}
                              className="flex items-center justify-between bg-gray-50 rounded px-2 py-1"
                            >
                              <span className="text-xs text-gray-600 capitalize">
                                {key.replace(/_/g, " ")}
                              </span>
                              <span
                                className={`text-xs font-bold ${scoreColor(val)}`}
                              >
                                {val}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {/* Faculty comments */}
                  {review.comments && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 mb-1">
                        Faculty Comments
                      </h5>
                      <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
                        {review.comments}
                      </p>
                    </div>
                  )}

                  {/* Evaluator info (anonymized) */}
                  {review.evaluator_count && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <User size={10} />
                      Evaluated by {review.evaluator_count} judge(s)
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReviewHistoryViewer;
