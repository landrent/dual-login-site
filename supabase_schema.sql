-- ============================================================
-- JALANKAN SCRIPT INI DI SUPABASE SQL EDITOR
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- Tabel: accounts
CREATE TABLE IF NOT EXISTS accounts (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT        NOT NULL,
    username_lower TEXT       NOT NULL UNIQUE,  -- untuk pencarian case-insensitive
    password      TEXT        NOT NULL,
    coins         INTEGER     NOT NULL DEFAULT 0,
    profile_photo TEXT        NOT NULL DEFAULT ''
);

-- Tabel: sell_requests
CREATE TABLE IF NOT EXISTS sell_requests (
    id              TEXT PRIMARY KEY,
    player_username TEXT        NOT NULL,
    amount          INTEGER     NOT NULL,
    provider        TEXT        NOT NULL,
    account_number  TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ
);

-- Tabel: quests
CREATE TABLE IF NOT EXISTS quests (
    id              TEXT PRIMARY KEY,
    title           TEXT        NOT NULL,
    reward          INTEGER     NOT NULL,
    duration        INTEGER     NOT NULL,
    penalty         INTEGER     NOT NULL DEFAULT 0,
    source          TEXT        NOT NULL DEFAULT 'admin',
    created_by      TEXT        NOT NULL DEFAULT 'Admin',
    target_username TEXT        NOT NULL DEFAULT '',
    priority        INTEGER     NOT NULL DEFAULT 0,
    status          TEXT,
    escrow_status   TEXT,
    escrowed_reward INTEGER,
    approved_by     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    failed_at       TIMESTAMPTZ,
    refunded_at     TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ
);

-- Tabel: player_quests
CREATE TABLE IF NOT EXISTS player_quests (
    id              TEXT PRIMARY KEY,
    quest_id        TEXT        NOT NULL,
    username        TEXT        NOT NULL,
    title           TEXT        NOT NULL,
    reward          INTEGER     NOT NULL,
    penalty         INTEGER     NOT NULL DEFAULT 0,
    source          TEXT        NOT NULL DEFAULT 'admin',
    created_by      TEXT        NOT NULL DEFAULT 'Admin',
    target_username TEXT        NOT NULL DEFAULT '',
    deadline        BIGINT      NOT NULL,  -- Unix timestamp dalam milidetik
    status          TEXT        NOT NULL DEFAULT 'pending',
    completed_at    TIMESTAMPTZ,
    failed_at       TIMESTAMPTZ,
    refunded_at     TIMESTAMPTZ,
    approved_by     TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Nonaktifkan RLS karena server kita pakai service_role key
-- (atau anon key + policy di bawah ini)
-- ============================================================

-- Opsi A: Matikan RLS (pakai service_role key di env)
ALTER TABLE accounts      DISABLE ROW LEVEL SECURITY;
ALTER TABLE sell_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE quests        DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_quests DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- INDEX untuk performa query
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_accounts_username_lower ON accounts (username_lower);
CREATE INDEX IF NOT EXISTS idx_player_quests_username  ON player_quests (username);
CREATE INDEX IF NOT EXISTS idx_player_quests_quest_id  ON player_quests (quest_id);
CREATE INDEX IF NOT EXISTS idx_player_quests_status    ON player_quests (status);
CREATE INDEX IF NOT EXISTS idx_sell_requests_status    ON sell_requests (status);
