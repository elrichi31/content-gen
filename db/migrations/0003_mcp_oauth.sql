-- Up Migration

-- OAuth del MCP para ChatGPT (portado de control-gastos). Códigos y tokens se guardan solo como
-- hash SHA-256. Las funciones hacen cada canje en una transacción con FOR UPDATE: dos peticiones
-- simultáneas con el mismo código o refresh token no pueden obtener tokens las dos.
CREATE TABLE mcp_oauth_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0 AND scopes <@ ARRAY['studio:read', 'studio:write']::TEXT[]),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  revoked_at timestamptz,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_mcp_oauth_grants_user ON mcp_oauth_grants (user_id);

CREATE TABLE mcp_oauth_codes (
  code_hash TEXT PRIMARY KEY CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  grant_id uuid NOT NULL REFERENCES mcp_oauth_grants (id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes'
);

CREATE TABLE mcp_oauth_tokens (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  grant_id uuid NOT NULL REFERENCES mcp_oauth_grants (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX idx_mcp_oauth_tokens_grant ON mcp_oauth_tokens (grant_id);

-- Firmas de ChatGPT ya usadas: cada aserción vale una sola vez, también entre réplicas.
CREATE TABLE mcp_oauth_assertions (
  client_id TEXT NOT NULL,
  jti_hash TEXT NOT NULL CHECK (jti_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (client_id, jti_hash)
);
CREATE INDEX idx_mcp_oauth_assertions_expiry ON mcp_oauth_assertions (expires_at);

CREATE FUNCTION mcp_create_authorization(p_user_id TEXT, p_client_id TEXT, p_resource TEXT, p_redirect_uri TEXT, p_challenge TEXT, p_code_hash TEXT, p_scopes TEXT[])
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE gid uuid;
BEGIN
  -- Se bloquea la cuenta mientras se emite: un borrado simultáneo no deja un permiso vivo.
  PERFORM 1 FROM "user" WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO mcp_oauth_grants (user_id, client_id, resource, scopes) VALUES (p_user_id, p_client_id, p_resource, p_scopes) RETURNING id INTO gid;
  INSERT INTO mcp_oauth_codes (code_hash, grant_id, redirect_uri, challenge) VALUES (p_code_hash, gid, p_redirect_uri, p_challenge);
  RETURN gid;
END;
$$;

CREATE FUNCTION mcp_exchange_code(p_code_hash TEXT, p_client_id TEXT, p_redirect_uri TEXT, p_resource TEXT, p_challenge TEXT, p_access_hash TEXT, p_refresh_hash TEXT)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c mcp_oauth_codes; g mcp_oauth_grants;
BEGIN
  SELECT * INTO c FROM mcp_oauth_codes WHERE code_hash = p_code_hash FOR UPDATE;
  IF NOT FOUND OR c.expires_at <= now() OR c.redirect_uri <> p_redirect_uri OR c.challenge <> p_challenge THEN RETURN NULL; END IF;
  SELECT * INTO g FROM mcp_oauth_grants WHERE id = c.grant_id FOR UPDATE;
  IF NOT FOUND OR g.revoked_at IS NOT NULL OR g.expires_at <= now() OR g.client_id <> p_client_id OR g.resource <> p_resource THEN RETURN NULL; END IF;
  DELETE FROM mcp_oauth_codes WHERE code_hash = p_code_hash;
  INSERT INTO mcp_oauth_tokens (token_hash, grant_id, kind, expires_at) VALUES
    (p_access_hash, g.id, 'access', LEAST(now() + interval '15 minutes', g.expires_at)),
    (p_refresh_hash, g.id, 'refresh', g.expires_at);
  RETURN jsonb_build_object('user_id', g.user_id, 'scopes', g.scopes, 'expires_in', floor(extract(epoch FROM LEAST(now() + interval '15 minutes', g.expires_at) - now()))::INTEGER);
END;
$$;

CREATE FUNCTION mcp_refresh_tokens(p_refresh_hash TEXT, p_client_id TEXT, p_resource TEXT, p_access_hash TEXT, p_next_refresh_hash TEXT, p_scopes TEXT[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t mcp_oauth_tokens; g mcp_oauth_grants;
BEGIN
  SELECT * INTO t FROM mcp_oauth_tokens WHERE token_hash = p_refresh_hash AND kind = 'refresh' FOR UPDATE;
  IF NOT FOUND OR t.expires_at <= now() THEN RETURN NULL; END IF;
  SELECT * INTO g FROM mcp_oauth_grants WHERE id = t.grant_id FOR UPDATE;
  IF NOT FOUND OR g.revoked_at IS NOT NULL OR g.expires_at <= now() OR g.client_id <> p_client_id OR g.resource <> p_resource THEN RETURN NULL; END IF;
  -- Reusar un refresh ya canjeado es señal de robo: se revoca la conexión entera.
  IF t.consumed_at IS NOT NULL THEN
    UPDATE mcp_oauth_grants SET revoked_at = now() WHERE id = g.id;
    RETURN NULL;
  END IF;
  IF p_scopes IS NOT NULL THEN
    IF cardinality(p_scopes) = 0 OR NOT p_scopes <@ g.scopes THEN RETURN NULL; END IF;
    UPDATE mcp_oauth_grants SET scopes = p_scopes WHERE id = g.id;
    g.scopes := p_scopes;
  END IF;
  UPDATE mcp_oauth_tokens SET consumed_at = now() WHERE token_hash = p_refresh_hash;
  INSERT INTO mcp_oauth_tokens (token_hash, grant_id, kind, expires_at) VALUES
    (p_access_hash, g.id, 'access', LEAST(now() + interval '15 minutes', g.expires_at)),
    (p_next_refresh_hash, g.id, 'refresh', g.expires_at);
  RETURN jsonb_build_object('user_id', g.user_id, 'scopes', g.scopes, 'expires_in', floor(extract(epoch FROM LEAST(now() + interval '15 minutes', g.expires_at) - now()))::INTEGER);
END;
$$;

-- Valida un access token y cuenta la petición: 120 por minuto por conexión.
CREATE FUNCTION mcp_verify_access(p_token_hash TEXT, p_client_id TEXT, p_resource TEXT)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE g mcp_oauth_grants;
BEGIN
  SELECT grants.* INTO g FROM mcp_oauth_grants grants JOIN mcp_oauth_tokens tokens ON tokens.grant_id = grants.id
    WHERE tokens.token_hash = p_token_hash AND tokens.kind = 'access' AND tokens.expires_at > now()
      AND grants.client_id = p_client_id AND grants.resource = p_resource AND grants.revoked_at IS NULL AND grants.expires_at > now()
    FOR UPDATE OF grants;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF g.window_start <= now() - interval '1 minute' THEN
    UPDATE mcp_oauth_grants SET window_start = now(), request_count = 1 WHERE id = g.id;
  ELSIF g.request_count >= 120 THEN
    RETURN jsonb_build_object('rate_limited', true);
  ELSE
    UPDATE mcp_oauth_grants SET request_count = request_count + 1 WHERE id = g.id;
  END IF;
  RETURN jsonb_build_object('user_id', g.user_id, 'scopes', g.scopes, 'grant_id', g.id);
END;
$$;

CREATE FUNCTION mcp_revoke_token(p_token_hash TEXT, p_client_id TEXT, p_resource TEXT)
RETURNS void LANGUAGE sql AS $$
  UPDATE mcp_oauth_grants g SET revoked_at = now() FROM mcp_oauth_tokens t
    WHERE t.token_hash = p_token_hash AND t.grant_id = g.id AND g.client_id = p_client_id AND g.resource = p_resource;
$$;

CREATE FUNCTION mcp_consume_assertion(p_client_id TEXT, p_jti_hash TEXT, p_expires_at timestamptz)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE inserted INTEGER;
BEGIN
  IF p_client_id IS NULL OR p_jti_hash IS NULL OR p_expires_at IS NULL
     OR p_client_id <> 'https://chatgpt.com/oauth/client.json'
     OR p_jti_hash !~ '^[a-f0-9]{64}$'
     OR p_expires_at <= now()
     OR p_expires_at > now() + interval '10 minutes' THEN
    RETURN false;
  END IF;
  -- Limpieza acotada; nunca se borra una marca que aún no venció.
  DELETE FROM mcp_oauth_assertions WHERE (client_id, jti_hash) IN (
    SELECT client_id, jti_hash FROM mcp_oauth_assertions WHERE expires_at <= now() ORDER BY expires_at LIMIT 500
  );
  INSERT INTO mcp_oauth_assertions (client_id, jti_hash, expires_at) VALUES (p_client_id, p_jti_hash, p_expires_at) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted = 1;
END;
$$;

-- Cambiar la contraseña corta todas las conexiones de ChatGPT de esa persona.
CREATE FUNCTION mcp_revoke_on_password_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."password" IS DISTINCT FROM OLD."password" THEN
    UPDATE mcp_oauth_grants SET revoked_at = now() WHERE user_id = NEW."userId" AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mcp_revoke_on_password_change AFTER UPDATE OF "password" ON "account"
  FOR EACH ROW EXECUTE FUNCTION mcp_revoke_on_password_change();

-- Down Migration

DROP TRIGGER mcp_revoke_on_password_change ON "account";
DROP FUNCTION mcp_revoke_on_password_change();
DROP FUNCTION mcp_consume_assertion(TEXT, TEXT, timestamptz);
DROP FUNCTION mcp_revoke_token(TEXT, TEXT, TEXT);
DROP FUNCTION mcp_verify_access(TEXT, TEXT, TEXT);
DROP FUNCTION mcp_refresh_tokens(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);
DROP FUNCTION mcp_exchange_code(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION mcp_create_authorization(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);
DROP TABLE mcp_oauth_assertions;
DROP TABLE mcp_oauth_tokens;
DROP TABLE mcp_oauth_codes;
DROP TABLE mcp_oauth_grants;
