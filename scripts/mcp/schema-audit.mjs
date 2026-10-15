#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Schema audit — catch invented columns before they reach production
// ---------------------------------------------------------------------------
// Six of the seven bugs found while building the MCP platform were the same
// mistake: code written against a column that does not exist, in a path
// nobody had executed.
//
//     tickets_add_comment            author_agent_id, source
//     createTicketFromConversation   source
//     createArticle                  content, summary, visibility
//     tickets_update                 ticket_tasks.status 'pending'
//     ...
//
// None failed the build or the typecheck, because apps/web/lib/database.types.ts
// is incomplete — it describes 14 of 99 tables, so `.insert({ anything: 1 })`
// compiles. They failed on first real use, months later.
//
// This script closes that gap from the other side: it reads every column the
// domain layer writes and checks it against the live schema. Run it before a
// PR that touches lib/domain.
//
// It is a safety net, NOT a replacement for regenerating the types. Fixing
// database.types.ts turns these into compile errors, which is strictly
// better. This catches what slips through until then.
//
// Usage:
//   SB_URL=... SB_KEY=... node scripts/mcp/schema-audit.mjs
//   node scripts/mcp/schema-audit.mjs --verbose
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const DOMAIN_DIR = join(REPO, 'apps', 'web', 'lib', 'domain');

const VERBOSE = process.argv.includes('--verbose');

const SB_URL = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error('Set SB_URL and SB_KEY (or NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(2);
}

const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

/**
 * Columns the live table actually has.
 *
 * Read from the OpenAPI document rather than a sample row: an empty table
 * returns no rows, and those are exactly the tables where an invented
 * column survives longest unnoticed.
 */
async function liveColumns() {
  const res = await fetch(`${SB_URL}/rest/v1/`, { headers });
  const doc = await res.json();
  const map = new Map();
  for (const [name, def] of Object.entries(doc.definitions ?? {})) {
    map.set(name, new Set(Object.keys(def.properties ?? {})));
  }
  return map;
}

/**
 * Extracts `.from('table').insert({ ... })` / `.update({ ... })` blocks.
 *
 * Deliberately conservative: it only reads keys indented inside the literal,
 * so a nested object or a spread is skipped rather than guessed at. Over-
 * reporting would train people to ignore this script.
 */
function extractWrites(source) {
  const writes = [];
  // The write must be chained DIRECTLY onto .from(), optionally across a
  // line break and comments. Allowing arbitrary text between them made the
  // matcher jump from one query to the next table's literal and report
  // every column as invented — a noisy audit is an ignored audit.
  const re =
    /\.from\('([a-z_]+)'\)\s*(?:\/\/[^\n]*\n\s*)*\.(insert|update|upsert)\(\s*\{([\s\S]*?)\n(\s*)\}/g;

  let m;
  while ((m = re.exec(source)) !== null) {
    const [, table, op, rawBody] = m;
    // The non-greedy body still runs past a single-line literal to the next
    // `}` in the file, swallowing the following query. Stop at the first
    // line that leaves the literal — a chained call or a closing paren.
    const body = rawBody.split('\n').reduce((acc, line) => {
      if (acc.done) return acc;
      if (/^\s*\.[a-z]/.test(line) || /^\s*\}\)/.test(line)) return { ...acc, done: true };
      return { ...acc, text: `${acc.text}\n${line}` };
    }, { text: '', done: false }).text;
    // Only top-level keys of the literal: a nested object belongs to a
    // jsonb column, not to the table.
    const columns = [...body.matchAll(/^[ \t]+([a-z_][a-z0-9_]*)\s*:/gm)].map((x) => x[1]);
    if (columns.length) writes.push({ table, op, columns, index: m.index });
  }
  return writes;
}

/** Line number of a character offset, for a useful error message. */
function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

async function main() {
  if (!existsSync(DOMAIN_DIR)) {
    console.error(`No domain directory at ${DOMAIN_DIR}`);
    process.exit(2);
  }

  const schema = await liveColumns();
  const files = readdirSync(DOMAIN_DIR).filter((f) => f.endsWith('.ts'));

  const problems = [];
  let checked = 0;

  for (const file of files) {
    const path = join(DOMAIN_DIR, file);
    const source = readFileSync(path, 'utf8');

    for (const write of extractWrites(source)) {
      const live = schema.get(write.table);
      if (!live) {
        // A table the REST layer does not expose. Could be a typo in the
        // table name, could be deliberate — report it, do not assume.
        problems.push({
          file,
          line: lineOf(source, write.index),
          table: write.table,
          detail: 'table is not exposed by the REST schema',
        });
        continue;
      }

      checked += write.columns.length;
      const invented = write.columns.filter((c) => !live.has(c));
      if (invented.length) {
        problems.push({
          file,
          line: lineOf(source, write.index),
          table: write.table,
          detail: `columns do not exist: ${invented.join(', ')}`,
        });
      }

      if (VERBOSE) {
        console.log(`  ${file}:${lineOf(source, write.index)} ${write.op} ${write.table} (${write.columns.length} cols)`);
      }
    }
  }

  console.log(`\nSchema audit: ${checked} column references across ${files.length} domain modules.`);

  if (!problems.length) {
    console.log('No invented columns found.\n');
    process.exit(0);
  }

  console.log(`\n${problems.length} problem(s):\n`);
  for (const p of problems) {
    console.log(`  ${p.file}:${p.line}  ${p.table}`);
    console.log(`    ${p.detail}`);
  }
  console.log(
    '\nIf one of these is a false positive (a helper that renames a field before writing,\n' +
      'or a literal belonging to a different table), confirm it against the migration\n' +
      'rather than silencing it — that is how the real ones were found.\n',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('audit failed:', err);
  process.exit(2);
});
