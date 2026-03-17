-- ============================================================
-- Migration 050: GitHub Personal Access Tokens
-- ============================================================
-- Stores encrypted GitHub PATs for students.
-- Tokens are AES-256-GCM encrypted at rest.
-- ============================================================

CREATE TABLE IF NOT EXISTS github_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL UNIQUE REFERENCES persons(person_id) ON DELETE CASCADE,
    encrypted_token TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    github_username VARCHAR(100),
    github_avatar_url TEXT,
    token_scopes TEXT[] DEFAULT '{}',
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    last_validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_tokens_person ON github_tokens(person_id);
