// ============================================================
// CREATE PROJECT PAGE — Full Project Creation Form
// ============================================================
// Real form connected to POST /api/projects backend.
// NO dummy/static data — all inputs from user, all submissions
// go to backend, team member search queries the persons API.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  X,
  Search,
  Users,
  FolderPlus,
  Calendar,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCircle,
  UserPlus,
} from "lucide-react";
import { createProject, searchPersons } from "../../services/projectService";
import useAuth from "../../hooks/useAuth";

const CreateProjectPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ---- Form State ----
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    academicYear: new Date().getFullYear(),
    semester: 1,
    startDate: "",
    expectedEndDate: "",
  });

  // ---- Team Members State ----
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // ---- UI State ----
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // ---- Search persons for team members ----
  const handleSearchMembers = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { persons } = await searchPersons(
        { personType: "student", status: "active" },
        20,
        0,
      );
      const filtered = (persons || []).filter(
        (p) =>
          p.displayName?.toLowerCase().includes(query.toLowerCase()) ||
          p.personId?.toLowerCase().includes(query.toLowerCase()),
      );
      setSearchResults(filtered);
    } catch (err) {
      console.error("Member search failed:", err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (memberSearch.trim()) {
        handleSearchMembers(memberSearch.trim());
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch, handleSearchMembers]);

  // ---- Add member to team ----
  const addMember = (person) => {
    if (selectedMembers.find((m) => m.personId === person.personId)) return;
    if (user?.personId === person.personId) return;
    if (selectedMembers.length >= 3) {
      setError("Maximum 4 members allowed (including you)");
      return;
    }

    setSelectedMembers((prev) => [
      ...prev,
      {
        personId: person.personId,
        displayName: person.displayName || "Unknown",
        departmentCode: person.departmentCode || "",
        roleInProject: "member",
      },
    ]);
    setMemberSearch("");
    setSearchResults([]);
    setShowSearch(false);
    setError(null);
  };

  const removeMember = (personId) => {
    setSelectedMembers((prev) => prev.filter((m) => m.personId !== personId));
  };

  const updateMemberRole = (personId, role) => {
    setSelectedMembers((prev) =>
      prev.map((m) =>
        m.personId === personId ? { ...m, roleInProject: role } : m,
      ),
    );
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  // Safe error message extraction — ALWAYS returns a string
  const safeErrorString = (val) => {
    if (!val) return "An unknown error occurred";
    if (typeof val === "string") return val;
    if (typeof val === "object")
      return val.message || val.error || JSON.stringify(val);
    return String(val);
  };

  // ---- Submit form ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError("Project title is required");
      return;
    }
    if (!formData.description.trim()) {
      setError("Project description is required");
      return;
    }
    if (selectedMembers.length < 1) {
      setError("Add at least 1 team member (minimum 2 total including you)");
      return;
    }

    setSubmitting(true);
    try {
      const projectPayload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        academicYear: parseInt(formData.academicYear, 10),
        semester: parseInt(formData.semester, 10),
        startDate: formData.startDate || null,
        expectedEndDate: formData.expectedEndDate || null,
      };

      const membersPayload = [
        { personId: user?.personId, roleInProject: "team_lead" },
        ...selectedMembers.map((m) => ({
          personId: m.personId,
          roleInProject: m.roleInProject,
        })),
      ];

      const result = await createProject(projectPayload, membersPayload);
      setSuccess(true);

      setTimeout(() => {
        const pid = result?.project?.projectId || result?.projectId;
        navigate(pid ? `/projects/${pid}` : "/projects");
      }, 1500);
    } catch (err) {
      setError(
        safeErrorString(
          err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message ||
            err,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const userName =
    user?.name || user?.displayName || user?.email?.split("@")[0] || "You";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-blue-100 rounded-xl">
            <FolderPlus className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Create New Project
            </h1>
            <p className="text-sm text-gray-500">
              Set up your project details and invite team members
            </p>
          </div>
        </div>

        {/* Success Banner */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-green-800">
                Project created successfully!
              </p>
              <p className="text-sm text-green-600">
                Redirecting to project dashboard...
              </p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">
              {typeof error === "string" ? error : safeErrorString(error)}
            </p>
          </div>
        )}

        {/* No personId warning */}
        {!user?.personId && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                Profile Not Linked
              </p>
              <p className="text-xs text-amber-600">
                Your account doesn&apos;t have a linked person profile yet.
                Contact your department admin to create your profile, then
                you&apos;ll be able to create projects with team members.
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Details Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Project Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Enter your project title"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                  disabled={submitting || success}
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe your project goals, scope, and methodology..."
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm resize-none"
                  disabled={submitting || success}
                  maxLength={2000}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Academic Year
                  </label>
                  <select
                    name="academicYear"
                    value={formData.academicYear}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                    disabled={submitting || success}
                  >
                    {[2024, 2025, 2026, 2027, 2028].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Semester
                  </label>
                  <select
                    name="semester"
                    value={formData.semester}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                    disabled={submitting || success}
                  >
                    <option value={1}>Odd Semester (Jun–Nov)</option>
                    <option value={2}>Even Semester (Dec–May)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="inline h-3.5 w-3.5 mr-1" />
                    Start Date
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                    disabled={submitting || success}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="inline h-3.5 w-3.5 mr-1" />
                    Expected End Date
                  </label>
                  <input
                    type="date"
                    name="expectedEndDate"
                    value={formData.expectedEndDate}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                    disabled={submitting || success}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Team Members Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                Team Members
              </h2>
              <span className="text-xs text-gray-400">
                {selectedMembers.length + 1}/4 members (min 2, max 4)
              </span>
            </div>

            {/* You (auto-added as team lead) */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {user?.picture ? (
                    <img
                      src={user.picture}
                      alt={userName}
                      className="h-8 w-8 rounded-full border border-blue-200"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-8 w-8 bg-blue-200 rounded-full flex items-center justify-center text-blue-700 text-xs font-bold">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {userName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Team Lead (auto-assigned)
                    </p>
                  </div>
                </div>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  Team Lead
                </span>
              </div>
            </div>

            {/* Selected members */}
            {selectedMembers.map((member) => (
              <div
                key={member.personId}
                className="p-3 border border-gray-200 rounded-xl mb-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-bold">
                    {member.displayName?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {member.displayName}
                    </p>
                    <p className="text-xs text-gray-400">
                      {member.departmentCode}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={member.roleInProject}
                    onChange={(e) =>
                      updateMemberRole(member.personId, e.target.value)
                    }
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                    disabled={submitting || success}
                  >
                    <option value="member">Member</option>
                    <option value="team_lead">Team Lead</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeMember(member.personId)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    disabled={submitting || success}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add member button / search */}
            {selectedMembers.length < 3 && !success && (
              <div className="relative">
                {!showSearch ? (
                  <button
                    type="button"
                    onClick={() => setShowSearch(true)}
                    className="w-full p-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add Team Member
                  </button>
                ) : (
                  <div className="border border-gray-200 rounded-xl p-3">
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search students by name..."
                        className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowSearch(false);
                          setMemberSearch("");
                          setSearchResults([]);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {searching && (
                      <div className="py-3 text-center text-sm text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                        Searching...
                      </div>
                    )}
                    {!searching && searchResults.length > 0 && (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {searchResults
                          .filter(
                            (p) =>
                              !selectedMembers.find(
                                (m) => m.personId === p.personId,
                              ) && p.personId !== user?.personId,
                          )
                          .map((person) => (
                            <button
                              key={person.personId}
                              type="button"
                              onClick={() => addMember(person)}
                              className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-blue-50 transition-colors text-left"
                            >
                              <div className="h-7 w-7 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-bold">
                                {person.displayName?.charAt(0)?.toUpperCase() ||
                                  "?"}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {person.displayName}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {person.departmentCode}
                                  {person.admissionYear
                                    ? ` • ${person.admissionYear}`
                                    : ""}
                                </p>
                              </div>
                              <Plus className="h-4 w-4 ml-auto text-blue-500" />
                            </button>
                          ))}
                      </div>
                    )}
                    {!searching &&
                      memberSearch.length >= 2 &&
                      searchResults.length === 0 && (
                        <p className="py-3 text-center text-sm text-gray-400">
                          No students found
                        </p>
                      )}
                    {!searching &&
                      memberSearch.length < 2 &&
                      memberSearch.length > 0 && (
                        <p className="py-2 text-center text-xs text-gray-400">
                          Type at least 2 characters to search
                        </p>
                      )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="px-6 py-2.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || success}
              className="px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4" />
                  Create Project
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default CreateProjectPage;
