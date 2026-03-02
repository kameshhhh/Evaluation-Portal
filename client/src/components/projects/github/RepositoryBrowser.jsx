// ================================================================
// REPOSITORY BROWSER — GitHub-Lite File Explorer
// ================================================================
// Tree-based file explorer with code viewer. Allows browsing,
// viewing file content, and committing new/updated files.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import {
  getFiles,
  getFile,
  commitFile,
  getBranches,
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

const RepositoryBrowser = ({ projectId }) => {
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
    file_path: "",
    content: "",
    commit_message: "",
  });
  const [uploading, setUploading] = useState(false);

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

  useEffect(() => {
    fetchFiles();
    fetchBranches();
  }, [fetchFiles, fetchBranches]);

  const openFile = async (file) => {
    try {
      const res = await getFile(projectId, file.file_path);
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
      !uploadForm.file_path ||
      !uploadForm.content ||
      !uploadForm.commit_message
    )
      return;
    setUploading(true);
    try {
      await commitFile(projectId, {
        ...uploadForm,
        branch: activeBranch,
      });
      setShowUpload(false);
      setUploadForm({ file_path: "", content: "", commit_message: "" });
      fetchFiles();
    } catch (err) {
      console.error("Commit failed:", err);
    } finally {
      setUploading(false);
    }
  };

  // Build breadcrumb
  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Folder size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Repository</h3>
        </div>
        <div className="flex items-center gap-2">
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
            onClick={() => setShowUpload(!showUpload)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Upload size={14} />
            Commit File
          </button>
        </div>
      </div>

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

      {/* Upload Form */}
      {showUpload && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              File Path
            </label>
            <input
              value={uploadForm.file_path}
              onChange={(e) =>
                setUploadForm({ ...uploadForm, file_path: e.target.value })
              }
              placeholder="e.g. src/components/App.jsx"
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
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
              value={uploadForm.commit_message}
              onChange={(e) =>
                setUploadForm({ ...uploadForm, commit_message: e.target.value })
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
              {uploading ? "Committing..." : "Commit"}
            </button>
            <button
              onClick={() => setShowUpload(false)}
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
            <span className="text-xs text-gray-400">
              {fileContent.size_bytes
                ? `${(fileContent.size_bytes / 1024).toFixed(1)} KB`
                : ""}
            </span>
          </div>
          <pre className="p-4 text-sm font-mono text-gray-800 overflow-x-auto max-h-96 whitespace-pre-wrap bg-gray-50">
            {fileContent.content || "Empty file"}
          </pre>
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
                  <span className="text-gray-800">{name}</span>
                  {file.last_commit_message && (
                    <span className="text-xs text-gray-400 truncate ml-auto max-w-xs">
                      {file.last_commit_message}
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
