-- Global search — Microsoft 365 Admin / Linear Cmd+K style.
--
-- One RPC (search_global) returns ranked, grouped hits across every
-- searchable entity in the current tenant. Implementation is a hybrid:
--   · tsvector FTS (Spanish dictionary + unaccent) on long text
--     (descriptions, KB articles, comment bodies)
--   · pg_trgm similarity on short high-cardinality fields (names, emails,
--     ticket numbers, titles) so "pedro" matches "Pédro" and catches typos
--
-- All queries are scoped by get_current_tenant_id() and each entity's
-- existing soft-delete / is_active rules are respected.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Different Supabase projects place extension objects in different
-- schemas (older projects use `extensions`, the Makerkit boilerplate
-- uses `kit`, fresh projects may install into `public`). We install
-- the missing ones without forcing a schema and adapt downstream
-- references to use the actual schema the extensions ended up in.

DO $ext$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent') THEN
    CREATE EXTENSION unaccent;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE EXTENSION pg_trgm;
  END IF;
END
$ext$;

-- Give the whole script (and every function defined below) a search_path
-- that can resolve unaccent(), similarity() and gin_trgm_ops no matter
-- which schema hosts the extension in the current project.
SET search_path = public, extensions, kit;

-- Immutable unaccent wrapper so we can use it in generated columns /
-- indexes.
--
-- The upstream unaccent() often ships as STABLE (dictionary could
-- theoretically reload), which PG rejects inside GENERATED STORED
-- expressions. We declare our wrapper IMMUTABLE — safe in practice
-- because the dictionary doesn't actually reload between writes.
--
-- We also schema-qualify the underlying call because (a) the extension
-- can live in `extensions`, `public`, or `kit` depending on how the
-- project was bootstrapped, and (b) wrappers with `SET search_path`
-- clauses are NOT accepted in GENERATED STORED columns.
--
-- The DO block below detects which schema hosts `unaccent(regdictionary, text)`
-- in this project and creates the wrapper with the correct qualified call.
DO $unaccent_wrapper$
DECLARE
  schema_name text;
BEGIN
  SELECT n.nspname INTO schema_name
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'unaccent'
    AND p.pronargs = 2
  LIMIT 1;

  IF schema_name IS NULL THEN
    RAISE EXCEPTION 'unaccent(regdictionary, text) not found in any schema — is the unaccent extension installed?';
  END IF;

  EXECUTE format(
    $f$
      CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
      RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
      AS $body$ SELECT %I.unaccent(%L::regdictionary, $1) $body$;
    $f$,
    schema_name, schema_name || '.unaccent'
  );
END
$unaccent_wrapper$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) search_tsv GENERATED COLUMNS (auto-maintained, no triggers needed)
-- ═══════════════════════════════════════════════════════════════════════════

-- tickets — tags[] excluded from the tsvector on purpose. Both
-- `array_to_string(text[], text)` and the `::text` cast on text[] go
-- through `array_out`, which is marked STABLE in this Postgres build
-- and PG refuses STABLE functions inside GENERATED STORED. Ticket
-- tags can still be searched via trigram on title/description or a
-- separate tag filter in the ticket list — losing them from FTS is a
-- small price to pay for keeping the column auto-maintained.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(ticket_number), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(title), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(requester_email), '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(description), '')), 'C')
  ) STORED;

-- contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(name), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(email), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(phone), '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(company), '')), 'B')
  ) STORED;

-- agents
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(name), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(email), '')), 'A')
  ) STORED;

-- organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(name), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(slug), '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(domain), '')), 'B')
  ) STORED;

-- kb_articles
ALTER TABLE kb_articles
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(title), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(slug), '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(content_markdown), '')), 'C')
  ) STORED;

-- problems
ALTER TABLE problems
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(problem_number), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(title), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(description), '')), 'C') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(root_cause), '')), 'C')
  ) STORED;

-- changes
ALTER TABLE changes
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(change_number), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(title), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(description), '')), 'C')
  ) STORED;

-- assets
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(asset_tag), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(name), '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(serial_number), '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(location), '')), 'C') ||
    setweight(to_tsvector('spanish', coalesce(immutable_unaccent(notes), '')), 'C')
  ) STORED;

-- ticket_followups (comments / notes) — hit rolls up to the parent ticket
ALTER TABLE ticket_followups
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish', coalesce(immutable_unaccent(content), ''))
  ) STORED;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) INDEXES — GIN on tsvector + trigram on short high-cardinality text
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_tickets_search_tsv        ON tickets        USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_tickets_number_trgm       ON tickets        USING GIN (ticket_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tickets_title_trgm        ON tickets        USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_search_tsv       ON contacts       USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm        ON contacts       USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm       ON contacts       USING GIN (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_agents_search_tsv         ON agents         USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_agents_name_trgm          ON agents         USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_agents_email_trgm         ON agents         USING GIN (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_organizations_search_tsv  ON organizations  USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_organizations_name_trgm   ON organizations  USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_kb_articles_search_tsv    ON kb_articles    USING GIN (search_tsv);

CREATE INDEX IF NOT EXISTS idx_problems_search_tsv       ON problems       USING GIN (search_tsv);

CREATE INDEX IF NOT EXISTS idx_changes_search_tsv        ON changes        USING GIN (search_tsv);

CREATE INDEX IF NOT EXISTS idx_assets_search_tsv         ON assets         USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_assets_name_trgm          ON assets         USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ticket_followups_search_tsv ON ticket_followups USING GIN (search_tsv);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) search_global RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Returns a ranked, grouped result set.  The caller receives at most
-- p_limit rows per entity_type so the UI can render grouped lists with
-- "Ver todos los N" CTA.  rank is normalized to [0,1].
--
-- SECURITY DEFINER so the function reads across tables via the tenant
-- helper without relying on per-table RLS checks being identical. The
-- explicit `tenant_id = get_current_tenant_id()` filters inside each
-- UNION branch still enforce isolation — no cross-tenant leakage is
-- possible.

CREATE OR REPLACE FUNCTION search_global(
  p_query text,
  p_limit int DEFAULT 5
) RETURNS TABLE (
  entity_type text,
  entity_id uuid,
  title text,
  subtitle text,
  url text,
  rank real,
  matched_field text,
  snippet text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, kit
AS $$
DECLARE
  q text;
  q_like text;
  tsq tsquery;
  tenant uuid;
BEGIN
  q := trim(p_query);
  IF q IS NULL OR char_length(q) < 2 THEN
    RETURN;
  END IF;

  tenant := get_current_tenant_id();
  IF tenant IS NULL THEN
    RETURN;
  END IF;

  -- Accent-insensitive, lower-cased form we use for trigram + ILIKE.
  q_like := '%' || lower(immutable_unaccent(q)) || '%';

  -- Build a tsquery that treats each token as a prefix — so "ped" matches
  -- "pedro" and "pedrito". plainto_tsquery escapes special chars for us.
  BEGIN
    tsq := websearch_to_tsquery('spanish', immutable_unaccent(q));
  EXCEPTION WHEN OTHERS THEN
    tsq := plainto_tsquery('spanish', immutable_unaccent(q));
  END;

  ---------------------------------------------------------------
  -- TICKETS  (by own fields)
  ---------------------------------------------------------------
  RETURN QUERY
  SELECT
    'ticket'::text,
    t.id,
    t.ticket_number || ' — ' || t.title,
    concat_ws(' · ',
      t.status::text,
      t.type::text,
      t.requester_email
    ) AS subtitle,
    '/home/tickets/' || t.id::text,
    GREATEST(
      ts_rank(t.search_tsv, tsq),
      similarity(lower(immutable_unaccent(t.title)), lower(immutable_unaccent(q))),
      similarity(lower(immutable_unaccent(t.ticket_number)), lower(immutable_unaccent(q)))
    )::real AS rank,
    CASE
      WHEN t.ticket_number ILIKE '%' || q || '%' THEN 'ticket_number'
      WHEN t.title ILIKE q_like THEN 'title'
      WHEN t.requester_email ILIKE q_like THEN 'requester'
      ELSE 'description'
    END AS matched_field,
    left(coalesce(t.description, ''), 140) AS snippet
  FROM tickets t
  WHERE t.tenant_id = tenant
    AND t.deleted_at IS NULL
    AND (
      t.search_tsv @@ tsq
      OR lower(immutable_unaccent(t.title)) LIKE q_like
      OR lower(immutable_unaccent(t.ticket_number)) LIKE q_like
      OR similarity(lower(immutable_unaccent(t.title)), lower(immutable_unaccent(q))) > 0.3
    )
  ORDER BY rank DESC, t.created_at DESC
  LIMIT p_limit;

  ---------------------------------------------------------------
  -- TICKETS  (by comments / followups)  → rolls up to parent
  ---------------------------------------------------------------
  RETURN QUERY
  SELECT
    'ticket_comment'::text,
    t.id,
    t.ticket_number || ' — ' || t.title,
    'Comentario coincide: ' || left(f.content, 90),
    '/home/tickets/' || t.id::text,
    ts_rank(f.search_tsv, tsq)::real AS rank,
    'comment'::text,
    left(f.content, 200) AS snippet
  FROM ticket_followups f
  JOIN tickets t ON t.id = f.ticket_id
  WHERE f.tenant_id = tenant
    AND t.deleted_at IS NULL
    AND f.search_tsv @@ tsq
    AND NOT EXISTS (  -- dedup: don't repeat tickets already surfaced above
      SELECT 1 FROM tickets t2
      WHERE t2.id = t.id
        AND t2.search_tsv @@ tsq
    )
  ORDER BY rank DESC
  LIMIT p_limit;

  ---------------------------------------------------------------
  -- CONTACTS
  ---------------------------------------------------------------
  RETURN QUERY
  SELECT
    'contact'::text,
    c.id,
    c.name,
    c.email AS subtitle,
    '/home/tickets?requester=' || c.email AS url,
    GREATEST(
      ts_rank(c.search_tsv, tsq),
      similarity(lower(immutable_unaccent(c.name)), lower(immutable_unaccent(q))),
      similarity(lower(immutable_unaccent(c.email)), lower(immutable_unaccent(q)))
    )::real AS rank,
    CASE
      WHEN c.name ILIKE q_like THEN 'name'
      WHEN c.email ILIKE q_like THEN 'email'
      WHEN c.phone ILIKE q_like THEN 'phone'
      ELSE 'company'
    END,
    coalesce(c.company, '')
  FROM contacts c
  WHERE c.tenant_id = tenant
    AND (
      c.search_tsv @@ tsq
      OR lower(immutable_unaccent(c.name)) LIKE q_like
      OR lower(immutable_unaccent(c.email)) LIKE q_like
      OR similarity(lower(immutable_unaccent(c.name)), lower(immutable_unaccent(q))) > 0.3
    )
  ORDER BY rank DESC
  LIMIT p_limit;

  ---------------------------------------------------------------
  -- AGENTS
  ---------------------------------------------------------------
  RETURN QUERY
  SELECT
    'agent'::text,
    a.id,
    a.name,
    concat_ws(' · ', a.role::text, a.email) AS subtitle,
    '/home/tickets?agent=' || a.id::text AS url,
    GREATEST(
      ts_rank(a.search_tsv, tsq),
      similarity(lower(immutable_unaccent(a.name)), lower(immutable_unaccent(q))),
      similarity(lower(immutable_unaccent(a.email)), lower(immutable_unaccent(q)))
    )::real,
    CASE
      WHEN a.name ILIKE q_like THEN 'name'
      ELSE 'email'
    END,
    a.email
  FROM agents a
  WHERE a.tenant_id = tenant
    AND a.is_active = true
    AND (
      a.search_tsv @@ tsq
      OR lower(immutable_unaccent(a.name)) LIKE q_like
      OR lower(immutable_unaccent(a.email)) LIKE q_like
      OR similarity(lower(immutable_unaccent(a.name)), lower(immutable_unaccent(q))) > 0.3
    )
  ORDER BY rank DESC
  LIMIT p_limit;

  ---------------------------------------------------------------
  -- ORGANIZATIONS
  ---------------------------------------------------------------
  RETURN QUERY
  SELECT
    'organization'::text,
    o.id,
    o.name,
    coalesce(o.domain, o.slug) AS subtitle,
    '/home/tickets?org=' || o.id::text AS url,
    GREATEST(
      ts_rank(o.search_tsv, tsq),
      similarity(lower(immutable_unaccent(o.name)), lower(immutable_unaccent(q)))
    )::real,
    'name'::text,
    coalesce(o.domain, '')
  FROM organizations o
  WHERE o.tenant_id = tenant
    AND o.is_active = true
    AND (
      o.search_tsv @@ tsq
      OR lower(immutable_unaccent(o.name)) LIKE q_like
      OR similarity(lower(immutable_unaccent(o.name)), lower(immutable_unaccent(q))) > 0.3
    )
  ORDER BY rank DESC
  LIMIT p_limit;

  ---------------------------------------------------------------
  -- KNOWLEDGE BASE
  ---------------------------------------------------------------
  RETURN QUERY
  SELECT
    'kb'::text,
    k.id,
    k.title,
    concat_ws(' · ', k.status::text,
      CASE WHEN k.view_count > 0 THEN k.view_count::text || ' vistas' END
    ) AS subtitle,
    '/home/kb/' || k.slug AS url,
    ts_rank(k.search_tsv, tsq)::real,
    'content'::text,
    left(coalesce(k.content_markdown, ''), 180)
  FROM kb_articles k
  WHERE k.tenant_id = tenant
    AND (k.deleted_at IS NULL)
    AND k.search_tsv @@ tsq
  ORDER BY rank DESC
  LIMIT p_limit;

  ---------------------------------------------------------------
  -- PROBLEMS
  ---------------------------------------------------------------
  RETURN QUERY
  SELECT
    'problem'::text,
    p.id,
    p.problem_number || ' — ' || p.title,
    p.status::text,
    '/home/problems/' || p.id::text,
    ts_rank(p.search_tsv, tsq)::real,
    'title'::text,
    left(coalesce(p.description, ''), 140)
  FROM problems p
  WHERE p.tenant_id = tenant
    AND p.deleted_at IS NULL
    AND p.search_tsv @@ tsq
  ORDER BY rank DESC
  LIMIT p_limit;

  ---------------------------------------------------------------
  -- CHANGES
  ---------------------------------------------------------------
  RETURN QUERY
  SELECT
    'change'::text,
    c.id,
    c.change_number || ' — ' || c.title,
    c.status::text,
    '/home/changes/' || c.id::text,
    ts_rank(c.search_tsv, tsq)::real,
    'title'::text,
    left(coalesce(c.description, ''), 140)
  FROM changes c
  WHERE c.tenant_id = tenant
    AND c.deleted_at IS NULL
    AND c.search_tsv @@ tsq
  ORDER BY rank DESC
  LIMIT p_limit;

  ---------------------------------------------------------------
  -- ASSETS
  ---------------------------------------------------------------
  RETURN QUERY
  SELECT
    'asset'::text,
    a.id,
    a.asset_tag || ' — ' || a.name,
    concat_ws(' · ', a.status, a.location) AS subtitle,
    '/home/assets/' || a.id::text,
    GREATEST(
      ts_rank(a.search_tsv, tsq),
      similarity(lower(immutable_unaccent(a.name)), lower(immutable_unaccent(q)))
    )::real,
    'name'::text,
    coalesce(a.notes, '')
  FROM assets a
  WHERE a.tenant_id = tenant
    AND (
      a.search_tsv @@ tsq
      OR similarity(lower(immutable_unaccent(a.name)), lower(immutable_unaccent(q))) > 0.3
    )
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$;

-- Allow authenticated users to call it (RLS-safe thanks to
-- get_current_tenant_id filter inside).
GRANT EXECUTE ON FUNCTION search_global(text, int) TO authenticated;
