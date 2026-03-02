// ============================================================
// MEMBER PHOTO UPLOAD — SRS 4.1.1 Member Photo Component
// ============================================================
// Allows team members to upload/display profile photos.
// Photos appear in: member list, commit history, activity feed.
// DOES NOT modify any existing components.
// ============================================================

import React, { useState, useRef } from "react";
import { Camera, Upload, X, Check } from "lucide-react";
import { updateMemberProfile } from "../../../services/projectEnhancementApi";

const MemberPhotoUpload = ({
  projectId,
  personId,
  currentPhotoUrl,
  onUpdate,
}) => {
  const [preview, setPreview] = useState(currentPhotoUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Only JPG, PNG, or WebP images allowed");
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!preview || preview === currentPhotoUrl) return;

    setUploading(true);
    setError(null);
    try {
      // In production, upload to S3/MinIO and get URL.
      // For now, store the data URL or a placeholder.
      const result = await updateMemberProfile(projectId, personId, {
        photo_url: preview,
      });
      if (onUpdate) onUpdate(result.data);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Photo Preview */}
      <div className="relative w-24 h-24 rounded-full overflow-hidden bg-gray-200 border-2 border-gray-300">
        {preview ? (
          <img
            src={preview}
            alt="Member avatar"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <Camera size={32} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-lg hover:bg-blue-100 transition-colors">
          <Upload size={14} />
          Choose Photo
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>

        {preview && preview !== currentPhotoUrl && (
          <>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Check size={14} />
              {uploading ? "Saving..." : "Save"}
            </button>
            <button
              onClick={handleRemove}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 text-sm rounded-lg hover:bg-red-100 transition-colors"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>

      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
};

export default MemberPhotoUpload;
