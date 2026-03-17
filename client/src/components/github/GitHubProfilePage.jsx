// ================================================================
// GITHUB PROFILE PAGE — Admin view of student's GitHub profile
// ================================================================
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Loader2, Github, Star, GitFork, Eye, Code, Users,
  MapPin, Building2, Link2, Calendar, Activity, GitCommit,
  GitPullRequest, AlertCircle, ExternalLink, FolderGit2, Clock,
  RefreshCw, BookOpen,
} from "lucide-react";
import { getStudentGitHubProfile } from "../../services/githubApi";

const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5",
  Java: "#b07219", "C++": "#f34b7d", C: "#555555", Go: "#00ADD8",
  Rust: "#dea584", Ruby: "#701516", PHP: "#4F5D95", Swift: "#F05138",
  Kotlin: "#A97BFF", Dart: "#00B4AB", HTML: "#e34c26", CSS: "#563d7c",
  Shell: "#89e051", "Jupyter Notebook": "#DA5B0B", R: "#198CE7",
  Scala: "#c22d40", Vue: "#41b883", Svelte: "#ff3e00",
};

const EVENT_ICONS = {
  PushEvent: GitCommit, PullRequestEvent: GitPullRequest,
  IssuesEvent: AlertCircle, CreateEvent: FolderGit2,
  WatchEvent: Star, ForkEvent: GitFork, IssueCommentEvent: BookOpen,
  PullRequestReviewEvent: Eye,
};

const GitHubProfilePage = () => {
  const { personId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("repos");
  const [repoFilter, setRepoFilter] = useState("");
  const [repoSort, setRepoSort] = useState("updated");

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getStudentGitHubProfile(personId);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load GitHub profile");
    } finally { setLoading(false); }
  }, [personId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-500">Loading GitHub profile…</p>
          <p className="text-[10px] text-gray-400 mt-1">Fetching data from GitHub API</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle size={32} className="mx-auto mb-2 text-red-400" />
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={fetchProfile} className="mt-3 px-4 py-2 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-100">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { profile, repos, languages, recentActivity, contributionSummary } = data;

  // Filter & sort repos
  const filteredRepos = repos
    .filter((r) => !repoFilter || r.name.toLowerCase().includes(repoFilter.toLowerCase()) || (r.language || "").toLowerCase().includes(repoFilter.toLowerCase()))
    .sort((a, b) => {
      if (repoSort === "stars") return (b.stargazers_count || 0) - (a.stargazers_count || 0);
      if (repoSort === "name") return a.name.localeCompare(b.name);
      return new Date(b.pushed_at || b.updated_at) - new Date(a.pushed_at || a.updated_at);
    });

  const timeAgo = (dateStr) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7">
      {/* Back button */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-4 transition-colors">
        <ArrowLeft size={14} /> Back to Logs
      </button>

      {/* ═══════ PROFILE HEADER ═══════ */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <img src={profile.avatar_url} alt={profile.username} className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-gray-100" />
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{profile.name || profile.username}</h1>
                <p className="text-sm text-gray-500">@{profile.username}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={fetchProfile} className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg border border-gray-200">
                  <RefreshCw size={14} />
                </button>
                <a href={profile.html_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors">
                  <Github size={13} /> View on GitHub <ExternalLink size={10} />
                </a>
              </div>
            </div>
            {profile.bio && <p className="text-xs text-gray-600 mt-2">{profile.bio}</p>}
            <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-gray-500">
              {profile.company && <span className="flex items-center gap-1"><Building2 size={11} /> {profile.company}</span>}
              {profile.location && <span className="flex items-center gap-1"><MapPin size={11} /> {profile.location}</span>}
              {profile.blog && (
                <a href={profile.blog.startsWith("http") ? profile.blog : `https://${profile.blog}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline"><Link2 size={11} /> {profile.blog}</a>
              )}
              <span className="flex items-center gap-1"><Calendar size={11} /> Joined {new Date(profile.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4 pt-4 border-t border-gray-50">
          {[
            { label: "Total Repos", value: repos.length, color: "text-blue-700", bg: "bg-blue-50" },
            { label: "Private Repos", value: profile.total_private_repos || 0, color: "text-indigo-700", bg: "bg-indigo-50" },
            { label: "Followers", value: profile.followers, color: "text-purple-700", bg: "bg-purple-50" },
            { label: "Starred", value: profile.starred_count || 0, color: "text-amber-700", bg: "bg-amber-50" },
            { label: "Recent Commits", value: contributionSummary.recent_commits, color: "text-green-700", bg: "bg-green-50" },
            { label: "Recent PRs", value: contributionSummary.recent_prs, color: "text-pink-700", bg: "bg-pink-50" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-3 ${s.bg}`}>
              <p className={`text-lg font-bold ${s.color}`}>{s.value ?? 0}</p>
              <p className="text-[10px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Language breakdown */}
        {languages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-50">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Top Languages</p>
            <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-2">
              {languages.map((l) => (
                <div key={l.name} style={{ width: `${l.percentage}%`, backgroundColor: LANG_COLORS[l.name] || "#6b7280", minWidth: "3px" }}
                  title={`${l.name}: ${l.percentage}%`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {languages.map((l) => (
                <span key={l.name} className="flex items-center gap-1 text-[10px] text-gray-600">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: LANG_COLORS[l.name] || "#6b7280" }} />
                  {l.name} <span className="text-gray-400">{l.percentage}%</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══════ TABS ═══════ */}
      <div className="flex bg-white border border-gray-200 rounded-xl p-1 mb-4">
        {[
          { id: "repos", label: "Repositories", icon: FolderGit2, count: repos.length },
          { id: "activity", label: "Recent Activity", icon: Activity, count: recentActivity.length },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-red-50 text-red-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}>
            <tab.icon size={14} />
            {tab.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400"
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ═══════ REPOS TAB ═══════ */}
      {activeTab === "repos" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2">
            <input value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)}
              placeholder="Filter by name or language…"
              className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-red-200 focus:outline-none" />
            <select value={repoSort} onChange={(e) => setRepoSort(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs cursor-pointer focus:outline-none">
              <option value="updated">Recently updated</option>
              <option value="stars">Most stars</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>

          {filteredRepos.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <FolderGit2 size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No repositories found.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredRepos.map((repo) => (
                <a key={repo.full_name} href={repo.html_url} target="_blank" rel="noopener noreferrer"
                  className="block bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md hover:border-gray-200 transition-all group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-blue-600 group-hover:underline truncate">{repo.name}</h3>
                        {repo.fork && <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-400 flex-shrink-0">Fork</span>}
                        {repo.private && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-500 flex-shrink-0">Private</span>}
                      </div>
                      {repo.description && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{repo.description}</p>}
                    </div>
                    <ExternalLink size={12} className="text-gray-300 group-hover:text-gray-500 flex-shrink-0 mt-1" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-gray-500">
                    {repo.language && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LANG_COLORS[repo.language] || "#6b7280" }} />
                        {repo.language}
                      </span>
                    )}
                    {repo.stargazers_count > 0 && <span className="flex items-center gap-0.5"><Star size={10} /> {repo.stargazers_count}</span>}
                    {repo.forks_count > 0 && <span className="flex items-center gap-0.5"><GitFork size={10} /> {repo.forks_count}</span>}
                    <span className="flex items-center gap-0.5"><Clock size={10} /> {timeAgo(repo.pushed_at)}</span>
                  </div>
                  {repo.topics?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {repo.topics.slice(0, 5).map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{t}</span>
                      ))}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ ACTIVITY TAB ═══════ */}
      {activeTab === "activity" && (
        <div className="space-y-2">
          {recentActivity.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Activity size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent activity.</p>
            </div>
          ) : (
            recentActivity.map((event, i) => {
              const Icon = EVENT_ICONS[event.type] || Activity;
              return (
                <div key={i} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-start gap-3 hover:shadow-sm transition-shadow">
                  <div className="mt-0.5 p-1.5 rounded-lg bg-gray-50">
                    <Icon size={14} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-gray-700 px-1.5 py-0.5 rounded bg-gray-100">
                        {event.type.replace("Event", "")}
                      </span>
                      <span className="text-[11px] text-blue-600 font-medium truncate">{event.repo}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{event.payload}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(event.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default GitHubProfilePage;
