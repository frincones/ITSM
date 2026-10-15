#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Generate database.types.ts from the live PostgREST schema
// ---------------------------------------------------------------------------
// `supabase gen types --project-id` needs a Management API access token,
// which is a separate credential from the service-role key and is not
// available here. But PostgREST already publishes the whole schema at
// GET /rest/v1/ as an OpenAPI document: 99 tables with every column's type,
// enum values, defaults and nullability.
//
// That is the same information the official generator emits, so this builds
// the types from it. The output is intentionally the same SHAPE the Supabase
// generator produces, so `SupabaseClient<Database>` keeps working and the
// file can be replaced by the official output later without touching
// anything else.
//
// Why this matters: six of the seven bugs found building the MCP platform
// were columns that did not exist. They compiled because the previous
// database.types.ts described 14 of 99 tables, so `.insert({ anything: 1 })`
// type-checked. With the full schema typed, those become compile errors.
//
// Usage:
//   SB_URL=... SB_KEY=... node scripts/mcp/gen-types.mjs > apps/web/lib/database.types.ts
// ---------------------------------------------------------------------------

const SB_URL = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error('Set SB_URL and SB_KEY.');
  process.exit(2);
}

/** Maps an OpenAPI property to a TypeScript type. */
function tsType(prop) {
  // A Postgres enum arrives as `enum` + a `format` naming the type. Emitting
  // the union is the whole point: it is what turns `channel: 'web'` into a
  // compile error instead of a runtime 400.
  if (Array.isArray(prop.enum) && prop.enum.length) {
    return prop.enum.map((v) => JSON.stringify(v)).join(' | ');
  }

  const fmt = String(prop.format ?? '');

  // Arrays are declared as format `type[]` rather than type: 'array'.
  if (fmt.endsWith('[]')) {
    const inner = fmt.slice(0, -2);
    return `${scalar(inner, prop)}[]`;
  }

  switch (prop.type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'unknown[]';
    case 'object':
      return 'Json';
    default:
      return scalar(fmt, prop);
  }
}

function scalar(fmt, prop) {
  if (/^(json|jsonb)$/.test(fmt)) return 'Json';
  if (/^(int|smallint|bigint|numeric|real|double)/.test(fmt)) return 'number';
  if (fmt === 'boolean') return 'boolean';
  if (prop.type === 'string' || !fmt) return 'string';
  return 'string';
}

/** PostgREST marks a column nullable by omitting it from `required`. */
function isNullable(name, def) {
  return !(def.required ?? []).includes(name);
}

/**
 * A column may be omitted on INSERT when it is nullable, has a default, or
 * is generated. Getting this wrong in either direction is worse than not
 * typing it: too strict and every insert fails to compile, too loose and the
 * NOT NULL violations this file exists to prevent slip through.
 */
/**
 * Columns a BEFORE INSERT trigger fills in.
 *
 * PostgREST marks a NOT NULL column with no DEFAULT as required, which is
 * true at the SQL level but wrong for callers: the trigger supplies the
 * value, and every insert in this codebase legitimately omits it. Without
 * this list, `tickets.insert({...})` fails to compile for want of a
 * ticket_number that the caller must not provide.
 *
 * Extracted from `NEW.<col> :=` assignments across the migrations. Re-check
 * it when a migration adds a trigger that populates a NOT NULL column.
 */
const TRIGGER_FILLED = new Set([
  'ticket_number',
  'change_number',
  'problem_number',
  'priority',
  'custom_fields',
  'sla_applies',
  'sla_contract_id',
  'sla_due_date',
  'sla_target_minutes',
  'mitigation_due_at',
  'testing_strikes',
  'last_testing_strike_at',
]);

function optionalOnInsert(name, prop, def) {
  return isNullable(name, def) || prop.default !== undefined || TRIGGER_FILLED.has(name);
}

function emitTable(name, def) {
  const props = Object.entries(def.properties ?? {});

  const row = props
    .map(([col, p]) => `          ${col}: ${tsType(p)}${isNullable(col, def) ? ' | null' : ''}`)
    .join('\n');

  const insert = props
    .map(([col, p]) => {
      const opt = optionalOnInsert(col, p, def) ? '?' : '';
      const nul = isNullable(col, def) ? ' | null' : '';
      return `          ${col}${opt}: ${tsType(p)}${nul}`;
    })
    .join('\n');

  // Every column is optional on UPDATE: a patch touches what it names.
  const update = props
    .map(([col, p]) => `          ${col}?: ${tsType(p)}${isNullable(col, def) ? ' | null' : ''}`)
    .join('\n');

  return `      ${name}: {
        Row: {
${row}
        }
        Insert: {
${insert}
        }
        Update: {
${update}
        }
        Relationships: []
      }`;
}

async function main() {
  const res = await fetch(`${SB_URL}/rest/v1/`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) {
    console.error(`PostgREST schema fetch failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const doc = await res.json();

  const definitions = Object.entries(doc.definitions ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  // Functions exposed as RPC, so `client.rpc('name', ...)` type-checks.
  const rpcNames = Object.keys(doc.paths ?? {})
    .filter((p) => p.startsWith('/rpc/'))
    .map((p) => p.slice(5))
    .sort();

  const tables = definitions.map(([name, def]) => emitTable(name, def)).join('\n');

  const functions = rpcNames
    .map(
      (fn) => `      ${fn}: {
        Args: Record<string, unknown>
        Returns: unknown
      }`,
    )
    .join('\n');

  process.stdout.write(`// ---------------------------------------------------------------------------
// GENERATED FILE — do not edit by hand.
// ---------------------------------------------------------------------------
// Produced by scripts/mcp/gen-types.mjs from the live PostgREST schema
// (GET /rest/v1/), which publishes every table, column, type, enum and
// default. Regenerate after any migration:
//
//   SB_URL=... SB_KEY=... node scripts/mcp/gen-types.mjs > apps/web/lib/database.types.ts
//
// Why not \`supabase gen types\`: that needs a Management API access token,
// a different credential from the service-role key. If you have one, its
// output is a drop-in replacement for this file — the shape is the same.
//
// Scope note: function Args/Returns are untyped. PostgREST's OpenAPI does
// not describe RPC signatures in enough detail to generate them, and a
// wrong signature would be worse than an honest \`unknown\`.
//
// Tables: ${definitions.length}
// Functions: ${rpcNames.length}
// Generated: ${new Date().toISOString()}
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // supabase-js 2.75+ reads this marker to decide which PostgREST dialect
  // the client speaks. Without it the Database generic is discarded and
  // SupabaseClient<Database> silently behaves as SupabaseClient<any> — the
  // types compile, the client validates nothing, and an invented column
  // goes straight through to a runtime 400.
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
${tables}
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
${functions}
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
`);
}

main().catch((e) => {
  console.error('generation failed:', e);
  process.exit(2);
});
