-- ==============================================================================
-- YASUI GAME - SUPABASE OMNICHANNEL WEB CHAT SCHEMA & REALTIME CONFIGURATION
-- ==============================================================================
-- Jalankan skrip ini di: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Skrip ini akan membuat tabel chat_sessions, chat_messages, indeks performa,
-- Row Level Security (RLS), dan mengaktifkan Supabase Realtime (postgres_changes).
-- ==============================================================================

-- 1. TABEL SESI PERCAKAPAN (chat_sessions)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id TEXT PRIMARY KEY,
    visitor_token TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'human')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    buyer_name TEXT DEFAULT 'Guest',
    buyer_email TEXT,
    buyer_phone TEXT,
    context_product TEXT,
    context_order_id TEXT,
    lang TEXT NOT NULL DEFAULT 'id' CHECK (lang IN ('id', 'en')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indeks untuk pencarian cepat visitor_token & status sesi
CREATE INDEX IF NOT EXISTS idx_chat_sessions_visitor_token ON public.chat_sessions(visitor_token);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON public.chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON public.chat_sessions(created_at DESC);

-- 2. TABEL LOG PESAN PERCAKAPAN (chat_messages)
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('buyer', 'ai', 'admin', 'system')),
    message TEXT NOT NULL,
    risk_score INTEGER NOT NULL DEFAULT 0,
    telegram_msg_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indeks untuk query pesan per sesi berurutan secara kronologis
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at ASC);

-- 3. KONFIGURASI ROW LEVEL SECURITY (RLS)
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Izinkan anon key membaca dan membuat sesi chat
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'chat_sessions' AND policyname = 'Allow public select chat_sessions'
    ) THEN
        CREATE POLICY "Allow public select chat_sessions"
        ON public.chat_sessions FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'chat_sessions' AND policyname = 'Allow service_role full chat_sessions'
    ) THEN
        CREATE POLICY "Allow service_role full chat_sessions"
        ON public.chat_sessions FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Izinkan anon key membaca chat_messages untuk realtime subscriptions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Allow public select chat_messages'
    ) THEN
        CREATE POLICY "Allow public select chat_messages"
        ON public.chat_messages FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Allow service_role full chat_messages'
    ) THEN
        CREATE POLICY "Allow service_role full chat_messages"
        ON public.chat_messages FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- 4. AKTIFKAN SUPABASE REALTIME (postgres_changes)
DO $$
BEGIN
    -- Aktifkan Realtime pada tabel chat_messages
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    END IF;

    -- Aktifkan Realtime pada tabel chat_sessions (opsional untuk perubahan mode)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'chat_sessions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;
    END IF;
END $$;
