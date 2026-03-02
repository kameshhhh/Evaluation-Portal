// ============================================================
// SUBMITTED VIEW — Post-Submission Confirmation
// ============================================================
// Shown after successful ranking submission.
// Privacy-first reassurance + option to return to survey list.
// ============================================================

import React from "react";
import { CheckCircle, ShieldCheck, ArrowLeft, BarChart3 } from "lucide-react";

const SubmittedView = ({ survey, onBackToList, onViewResults }) => {
  return (
    <div className="max-w-lg mx-auto text-center py-8 space-y-6">
      {/* Success icon */}
      <div className="flex justify-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
      </div>

      {/* Success heading */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Rankings Submitted</h2>
        <p className="text-gray-500 mt-2">
          Thank you for completing your peer evaluation.
        </p>
      </div>

      {/* Survey info */}
      {survey && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-left">
          <h3 className="font-semibold text-gray-900 mb-1">{survey.title}</h3>
          <p className="text-sm text-gray-500">
            {survey.questions?.length || 0} questions completed
          </p>
        </div>
      )}

      {/* Privacy reassurance */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-5">
        <div className="flex items-start gap-3 text-left">
          <ShieldCheck className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-green-800 text-sm">
              Your Privacy Is Protected
            </h4>
            <ul className="mt-2 space-y-1 text-xs text-green-700">
              <li>• Your individual rankings are anonymous and encrypted</li>
              <li>• Results are only shown after 3+ participants submit</li>
              <li>
                • Scores are aggregated into bands (Excellent / Good /
                Satisfactory / Developing)
              </li>
              <li>• No one can see how you specifically ranked any peer</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={onViewResults}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors"
        >
          <BarChart3 className="h-4 w-4" />
          View Results
        </button>
        <button
          onClick={onBackToList}
          className="flex items-center justify-center gap-2 px-5 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Surveys
        </button>
      </div>

      {/* What's next */}
      <div className="text-xs text-gray-400 mt-4">
        <p>
          Results will update as more peers participate. Check back later for
          comprehensive insights.
        </p>
      </div>
    </div>
  );
};

export default SubmittedView;
