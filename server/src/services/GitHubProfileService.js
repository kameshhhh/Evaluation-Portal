"use strict";

const GitHubTokenService = require("./GitHubTokenService");
const logger = require("../utils/logger");

const GITHUB_API = "https://api.github.com";

class GitHubProfileService {
  /**
   * Fetch a student's full GitHub profile using their stored PAT.
   * Returns profile, repos, recent activity, and language stats.
   */
  static async getFullProfile(personId) {
    const tokenData = await GitHubTokenService.getDecryptedToken(personId);
    if (!tokenData) {
      throw new Error("Student has not linked their GitHub account");
    }

    const headers = {
      Authorization: `Bearer ${tokenData.pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const username = tokenData.username;

    // Fetch all data in parallel using AUTHENTICATED endpoints
    // /user/repos returns ALL repos (including private) for the token owner
    // /users/{username}/events returns all events (not just public)
    const [profile, repos, events, starred] = await Promise.all([
      this.fetchJSON(`${GITHUB_API}/user`, headers),
      this.fetchJSON(`${GITHUB_API}/user/repos?per_page=100&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member`, headers),
      this.fetchJSON(`${GITHUB_API}/users/${encodeURIComponent(username)}/events?per_page=100`, headers),
      this.fetchJSON(`${GITHUB_API}/user/starred?per_page=100`, headers),
    ]);

    // Fetch per-repo languages for richer stats (top 5 repos by recent push)
    const topRepos = (Array.isArray(repos) ? repos : []).slice(0, 8);
    const langDetails = await Promise.all(
      topRepos.map((r) => this.fetchJSON(`${GITHUB_API}/repos/${r.full_name}/languages`, headers).catch(() => ({})))
    );

    // Compute language stats — merge per-repo language breakdowns + repo.language fallback
    const languageStats = {};
    let totalSize = 0;
    // First: use detailed per-repo language data
    for (const langObj of langDetails) {
      if (langObj && typeof langObj === "object" && !Array.isArray(langObj)) {
        for (const [lang, bytes] of Object.entries(langObj)) {
          languageStats[lang] = (languageStats[lang] || 0) + bytes;
          totalSize += bytes;
        }
      }
    }
    // Fallback: for repos not in top 8, use repo.language
    const reposArr = Array.isArray(repos) ? repos : [];
    for (const repo of reposArr.slice(8)) {
      if (repo.language) {
        languageStats[repo.language] = (languageStats[repo.language] || 0) + (repo.size || 1) * 1024;
        totalSize += (repo.size || 1) * 1024;
      }
    }
    const languages = Object.entries(languageStats)
      .map(([name, size]) => ({ name, percentage: Math.round((size / (totalSize || 1)) * 100) }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 10);

    // Process recent events
    const eventsArr = Array.isArray(events) ? events : [];
    const recentActivity = eventsArr.slice(0, 30).map((e) => ({
      type: e.type,
      repo: e.repo?.name,
      created_at: e.created_at,
      payload: this.summarizePayload(e),
    }));

    // Compute contribution summary from events
    const commitCount = eventsArr.filter((e) => e.type === "PushEvent")
      .reduce((sum, e) => sum + (e.payload?.commits?.length || 0), 0);
    const prCount = eventsArr.filter((e) => e.type === "PullRequestEvent").length;
    const issueCount = eventsArr.filter((e) => e.type === "IssuesEvent").length;

    const starredArr = Array.isArray(starred) ? starred : [];

    return {
      profile: {
        username: profile.login,
        name: profile.name,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        location: profile.location,
        company: profile.company,
        blog: profile.blog,
        public_repos: profile.public_repos,
        total_private_repos: profile.total_private_repos || 0,
        owned_private_repos: profile.owned_private_repos || 0,
        followers: profile.followers,
        following: profile.following,
        created_at: profile.created_at,
        html_url: profile.html_url,
        starred_count: starredArr.length,
        disk_usage: profile.disk_usage,
      },
      repos: reposArr.map((r) => ({
        name: r.name,
        full_name: r.full_name,
        description: r.description,
        html_url: r.html_url,
        language: r.language,
        stargazers_count: r.stargazers_count,
        forks_count: r.forks_count,
        open_issues_count: r.open_issues_count,
        size: r.size,
        default_branch: r.default_branch,
        created_at: r.created_at,
        updated_at: r.updated_at,
        pushed_at: r.pushed_at,
        fork: r.fork,
        private: r.private,
        topics: r.topics || [],
      })),
      languages,
      recentActivity,
      contributionSummary: {
        recent_commits: commitCount,
        recent_prs: prCount,
        recent_issues: issueCount,
        total_events: eventsArr.length,
      },
    };
  }

  /**
   * Fetch JSON from GitHub API with error handling.
   */
  static async fetchJSON(url, headers) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(`GitHub API ${res.status}: ${url}`, { body: text.slice(0, 200) });
      if (res.status === 401) throw new Error("GitHub token is invalid or expired");
      if (res.status === 403) throw new Error("GitHub API rate limit exceeded");
      return [];
    }
    return res.json();
  }

  /**
   * Summarize a GitHub event payload into readable text.
   */
  static summarizePayload(event) {
    switch (event.type) {
      case "PushEvent":
        return `Pushed ${event.payload?.commits?.length || 0} commit(s) to ${event.payload?.ref?.replace("refs/heads/", "")}`;
      case "PullRequestEvent":
        return `${event.payload?.action} PR #${event.payload?.pull_request?.number}: ${event.payload?.pull_request?.title}`;
      case "IssuesEvent":
        return `${event.payload?.action} issue #${event.payload?.issue?.number}: ${event.payload?.issue?.title}`;
      case "CreateEvent":
        return `Created ${event.payload?.ref_type} ${event.payload?.ref || ""}`;
      case "DeleteEvent":
        return `Deleted ${event.payload?.ref_type} ${event.payload?.ref || ""}`;
      case "WatchEvent":
        return `Starred the repo`;
      case "ForkEvent":
        return `Forked to ${event.payload?.forkee?.full_name}`;
      case "IssueCommentEvent":
        return `Commented on issue #${event.payload?.issue?.number}`;
      case "PullRequestReviewEvent":
        return `Reviewed PR #${event.payload?.pull_request?.number}`;
      default:
        return event.type.replace("Event", "");
    }
  }
}

module.exports = GitHubProfileService;
