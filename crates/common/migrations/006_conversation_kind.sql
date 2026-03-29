-- Add kind column to distinguish user-initiated conversations from
-- internal sub-agent/delegation conversations.
-- Existing rows default to 'user' so they continue to appear in the main session list.
ALTER TABLE conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'user';
