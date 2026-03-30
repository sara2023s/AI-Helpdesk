-- Appdoers AI Helpdesk — Supabase Schema
-- Run this in your Supabase SQL editor to set up the database.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- TICKETS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id           TEXT PRIMARY KEY,
  title        TEXT        NOT NULL,
  description  TEXT        NOT NULL,
  type         TEXT        NOT NULL DEFAULT 'feature',
  priority     TEXT        NOT NULL DEFAULT 'P2',
  project      TEXT        NOT NULL DEFAULT 'General',
  status       TEXT        NOT NULL DEFAULT 'new',
  assigned_to  TEXT,
  plan         TEXT,
  action_items JSONB       NOT NULL DEFAULT '[]',
  tags         JSONB       NOT NULL DEFAULT '[]',
  comments     JSONB       NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full row in realtime change events (needed for UPDATE/DELETE payloads)
ALTER TABLE tickets REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────
-- AGENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id                TEXT PRIMARY KEY,
  name              TEXT        NOT NULL,
  role              TEXT        NOT NULL,
  emoji             TEXT        NOT NULL,
  color             TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'idle',
  current_ticket_id TEXT,
  last_active_at    TIMESTAMPTZ
);

ALTER TABLE agents REPLICA IDENTITY FULL;

-- Seed the six named workers (safe to run multiple times)
INSERT INTO agents (id, name, role, emoji, color, status) VALUES
  ('manager',    'Max',   'Project Manager', '🧠', '#7c3aed', 'idle'),
  ('designer',   'Aria',  'UI/UX Designer',  '🎨', '#db2777', 'idle'),
  ('developer',  'Dev',   'Developer',       '💻', '#0891b2', 'idle'),
  ('copywriter', 'Kai',   'Copywriter',      '✍️', '#059669', 'idle'),
  ('tester',     'Quinn', 'QA Tester',       '🧪', '#9333ea', 'idle'),
  ('reviewer',   'Ray',   'Code Reviewer',   '🔍', '#b45309', 'idle')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────
-- USAGE CALLS  (token tracking)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_calls (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id   TEXT        NOT NULL,
  tokens     INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast range queries for 5-hour and 7-day windows
CREATE INDEX IF NOT EXISTS idx_usage_calls_created_at ON usage_calls (created_at ASC);

-- ─────────────────────────────────────────
-- REALTIME PUBLICATION
-- Add tickets and agents to the supabase_realtime publication so the
-- frontend receives live updates via Supabase Realtime channels.
-- ─────────────────────────────────────────
DO $$
BEGIN
  -- tickets
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
  END IF;
  -- agents
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'agents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agents;
  END IF;
END $$;
