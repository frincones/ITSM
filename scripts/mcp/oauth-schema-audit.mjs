// ---------------------------------------------------------------------------
// OAuth schema audit
// ---------------------------------------------------------------------------
//   node scripts/mcp/oauth-schema-audit.mjs
//
// Why this exists separately from schema-audit.mjs
// -----------------------------------------------
// schema-audit.mjs checks column references against the LIVE PostgREST
// schema. The oauth_* tables are not live yet: migration 00066 is held back
// deliberately so every database change is applied in one reviewed batch.
//
// That leaves the OAuth code with no automated check at all, which is
// exactly the gap that let seven invented-column bugs reach production
// earlier in this work. So this script reads the migration as the source of
// truth instead of the database, and verifies two things:
//
//   1. lib/oauth/oauth.types.ts matches the migration column for column.
//      Those hand-written types are what the compiler checks writes
//      against, so if they drift from the SQL the compiler is confirming a
//      fiction.
//   2. Every column the OAuth code reads, writes or filters on exists.
//
// AFTER 00066 IS APPLIED: regenerate the types, delete oauth.types.ts, and
// delete this script — schema-audit.mjs then covers these tables for real.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = 'apps/web/supabase/migrations/00066_oauth_authorization_server.sql';
const TYPES_FILE = 'apps/web/lib/oauth/oauth.types.ts';
const CODE_DIRS = ['apps/web/lib/oauth', 'apps/web/app/api/oauth', 'apps/web/app/oauth'];

/** Row interfaces in oauth.types.ts, mapped to the table each describes. */
const TYPE_BLOCKS = {
  oauth_clients: 'OAuthClientsRow',
  oauth_authorization_codes: 'OAuthAuthorizationCodesRow',
  oauth_tokens: 'OAuthTokensRow',
};

const SQL_TYPES = 'uuid|text|boolean|timestamptz|jsonb|bigint|integer';

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Columns declared per table in the migration. */
function parseMigration(sql) {
  const tables = {};
  const re = /CREATE TABLE (oauth_\w+) \(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(sql))) {
    const cols = new Set();
    for (const raw of m[2].split('\n')) {
      const line = raw.trim();
      const col = new RegExp(`^([a-z_]+)\\s+(?:${SQL_TYPES})`).exec(line);
      if (col) cols.add(col[1]);
    }
    tables[m[1]] = cols;
  }
  return tables;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function main() {
  const tables = parseMigration(readFileSync(MIGRATION, 'utf8'));

  if (!Object.keys(tables).length) {
    console.error(`Could not parse any oauth_* tables from ${MIGRATION}`);
    process.exit(2);
  }

  const problems = [];

  // ── 1. The hand-written types must match the migration exactly. ─────────
  const typesSrc = readFileSync(TYPES_FILE, 'utf8');

  for (const [table, iface] of Object.entries(TYPE_BLOCKS)) {
    const block = new RegExp(`interface ${iface} \\{([\\s\\S]*?)\\n\\}`).exec(typesSrc);
    if (!block) {
      problems.push({ where: TYPES_FILE, detail: `interface ${iface} not found` });
      continue;
    }

    const declared = new Set(
      [...block[1].matchAll(/^\s{2}([a-z_]+):/gm)].map((hit) => hit[1]),
    );
    const actual = tables[table];

    for (const col of declared) {
      if (!actual.has(col)) {
        problems.push({
          where: TYPES_FILE,
          detail: `${iface} declares '${col}', which ${table} does not have`,
        });
      }
    }
    for (const col of actual) {
      if (!declared.has(col)) {
        problems.push({
          where: TYPES_FILE,
          detail: `${iface} is missing '${col}' from ${table}`,
        });
      }
    }

    console.log(
      `${table}: ${declared.size} declared / ${actual.size} in migration` +
        `${declared.size === actual.size ? '' : '  <-- MISMATCH'}`,
    );
  }

  // ── 2. Every column the code touches must exist. ───────────────────────
  const files = CODE_DIRS.flatMap(walk);
  let checked = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // Up to the `;` that closes the statement. Stopping at a blank line
    // instead missed most references, because these chains are written
    // across consecutive lines with no blank line inside them.
    const chains = source.matchAll(/\.from\('(oauth_\w+)'\)([\s\S]{0,900}?);/g);

    for (const chain of chains) {
      const [, table, tail] = chain;
      if (!tables[table]) continue;
      const line = lineOf(source, chain.index);
      const known = tables[table];

      const flag = (col, op) => {
        checked += 1;
        if (!known.has(col)) {
          problems.push({ where: `${file}:${line}`, detail: `${op} '${col}' not in ${table}` });
        }
      };

      for (const sel of tail.matchAll(/\.select\(\s*['"]([^'"]+)['"]/g)) {
        for (const part of sel[1].split(',')) {
          const col = part.trim();
          // Skip embedded resource syntax: a different table's columns.
          if (!col || col.includes('(')) continue;
          flag(col, 'select');
        }
      }

      for (const body of tail.matchAll(/\.(?:insert|update)\(\s*\{([\s\S]*?)\}\s*\)/g)) {
        for (const hit of body[1].matchAll(/^\s*([a-z_]+):/gm)) flag(hit[1], 'write');
      }

      for (const hit of tail.matchAll(/\.(?:eq|is|neq|in|gt|lt)\('([a-z_]+)'/g)) {
        flag(hit[1], 'filter');
      }
    }
  }

  console.log(`\nOAuth column references checked: ${checked} across ${files.length} files.`);

  if (!problems.length) {
    console.log('No invented columns found; types match the migration.\n');
    process.exit(0);
  }

  console.log(`\n${problems.length} problem(s):\n`);
  for (const p of problems) console.log(`  ${p.where}\n    ${p.detail}`);
  console.log(
    '\nFix the code or the migration — not the types alone. The types exist to\n' +
      'describe what the migration creates; editing them to match wrong code just\n' +
      'moves the bug past the compiler.\n',
  );
  process.exit(1);
}

main();
