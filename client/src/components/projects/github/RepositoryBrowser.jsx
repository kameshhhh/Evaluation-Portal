// ================================================================
// REPOSITORY BROWSER — GitHub-Lite File Explorer
// ================================================================
// Tree-based file explorer with code viewer. Allows browsing,
// viewing file content, and committing new/updated files.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Folder,
  FileCode,
  File,
  ChevronRight,
  Upload,
  Loader2,
  GitBranch,
  Eye,
  ArrowLeft,
  Trash2,
  Pencil,
  History,
  UploadCloud,
  X,
  FileUp,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  getFiles,
  getFile,
  commitFile,
  pushFiles,
  deleteRepoFile,
  getBranches,
  getSyncStatus,
  pullCommits,
} from "../../../services/gitRepoApi";

const FILE_ICONS = {
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  py: FileCode,
  java: FileCode,
  css: FileCode,
  html: FileCode,
  json: FileCode,
  sql: FileCode,
  md: File,
};

const getIcon = (name) => {
  const ext = name.split(".").pop().toLowerCase();
  return FILE_ICONS[ext] || File;
};

const RepositoryBrowser = ({ projectId, refreshKey }) => {
  const [files, setFiles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [activeBranch, setActiveBranch] = useState("main");
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  // Upload form
  const [uploadForm, setUploadForm] = useState({
    filePath: "",
    content: "",
    message: "",
  });
  const [uploading, setUploading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Push (multi-file upload)
  const [showPush, setShowPush] = useState(false);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [pushMessage, setPushMessage] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const pushInputRef = useRef(null);

  // Sync state
  const [headHash, setHeadHash] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null); // { status, commitsBehind, headHash }
  const [pulling, setPulling] = useState(false);

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFiles(projectId, currentPath, activeBranch);
      setFiles(res.data || []);
    } catch (err) {
      console.error("Failed to load files:", err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, activeBranch, currentPath]);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await getBranches(projectId);
      setBranches(res.data || []);
    } catch (err) {
      console.error("Failed to load branches:", err);
    }
  }, [projectId]);

  const checkSyncStatus = useCallback(async () => {
    try {
      const res = await getSyncStatus(projectId, activeBranch, headHash);
      setSyncStatus(res.data);
      // If we don't have a headHash yet, adopt the server's
      if (!headHash && res.data?.headHash) {
        setHeadHash(res.data.headHash);
      }
    } catch (err) {
      // Silently fail — sync status is non-critical
    }
  }, [projectId, activeBranch, headHash]);

  useEffect(() => {
    fetchFiles();
    fetchBranches();
    checkSyncStatus();
  }, [fetchFiles, fetchBranches, checkSyncStatus, refreshKey]);

  const openFile = async (file) => {
    try {
      const res = await getFile(projectId, file.file_path, activeBranch);
      setSelectedFile(file);
      setFileContent(res.data);
    } catch (err) {
      console.error("Failed to load file:", err);
    }
  };

  const navigateToDir = (dirPath) => {
    setCurrentPath(dirPath);
    setSelectedFile(null);
    setFileContent(null);
  };

  const goUp = () => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
    setSelectedFile(null);
    setFileContent(null);
  };

  const handleUpload = async () => {
    if (
      !uploadForm.filePath ||
      !uploadForm.content ||
      !uploadForm.message
    )
      return;
    setUploading(true);
    try {
      const fileName = uploadForm.filePath.split("/").pop();
      await commitFile(projectId, {
        filePath: uploadForm.filePath,
        fileName,
        content: uploadForm.content,
        message: uploadForm.message,
        branch: activeBranch,
        expectedHead: headHash,
      });
      setShowUpload(false);
      setEditMode(false);
      setUploadForm({ filePath: "", content: "", message: "" });
      showFeedback("success", "File committed successfully!");
      fetchFiles();
      checkSyncStatus();
    } catch (err) {
      console.error("Commit failed:", err);
      if (err?.response?.status === 409) {
        showFeedback("error", "Branch has diverged — pull latest changes first.");
        checkSyncStatus();
      } else {
        showFeedback("error", err?.response?.data?.error || "Commit failed");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFile) return;
    if (!window.confirm(`Delete "${selectedFile.file_path}"?`)) return;
    try {
      await deleteRepoFile(projectId, selectedFile.file_path, `Delete ${selectedFile.file_path}`, activeBranch);
      setSelectedFile(null);
      setFileContent(null);
      showFeedback("success", "File deleted successfully!");
      fetchFiles();
    } catch (err) {
      console.error("Delete failed:", err);
      showFeedback("error", err?.response?.data?.error || "Failed to delete file");
    }
  };

  const handleEdit = () => {
    if (!selectedFile || !fileContent) return;
    setEditMode(true);
    setUploadForm({
      filePath: selectedFile.file_path,
      content: fileContent.content || "",
      message: "",
    });
    setShowUpload(true);
    setSelectedFile(null);
    setFileContent(null);
  };

  // ── Push handlers ──
  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });

  const stageFilesFromInput = async (fileList) => {
    const newFiles = [];
    for (const file of fileList) {
      const content = await readFileAsText(file);
      // Use webkitRelativePath if available (folder upload), else just name
      const relativePath = file.webkitRelativePath || file.name;
      // Prefix with current path if user is inside a directory
      const filePath = currentPath
        ? `${currentPath}/${relativePath}`
        : relativePath;
      newFiles.push({
        filePath,
        content,
        size: file.size,
        mimeType: file.type || "text/plain",
      });
    }
    setStagedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.filePath));
      return [...prev, ...newFiles.filter((f) => !existing.has(f.filePath))];
    });
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await stageFilesFromInput(e.dataTransfer.files);
    }
  };

  const removeStagedFile = (filePath) => {
    setStagedFiles((prev) => prev.filter((f) => f.filePath !== filePath));
  };

  const handlePush = async () => {
    if (stagedFiles.length === 0 || !pushMessage.trim()) return;
    setPushing(true);
    setPushProgress(10);
    try {
      setPushProgress(40);
      await pushFiles(
        projectId,
        stagedFiles.map((f) => ({
          filePath: f.filePath,
          content: f.content,
          mimeType: f.mimeType,
        })),
        pushMessage.trim(),
        activeBranch,
      );
      setPushProgress(100);
      setShowPush(false);
      setStagedFiles([]);
      setPushMessage("");
      showFeedback("success", `Pushed ${stagedFiles.length} file(s) successfully!`);
      fetchFiles();
      checkSyncStatus();
    } catch (err) {
      console.error("Push failed:", err);
      if (err?.response?.status === 409) {
        showFeedback("error", "Branch has diverged — pull latest changes before pushing.");
        checkSyncStatus();
      } else {
        showFeedback("error", err?.response?.data?.error || "Push failed");
      }
    } finally {
      setPushing(false);
      setPushProgress(0);
    }
  };

  // Build breadcrumb
  const pathParts = currentPath.split("/").filter(Boolean);

  // Pull handler
  const handlePull = async () => {
    setPulling(true);
    try {
      const res = await pullCommits(projectId, {
        branch: activeBranch,
        sinceHash: headHash,
      });
      if (res.data?.headHash) {
        setHeadHash(res.data.headHash);
      }
      setSyncStatus({ status: "up_to_date", commitsBehind: 0, headHash: res.data?.headHash });
      showFeedback("success", `Pulled ${res.data?.totalNewCommits || 0} new commit(s).`);
      fetchFiles();
    } catch (err) {
      console.error("Pull failed:", err);
      showFeedback("error", "Failed to pull latest changes.");
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Folder size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Repository</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Sync status indicator */}
          {syncStatus && syncStatus.status === "behind" && (
            <button
              onClick={handlePull}
              disabled={pulling}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
            >
              {pulling ? (
                <><Loader2 size={14} className="animate-spin" /> Pulling...</>
              ) : (
                <><RefreshCw size={14} /> {syncStatus.commitsBehind} behind &mdash; Pull</>
              )}
            </button>
          )}
          {syncStatus && syncStatus.status === "diverged" && (
            <button
              onClick={handlePull}
              disabled={pulling}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              {pulling ? (
                <><Loader2 size={14} className="animate-spin" /> Syncing...</>
              ) : (
                <><AlertTriangle size={14} /> Diverged &mdash; Pull to sync</>
              )}
            </button>
          )}
          {syncStatus && syncStatus.status === "up_to_date" && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-600">
              <CheckCircle2 size={12} /> Synced
            </span>
          )}
          {/* Branch selector */}
          <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
            <GitBranch size={14} className="text-gray-500" />
            <select
              value={activeBranch}
              onChange={(e) => {
                setActiveBranch(e.target.value);
                setCurrentPath("");
                setSelectedFile(null);
              }}
              className="text-sm bg-transparent border-none focus:ring-0 pr-4"
            >
              {branches.length === 0 && <option value="main">main</option>}
              {branches.map((b) => (
                <option key={b.branch_name} value={b.branch_name}>
                  {b.branch_name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { setShowPush(true); setShowUpload(false); }}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <UploadCloud size={14} />
            Push
          </button>
          <button
            onClick={() => { setShowUpload(!showUpload); setShowPush(false); }}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Upload size={14} />
            Add File
          </button>
        </div>
      </div>

      {/* Feedback message */}
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

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-gray-500">
        <button
          onClick={() => navigateToDir("")}
          className="hover:text-blue-600"
        >
          root
        </button>
        {pathParts.map((part, i) => (
          <React.Fragment key={i}>
            <ChevronRight size={12} />
            <button
              onClick={() => navigateToDir(pathParts.slice(0, i + 1).join("/"))}
              className="hover:text-blue-600"
            >
              {part}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Push Modal */}
      {showPush && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <UploadCloud size={16} className="text-blue-600" />
              Push Files to <span className="font-mono text-blue-600">{activeBranch}</span>
            </h4>
            <button onClick={() => { setShowPush(false); setStagedFiles([]); setPushMessage(""); }} className="p-1 hover:bg-blue-100 rounded">
              <X size={14} />
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragOver ? "border-blue-500 bg-blue-100" : "border-gray-300 bg-white hover:border-blue-400"
            }`}
            onClick={() => pushInputRef.current?.click()}
          >
            <FileUp size={28} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600">Drop files here or <span className="text-blue-600 font-medium">browse</span></p>
            <p className="text-xs text-gray-400 mt-1">Select multiple files at once</p>
            <input
              ref={pushInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { stageFilesFromInput(e.target.files); e.target.value = ""; }}
            />
          </div>

          {/* Staged files list */}
          {stagedFiles.length > 0 && (
            <div className="max-h-48 overflow-y-auto border rounded-lg bg-white divide-y">
              {stagedFiles.map((f) => (
                <div key={f.filePath} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-800 truncate font-mono text-xs">{f.filePath}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{(f.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <button onClick={() => removeStagedFile(f.filePath)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded flex-shrink-0">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Commit message */}
          {stagedFiles.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Commit Message</label>
              <input
                value={pushMessage}
                onChange={(e) => setPushMessage(e.target.value)}
                placeholder={`Push ${stagedFiles.length} file(s) to ${activeBranch}`}
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => { if (e.key === "Enter") handlePush(); }}
              />
            </div>
          )}

          {/* Progress bar */}
          {pushing && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${pushProgress}%` }}
              />
            </div>
          )}

          {/* Push button */}
          {stagedFiles.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""} staged
                ({(stagedFiles.reduce((s, f) => s + f.size, 0) / 1024).toFixed(1)} KB)
              </span>
              <button
                onClick={handlePush}
                disabled={pushing || !pushMessage.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {pushing ? (
                  <><Loader2 size={14} className="animate-spin" /> Pushing...</>
                ) : (
                  <><UploadCloud size={14} /> Push {stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""}</>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upload / Edit Form */}
      {showUpload && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">
            {editMode ? `Edit ${uploadForm.filePath}` : "Add New File"}
          </h4>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              File Path
            </label>
            <input
              value={uploadForm.filePath}
              onChange={(e) =>
                setUploadForm({ ...uploadForm, filePath: e.target.value })
              }
              placeholder="e.g. src/components/App.jsx"
              disabled={editMode}
              className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 ${editMode ? 'bg-gray-100 text-gray-500' : ''}`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Content
            </label>
            <textarea
              value={uploadForm.content}
              onChange={(e) =>
                setUploadForm({ ...uploadForm, content: e.target.value })
              }
              rows={8}
              placeholder="Paste or type file content..."
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-green-500 resize-y"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Commit Message
            </label>
            <input
              value={uploadForm.message}
              onChange={(e) =>
                setUploadForm({ ...uploadForm, message: e.target.value })
              }
              placeholder="Describe the change..."
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {uploading ? "Committing..." : editMode ? "Save Changes" : "Commit"}
            </button>
            <button
              onClick={() => { setShowUpload(false); setEditMode(false); }}
              className="px-4 py-2 bg-white text-gray-700 text-sm rounded-lg border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* File viewer */}
      {selectedFile && fileContent ? (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setFileContent(null);
                }}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <ArrowLeft size={14} />
              </button>
              <Eye size={14} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {selectedFile.file_path}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {fileContent.file_size
                  ? `${(fileContent.file_size / 1024).toFixed(1)} KB`
                  : ""}
              </span>
              <button
                onClick={handleEdit}
                className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                title="Edit file"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={handleDelete}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
                title="Delete file"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96 bg-gray-50">
            <table className="w-full">
              <tbody>
                {(fileContent.content || "").split("\n").map((line, i) => (
                  <tr key={i} className="hover:bg-yellow-50">
                    <td className="pl-4 pr-3 py-0 text-xs text-gray-400 select-none text-right align-top border-r border-gray-200 w-12 font-mono">
                      {i + 1}
                    </td>
                    <td className="pl-3 pr-4 py-0">
                      <pre className="text-sm font-mono text-gray-800 whitespace-pre">
                        {line || "\u00A0"}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading files...
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Folder size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">
            No files in this directory. Commit your first file!
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden divide-y">
          {currentPath && (
            <button
              onClick={goUp}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-sm text-gray-500"
            >
              <ArrowLeft size={14} />
              ..
            </button>
          )}
          {files
            .sort((a, b) => {
              // Directories first
              if (a.is_directory && !b.is_directory) return -1;
              if (!a.is_directory && b.is_directory) return 1;
              return a.file_path.localeCompare(b.file_path);
            })
            .map((file) => {
              const name = file.file_path.split("/").pop();
              const Icon = file.is_directory ? Folder : getIcon(name);

              return (
                <button
                  key={file.file_id || file.file_path}
                  onClick={() =>
                    file.is_directory
                      ? navigateToDir(file.file_path)
                      : openFile(file)
                  }
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-sm"
                >
                  <Icon
                    size={16}
                    className={
                      file.is_directory ? "text-blue-500" : "text-gray-400"
                    }
                  />
                  <span className="text-gray-800 flex-1">{name}</span>
                  {file.last_commit_message && (
                    <span className="text-xs text-gray-400 truncate max-w-xs">
                      {file.last_commit_message}
                    </span>
                  )}
                  {file.last_commit_date && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(file.last_commit_date).toLocaleDateString()}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default RepositoryBrowser;
