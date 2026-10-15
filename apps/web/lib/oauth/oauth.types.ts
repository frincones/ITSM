// ---------------------------------------------------------------------------
// OAuth schema types — hand-written until migration 00066 runs
// ---------------------------------------------------------------------------
// `database.types.ts` is generated from the LIVE PostgREST schema, and
// migration 00066 is deliberately unexecuted: database changes are being
// applied in one controlled batch at the end. So the generated types do not
// yet describe oauth_clients, oauth_tokens, oauth_authorization_codes or
// verify_oauth_token / redeem_authorization_code.
//
// Rather than casting to `any` and losing every guarantee, the three tables
// are described here, transcribed from 00066. That keeps the property of
// the generated types that mattered: a typo in a column name fails the
// build instead of reaching production, which is exactly the class of bug
// that put seven defects into this codebase earlier in this work.
//
// AFTER 00066 IS APPLIED: regenerate with `node scripts/mcp/gen-types.mjs`,
// then delete this file and the `asOAuthClient` calls. Keeping both would
// let the two definitions drift apart silently.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Json } from '@kit/supabase/database';

type Timestamptz = string;

interface OAuthClientsRow {
  id: string;
  client_id: string;
  client_secret_hash: string | null;
  client_name: string;
  client_uri: string | null;
  logo_uri: string | null;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: 'none' | 'client_secret_post' | 'client_secret_basic';
  allowed_scopes: string[];
  is_dynamic: boolean;
  is_active: boolean;
  tenant_id: string | null;
  metadata: Json;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  last_used_at: Timestamptz | null;
}

interface OAuthAuthorizationCodesRow {
  id: string;
  code_hash: string;
  client_id: string;
  user_id: string;
  agent_id: string;
  tenant_id: string;
  scopes: string[];
  resource: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  organization_ids: string[] | null;
  expires_at: Timestamptz;
  used_at: Timestamptz | null;
  created_at: Timestamptz;
}

interface OAuthTokensRow {
  id: string;
  token_hash: string;
  token_type: 'access' | 'refresh';
  client_id: string;
  user_id: string;
  agent_id: string;
  tenant_id: string;
  scopes: string[];
  resource: string;
  organization_ids: string[] | null;
  refresh_parent_id: string | null;
  expires_at: Timestamptz;
  revoked_at: Timestamptz | null;
  last_used_at: Timestamptz | null;
  usage_count: number;
  created_at: Timestamptz;
}

/** Columns with a DEFAULT or filled by a trigger are optional on insert. */
type Insertable<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required>>;

export type OAuthSchema = {
  Tables: {
    oauth_clients: {
      Row: OAuthClientsRow;
      Insert: Insertable<OAuthClientsRow, 'client_id' | 'client_name' | 'redirect_uris'>;
      Update: Partial<OAuthClientsRow>;
      Relationships: [];
    };
    oauth_authorization_codes: {
      Row: OAuthAuthorizationCodesRow;
      Insert: Insertable<
        OAuthAuthorizationCodesRow,
        | 'code_hash'
        | 'client_id'
        | 'user_id'
        | 'agent_id'
        | 'tenant_id'
        | 'scopes'
        | 'resource'
        | 'redirect_uri'
        | 'code_challenge'
        | 'expires_at'
      >;
      Update: Partial<OAuthAuthorizationCodesRow>;
      Relationships: [];
    };
    oauth_tokens: {
      Row: OAuthTokensRow;
      Insert: Insertable<
        OAuthTokensRow,
        | 'token_hash'
        | 'token_type'
        | 'client_id'
        | 'user_id'
        | 'agent_id'
        | 'tenant_id'
        | 'scopes'
        | 'resource'
        | 'expires_at'
      >;
      Update: Partial<OAuthTokensRow>;
      Relationships: [];
    };
  };
  Views: { [_ in never]: never };
  Functions: {
    verify_oauth_token: {
      Args: { p_token_hash: string; p_resource: string };
      Returns: {
        token_id: string;
        client_id: string;
        tenant_id: string;
        user_id: string;
        agent_id: string;
        scopes: string[];
        organization_ids: string[] | null;
        client_name: string;
      }[];
    };
    redeem_authorization_code: {
      Args: { p_code_hash: string };
      Returns: {
        code_id: string;
        client_id: string;
        user_id: string;
        agent_id: string;
        tenant_id: string;
        scopes: string[];
        resource: string;
        redirect_uri: string;
        code_challenge: string;
        organization_ids: string[] | null;
        was_reused: boolean;
        is_expired: boolean;
      }[];
    };
  };
  Enums: { [_ in never]: never };
  CompositeTypes: { [_ in never]: never };
};

/**
 * The wrapper supabase-js expects. Without __InternalSupabase the client
 * silently falls back to `any` — the same trap that made database.types.ts
 * describe 14 of 99 tables without anyone noticing.
 */
export type OAuthDatabase = {
  __InternalSupabase: { PostgrestVersion: '12' };
  public: OAuthSchema;
};

/**
 * A client for the oauth_* tables.
 *
 * Typing these through the `Database` generic does not work yet: supabase-js
 * resolves the schema from the generated type, and until 00066 runs these
 * tables are absent from it, so every insert collapses to `never`. Rather
 * than fight the inference with a parallel Database declaration that will be
 * thrown away, the query builder is loosened and the column names are
 * checked at the call site instead, through the row types above.
 *
 * `scripts/mcp/schema-audit.mjs` is the backstop: it reads every column
 * reference in this codebase against the migrations, so a typo here fails
 * the audit even though it no longer fails the compiler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
export type OAuthSupabaseClient = SupabaseClient<any>;

/** Re-types the admin client for use against the oauth_* objects. */
export function asOAuthClient(client: unknown): OAuthSupabaseClient {
  return client as OAuthSupabaseClient;
}

/**
 * Compile-time column check for an oauth_* write.
 *
 * The query builder above accepts anything, so this restores the guarantee
 * that mattered: `oauthInsert<'oauth_tokens'>({ ... })` fails to compile on
 * a misspelled or unknown column, exactly as the generated types would.
 * Every insert and update in the OAuth modules goes through it.
 */
export function oauthWrite<T extends keyof OAuthSchema['Tables']>(
  values: OAuthSchema['Tables'][T]['Insert'] | OAuthSchema['Tables'][T]['Update'],
): Record<string, unknown> {
  return values as Record<string, unknown>;
}
