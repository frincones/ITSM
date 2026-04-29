// ---------------------------------------------------------------------------
// One-shot operational script:
//   1. Connects to production Supabase Postgres
//   2. Applies migration 00039 if api_keys table is missing
//   3. Creates a fully-scoped API key for the first active tenant
//   4. Prints the plain key (one-time visibility)
//
// Run: node scripts/apply-mcp-migration-and-create-key.mjs
//
// Environment / hard-coded values: connection string is read from the
// project's `.claude/SUPABASE-CREDENTIALS.md` (gitignored). For one-shot
// use, we accept it via PG_CONNECTION_STRING env var to avoid embedding
// secrets in the script file.
// ---------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Resolve `pg` from apps/web/node_modules — script lives outside the
// monorepo workspace boundary.
const require = createRequire(join(here, '..', 'apps', 'web', 'package.json'));
const pg = require('pg');
const { Client } = pg;

const repoRoot = join(here, '..');

const CONN = process.env.PG_CONNECTION_STRING;
if (!CONN) {
  console.error('Set PG_CONNECTION_STRING env var (postgresql://...).');
  process.exit(1);
}

const KEY_NAME = process.env.KEY_NAME || 'mcp-test-fullaccess';
const KEY_DESCRIPTION = process.env.KEY_DESCRIPTION || 'Test key with all read+write scopes (created by setup script)';
const KEY_RPM = parseInt(process.env.KEY_RPM || '120', 10);

const ALL_SCOPES = [
  'tickets:read', 'tickets:write', 'tickets:comment', 'tickets:assign', 'tickets:delete',
  'organizations:read', 'organizations:write',
  'contacts:read', 'contacts:write',
  'agents:read',
  'kb:read', 'kb:search', 'kb:write',
  'problems:read', 'problems:write',
  'changes:read', 'changes:write',
  'assets:read', 'assets:write',
  'slas:read', 'metrics:read', 'audit:read', 'webhooks:manage',
];

function generatePlainKey(env = 'live') {
  const random = randomBytes(24)
    .toString('base64')
    .replace(/\+/g, 'A')
    .replace(/\//g, 'B')
    .replace(/=+$/, '')
    .slice(0, 32);
  return `nvd_${env}_${random}`;
}

function hashApiKey(plain) {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log('✓ Connected to Postgres');

// ---- Step 1: check if migration 00039 already applied ----
const { rows: tableExists } = await client.query(`
  SELECT 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'api_keys' LIMIT 1
`);

if (tableExists.length === 0) {
  console.log('• api_keys table missing — applying migration 00039');
  const sqlPath = join(repoRoot, 'apps/web/supabase/migrations/00039_api_keys_and_mcp.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  // Run as a single transaction so partial failures roll back.
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✓ Migration 00039 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Migration failed; rolled back:', err.message);
    await client.end();
    process.exit(2);
  }
} else {
  console.log('✓ api_keys table already present — skipping migration');
}

// ---- Step 2: pick a tenant ----
const { rows: tenants } = await client.query(
  `SELECT id, name, slug FROM tenants ORDER BY created_at ASC LIMIT 5`,
);
if (tenants.length === 0) {
  console.error('✗ No tenants found — cannot create API key');
  await client.end();
  process.exit(3);
}
const tenant = tenants[0];
console.log(`✓ Using tenant: ${tenant.name} (${tenant.slug}) — id ${tenant.id}`);
if (tenants.length > 1) {
  console.log('  Other tenants available:');
  tenants.slice(1).forEach(t => console.log(`    - ${t.name} (${t.slug}) — id ${t.id}`));
}

// ---- Step 3: create the API key ----
const plainKey = generatePlainKey('live');
const keyHash = hashApiKey(plainKey);
const keyPrefix = plainKey.slice(0, 12);

const { rows: inserted } = await client.query(
  `INSERT INTO api_keys (
     tenant_id, name, description, environment, key_prefix, key_hash,
     scopes, rate_limit_rpm, is_active, metadata
   ) VALUES (
     $1, $2, $3, 'live', $4, $5,
     $6::text[], $7, true, '{"created_by":"setup-script"}'::jsonb
   )
   RETURNING id, name, key_prefix, scopes, rate_limit_rpm, created_at`,
  [tenant.id, KEY_NAME, KEY_DESCRIPTION, keyPrefix, keyHash, ALL_SCOPES, KEY_RPM],
);

const record = inserted[0];
console.log('✓ API key created');
console.log();
console.log('═══════════════════════════════════════════════════════════');
console.log('  PLAIN KEY (copy now — never shown again):');
console.log();
console.log(`     ${plainKey}`);
console.log();
console.log('═══════════════════════════════════════════════════════════');
console.log(`  id:           ${record.id}`);
console.log(`  name:         ${record.name}`);
console.log(`  prefix:       ${record.key_prefix}`);
console.log(`  scopes:       ${record.scopes.length} (full read+write)`);
console.log(`  rate limit:   ${record.rate_limit_rpm} req/min`);
console.log(`  tenant:       ${tenant.name}`);
console.log('═══════════════════════════════════════════════════════════');

await client.end();
