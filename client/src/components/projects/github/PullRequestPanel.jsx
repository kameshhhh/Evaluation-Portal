// ================================================================
// PULL REQUEST PANEL — GitHub-Lite PR Workflow
// ================================================================
// Create, view, and comment on pull requests.
// Status: open → merged | closed. Supports PR comments.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  GitPullRequest,
  Plus,
  MessageSquare,
  GitMerge,
  XCircle,
  Clock,
  User,
  Loader2,
  Send,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  Eye,
} from "lucide-react";
import {
  getPullRequests,
  createPullRequest,
  updatePullRequest,
  addPrComment,
  submitPrReview,
  getPrReviews,
  getBranches,
} from "../../../services/gitRepoApi";

const PR_STATUS_CONFIG = {
  open: { color: "bg-green-100 text-green-700", icon: GitPullRequest },
  merged: { color: "bg-purple-100 text-purple-700", icon: GitMerge },
  closed: { color: "bg-red-100 text-red-700", icon: XCircle },
};

const PullRequestPanel = ({ projectId, refreshKey }) => {
  const [prs, setPrs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPr, setSelectedPr] = useState(null);
  const [creating, setCreating] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({ status: "approved", body: "" });
  const [submittingReview, setSubmittingReview] = useState(false);

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const [form, setForm] = useState({
    title: "",
    description: "",
    sourceBranch: "",
    targetBranch: "main",
  });

  const fetchPrs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPullRequests(projectId, { status: statusFilter });
      setPrs(res.data || []);
    } catch (err) {
      console.error("Failed to load PRs:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter]);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await getBranches(projectId);
      setBranches(res.data || []);
    } catch (err) {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    fetchPrs();
    fetchBranches();
  }, [fetchPrs, fetchBranches, refreshKey]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.sourceBranch) return;
    setCreating(true);
    try {
      await createPullRequest(projectId, form);
      setShowCreate(false);
      setForm({
        title: "",
        description: "",
        sourceBranch: "",
        targetBranch: "main",
      });
      showFeedback("success", "Pull request created!");
      fetchPrs();
    } catch (err) {
      console.error("Create PR failed:", err);
      showFeedback("error", err?.response?.data?.error || "Failed to create PR");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (prId, newStatus) => {
    try {
      await updatePullRequest(prId, { status: newStatus });
      showFeedback("success", `PR ${newStatus === "merged" ? "merged" : "closed"} successfully!`);
      fetchPrs();
      setSelectedPr(null);
    } catch (err) {
      console.error("Status update failed:", err);
      showFeedback("error", err?.response?.data?.error || "Failed to update PR");
    }
  };

  const handleComment = async () => {
    if (!commentText.trim() || !selectedPr) return;
    setCommenting(true);
    try {
      await addPrComment(selectedPr.pr_id, commentText.trim());
      setCommentText("");
      showFeedback("success", "Comment added!");
      // Refresh the selected PR
      const res = await getPullRequests(projectId, { status: statusFilter });
      const updated = (res.data || []).find(
        (p) => p.pr_id === selectedPr.pr_id,
      );
      if (updated) setSelectedPr(updated);
    } catch (err) {
      console.error("Comment failed:", err);
    } finally {
      setCommenting(false);
    }
  };

  const selectPr = async (pr) => {
    setSelectedPr(pr);
    setShowReviewForm(false);
    setReviewForm({ status: "approved", body: "" });
    try {
      const res = await getPrReviews(pr.pr_id);
      setReviews(res.data || []);
    } catch (err) {
      setReviews([]);
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedPr) return;
    setSubmittingReview(true);
    try {
      await submitPrReview(selectedPr.pr_id, reviewForm);
      setShowReviewForm(false);
      setReviewForm({ status: "approved", body: "" });
      showFeedback("success", "Review submitted!");
      const res = await getPrReviews(selectedPr.pr_id);
      setReviews(res.data || []);
    } catch (err) {
      console.error("Review failed:", err);
      showFeedback("error", err?.response?.data?.error || "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 1) return "just now";
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // Detail View
  if (selectedPr) {
    const cfg = PR_STATUS_CONFIG[selectedPr.status] || PR_STATUS_CONFIG.open;
    const StatusIcon = cfg.icon;
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedPr(null)}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to pull requests
        </button>
        <div className="bg-white border rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-400">
                  #{selectedPr.pr_number}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${cfg.color}`}
                >
                  <StatusIcon size={10} />
                  {selectedPr.status}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedPr.title}
              </h3>
            </div>
            {selectedPr.status === "open" && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReviewForm(!showReviewForm)}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <span className="flex items-center gap-1">
                    <Eye size={14} /> Review
                  </span>
                </button>
                <button
                  onClick={() => handleStatusChange(selectedPr.pr_id, "merged")}
                  className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  <span className="flex items-center gap-1">
                    <GitMerge size={14} /> Merge
                  </span>
                </button>
                <button
                  onClick={() => handleStatusChange(selectedPr.pr_id, "closed")}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* Branch info */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <GitBranch size={14} />
            <span className="font-mono text-xs bg-blue-50 px-2 py-0.5 rounded">
              {selectedPr.source_branch}
            </span>
            <span>&rarr;</span>
            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
              {selectedPr.target_branch}
            </span>
          </div>

          {selectedPr.description && (
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
              {selectedPr.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-500">
            {selectedPr.author_name && (
              <span className="flex items-center gap-1">
                <User size={10} /> {selectedPr.author_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock size={10} /> {timeAgo(selectedPr.created_at)}
            </span>
          </div>

          {/* Review Form */}
          {showReviewForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700">Submit Review</h4>
              <div className="flex items-center gap-3">
                {[
                  { value: "approved", label: "Approve", icon: CheckCircle2, color: "text-green-600" },
                  { value: "changes_requested", label: "Request Changes", icon: AlertCircle, color: "text-orange-600" },
                  { value: "commented", label: "Comment", icon: MessageCircle, color: "text-gray-600" },
                ].map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setReviewForm({ ...reviewForm, status: opt.value })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        reviewForm.status === opt.value
                          ? "bg-white border-blue-500 shadow-sm"
                          : "bg-white border-gray-200 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <Icon size={14} className={opt.color} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={reviewForm.body}
                onChange={(e) => setReviewForm({ ...reviewForm, body: e.target.value })}
                rows={3}
                placeholder="Leave a review comment (optional)..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSubmitReview}
                  disabled={submittingReview}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submittingReview ? "Submitting..." : "Submit Review"}
                </button>
                <button
                  onClick={() => setShowReviewForm(false)}
                  className="px-4 py-2 bg-white text-gray-700 text-sm rounded-lg border hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="border-t pt-4 space-y-2">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Eye size={14} /> Reviews ({reviews.length})
              </h4>
              {reviews.map((r) => {
                const statusConfig = {
                  approved: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 border-green-200", label: "Approved" },
                  changes_requested: { icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-50 border-orange-200", label: "Changes Requested" },
                  commented: { icon: MessageCircle, color: "text-gray-600", bg: "bg-gray-50 border-gray-200", label: "Commented" },
                  pending: { icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200", label: "Pending" },
                };
                const cfg = statusConfig[r.status] || statusConfig.pending;
                const RIcon = cfg.icon;
                return (
                  <div key={r.review_id} className={`rounded-lg p-3 border ${cfg.bg}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <RIcon size={14} className={cfg.color} />
                      <span className="text-sm font-medium text-gray-800">{r.reviewer_name}</span>
                      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-xs text-gray-400">&middot; {timeAgo(r.created_at)}</span>
                    </div>
                    {r.body && <p className="text-sm text-gray-700 ml-5">{r.body}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Comments */}
          <div className="border-t pt-4 space-y-3">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <MessageSquare size={14} /> Comments
            </h4>
            {selectedPr.comments && selectedPr.comments.length > 0 ? (
              <div className="space-y-2">
                {selectedPr.comments.map((c, i) => (
                  <div key={c.id || i} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1 text-xs text-gray-500">
                      <User size={10} />
                      <span>{c.authorName || c.author_name || "Unknown"}</span>
                      <span>&middot;</span>
                      <span>{timeAgo(c.createdAt || c.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-800">{c.body || c.comment}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No comments yet.</p>
            )}

            {/* Add comment */}
            <div className="flex gap-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleComment();
                  }
                }}
              />
              <button
                onClick={handleComment}
                disabled={commenting || !commentText.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Feedback */}
      {feedback && (
        <div
          className={`px-4 py-2 rounded-lg text-sm ${
            feedback.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <GitPullRequest size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Pull Requests</h3>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Plus size={14} />
          New PR
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b">
        {["open", "merged", "closed"].map((s) => {
          const cfg = PR_STATUS_CONFIG[s];
          const Icon = cfg.icon;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                statusFilter === s
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="flex items-center gap-1">
                <Icon size={14} /> {s}
              </span>
            </button>
          );
        })}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Pull request title"
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Source Branch
              </label>
              <select
                value={form.sourceBranch}
                onChange={(e) =>
                  setForm({ ...form, sourceBranch: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select branch...</option>
                {branches
                  .filter((b) => b.branch_name !== form.targetBranch)
                  .map((b) => (
                    <option key={b.branch_name} value={b.branch_name}>
                      {b.branch_name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Target Branch
              </label>
              <select
                value={form.targetBranch}
                onChange={(e) =>
                  setForm({ ...form, targetBranch: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
              >
                {branches.map((b) => (
                  <option key={b.branch_name} value={b.branch_name}>
                    {b.branch_name}
                  </option>
                ))}
                {branches.length === 0 && <option value="main">main</option>}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
              placeholder="Describe the changes..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !form.title.trim() || !form.sourceBranch}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create PR"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-white text-gray-700 text-sm rounded-lg border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PR List */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading pull requests...
        </div>
      ) : prs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <GitPullRequest size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No {statusFilter} pull requests.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {prs.map((pr) => {
            const cfg = PR_STATUS_CONFIG[pr.status] || PR_STATUS_CONFIG.open;
            const Icon = cfg.icon;
            return (
              <button
                key={pr.pr_id}
                onClick={() => selectPr(pr)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 text-left"
              >
                <Icon
                  size={18}
                  className={
                    cfg.color.includes("green")
                      ? "text-green-600"
                      : cfg.color.includes("purple")
                        ? "text-purple-600"
                        : "text-red-500"
                  }
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {pr.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                    <span>#{pr.pr_number}</span>
                    <span className="font-mono bg-blue-50 px-1 rounded">
                      {pr.source_branch}
                    </span>
                    <span>&rarr;</span>
                    <span className="font-mono bg-gray-100 px-1 rounded">
                      {pr.target_branch}
                    </span>
                    <span>{timeAgo(pr.created_at)}</span>
                    {pr.comment_count > 0 && (
                      <span className="flex items-center gap-0.5">
                        <MessageSquare size={10} /> {pr.comment_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PullRequestPanel;
