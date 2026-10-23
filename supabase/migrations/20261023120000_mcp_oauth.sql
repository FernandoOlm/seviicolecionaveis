-- Migration: Add tables for MCP OAuth integration
-- Clients registered dynamically via RFC 7591 (DCR)
CREATE TABLE IF NOT EXISTS public.mcp_oauth_clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  redirect_uris text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Authorization codes with PKCE S256 challenge (short-lived, 2 minutes)
CREATE TABLE IF NOT EXISTS public.mcp_oauth_codes (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  challenge text NOT NULL,
  resource text NOT NULL,
  scope text NOT NULL DEFAULT 'sevi-colecionaveis',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Active access sessions and refresh tokens (tokens hashed with sha256)
CREATE TABLE IF NOT EXISTS public.mcp_oauth_sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  resource text NOT NULL,
  token_hash text NOT NULL,
  refresh_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expires_at ON public.mcp_oauth_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_sessions_token_hash ON public.mcp_oauth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_sessions_refresh_hash ON public.mcp_oauth_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_sessions_user_id ON public.mcp_oauth_sessions(user_id);

ALTER TABLE public.mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_sessions ENABLE ROW LEVEL SECURITY;

-- Admins can view and revoke their own MCP sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'mcp_oauth_sessions' AND policyname = 'Admins view own mcp sessions'
  ) THEN
    CREATE POLICY "Admins view own mcp sessions" ON public.mcp_oauth_sessions
      FOR SELECT USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'mcp_oauth_sessions' AND policyname = 'Admins revoke own mcp sessions'
  ) THEN
    CREATE POLICY "Admins revoke own mcp sessions" ON public.mcp_oauth_sessions
      FOR UPDATE USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;
