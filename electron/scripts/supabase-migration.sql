-- ============================================================
-- Supabase License System — v2.4.0+
-- Replace GitHub Gist activation registry with Supabase
-- ============================================================

-- Run via Supabase Dashboard > SQL Editor
-- OR: supabase db execute --project-ref ndssbmedzbjutnfznale -f migration.sql

-- ============================================================
-- TABLE 1: licenses
-- Stores signed license key payloads (Ed25519-signed, offline-verified)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.licenses (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash    text    NOT NULL UNIQUE,
  payload     jsonb   NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Index for fast lookup by key hash
CREATE UNIQUE INDEX IF NOT EXISTS licenses_key_hash_idx ON public.licenses(key_hash);

-- ============================================================
-- TABLE 2: activations
-- Maps key_hash → machine bindings (one key = one machine)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activations (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash     text    NOT NULL,
  machine_id   text    NOT NULL,
  email        text,
  machine_name text,
  activated_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  CONSTRAINT activations_key_machine_uniq UNIQUE (key_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS activations_key_hash_idx ON public.activations(key_hash);

-- ============================================================
-- TABLE 3: revoked_keys
-- Key hashes on this list = permanently killed
-- ============================================================
CREATE TABLE IF NOT EXISTS public.revoked_keys (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash   text    NOT NULL UNIQUE,
  reason     text,
  revoked_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS revoked_keys_key_hash_idx ON public.revoked_keys(key_hash);

-- ============================================================
-- Auto-update last_seen_at on activation revalidation
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_activation(p_key_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.activations
  SET last_seen_at = now()
  WHERE key_hash = p_key_hash;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

-- licenses: readable by anon (app checks signature client-side),
-- writable only by service_role (via license-manager CLI)
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_licenses" ON public.licenses FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_licenses" ON public.licenses FOR ALL TO service_role USING (true);

-- activations: anon can INSERT (for first-time activation) and SELECT (to check machine mismatch),
-- service_role can do everything
ALTER TABLE public.activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_activations" ON public.activations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_activations" ON public.activations FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_activations_touch" ON public.activations FOR UPDATE TO anon
  USING (true)
  WITH CHECK (
    last_seen_at = activated_at OR (activated_at = activated_at)
  );
CREATE POLICY "service_write_activations" ON public.activations FOR ALL TO service_role USING (true);

-- revoked_keys: readable + writable by anon (read for revocation check on activation,
-- write only needed for migration from Gist — ideally service_role only)
ALTER TABLE public.revoked_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_revoked_keys" ON public.revoked_keys FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_revoked_keys" ON public.revoked_keys FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service_write_revoked_keys" ON public.revoked_keys FOR ALL TO service_role USING (true);
