// ============================================================
// MEMBER SCOPE EDITOR — SRS 4.1.1 Individual Responsibilities
// ============================================================
// Allows each member to define their scope/responsibilities.
// Includes technical stack tags and share percentage display.
// DOES NOT modify any existing components.
// ============================================================

import React, { useState } from "react";
import { Save, Tag, Percent } from "lucide-react";
import { updateMemberProfile } from "../../../services/projectEnhancementApi";

const MemberScopeEditor = ({ projectId, personId, member, onUpdate }) => {
  const [scope, setScope] = useState(member?.defined_scope || "");
  const [techStack, setTechStack] = useState(member?.technical_stack || []);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateMemberProfile(projectId, personId, {
        defined_scope: scope,
        technical_stack: techStack,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (onUpdate) onUpdate(result.data);
    } catch (err) {
      console.error("Failed to save scope:", err);
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !techStack.includes(tag)) {
      setTechStack([...techStack, tag]);
      setNewTag("");
    }
  };

  const removeTag = (tag) => {
    setTechStack(techStack.filter((t) => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900 text-sm">
          {member?.display_name || "Team Member"}
        </h4>
        {member?.declared_share_percentage != null && (
          <span className="inline-flex items-center gap-1 text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
            <Percent size={12} />
            {member.declared_share_percentage}%
          </span>
        )}
      </div>

      {/* Scope Text Area */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Defined Scope / Responsibilities
        </label>
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={3}
          placeholder="Describe this member's individual responsibilities..."
          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
        />
      </div>

      {/* Technical Stack Tags */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Technical Stack
        </label>
        <div className="flex flex-wrap gap-1 mb-2">
          {techStack.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full"
            >
              <Tag size={10} />
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="text-gray-400 hover:text-red-500 ml-0.5"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add tech (e.g., React, Node.js)..."
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addTag}
            disabled={!newTag.trim()}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
          saved
            ? "bg-green-600 text-white"
            : "bg-blue-600 text-white hover:bg-blue-700"
        } disabled:opacity-50`}
      >
        <Save size={14} />
        {saving ? "Saving..." : saved ? "Saved!" : "Save Scope"}
      </button>
    </div>
  );
};

export default MemberScopeEditor;
