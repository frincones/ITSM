#!/usr/bin/env node
// ---------------------------------------------------------------------------
// MCP Contract Test Harness — Phase 0 baseline
// ---------------------------------------------------------------------------
// Exercises the live MCP server over the wire (JSON-RPC / Streamable HTTP)
// and asserts the transport + tool contract. This is the regression net we
// run BEFORE and AFTER every change to lib/mcp/*.
//
// Why over the wire instead of unit tests: the bugs that actually bite in
// this layer are transport-level (protocol negotiation, SSE framing, 202 on
// notifications, tree-shaken registry in production builds). An in-process
// test of `registry.invoke` would pass while the deployed server is broken.
//
// Safety: all write assertions run against a dedicated sandbox organization
// and use an API key whose `organization_ids` allowlist contains ONLY that
// org, so a bug here cannot touch real customer data. The harness refuses
// to run if the key can see tickets outside the sandbox.
//
// Usage:
//   node scripts/mcp/contract-test.mjs                 # read-only suite
//   node scripts/mcp/contract-test.mjs --write         # include writes
//   node scripts/mcp/contract-test.mjs --snapshot      # rewrite baseline
//   node scripts/mcp/contract-test.mjs --json          # machine output
//
// Config via env (or scratchpad mcp_sandbox.json):
//   MCP_BASE_URL   default https://itsm.tdxcore.com
//   MCP_API_KEY    sandbox-restricted key
//   MCP_SANDBOX_ORG sandbox organization uuid
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SNAPSHOT_PATH = join(REPO_ROOT, 'scripts', 'mcp', 'catalog.snapshot.json');

const args = new Set(process.argv.slice(2));
const RUN_WRITES = args.has('--write');
const WRITE_SNAPSHOT = args.has('--snapshot');
const JSON_OUT = args.has('--json');

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

function loadSandboxConfig() {
  const fromEnv = {
    baseUrl: process.env.MCP_BASE_URL,
    key: process.env.MCP_API_KEY,
    org: process.env.MCP_SANDBOX_ORG,
  };
  if (fromEnv.key && fromEnv.org) {
    return { ...fromEnv, baseUrl: fromEnv.baseUrl ?? 'https://itsm.tdxcore.com' };
  }
  // Fall back to the scratchpad file written by the Phase 0 bootstrap.
  const candidates = [
    process.env.MCP_SANDBOX_FILE,
    join(process.env.TEMP ?? '', 'claude', 'mcp_sandbox.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const j = JSON.parse(readFileSync(p, 'utf8'));
        return { baseUrl: j.baseUrl ?? 'https://itsm.tdxcore.com', key: j.key, org: j.org };
      }
    } catch {
      /* try next */
    }
  }
  return { baseUrl: process.env.MCP_BASE_URL ?? 'https://itsm.tdxcore.com', key: null, org: null };
}

const CFG = loadSandboxConfig();
const ENDPOINT = `${CFG.baseUrl.replace(/\/$/, '')}/api/mcp`;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

const results = [];
let rpcId = 0;

function record(name, pass, detail, severity = 'fail') {
  results.push({ name, pass, detail, severity });
  if (!JSON_OUT) {
    const tag = pass ? '\x1b[32mPASS\x1b[0m' : severity === 'warn' ? '\x1b[33mWARN\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${tag}  ${name}${detail ? `\n          ${detail}` : ''}`);
  }
}

const check = (name, cond, detail) => record(name, !!cond, detail, 'fail');
const warn = (name, cond, detail) => record(name, !!cond, detail, 'warn');

/** Raw JSON-RPC POST. Returns { status, headers, body }. */
async function rpc(method, params, { auth = true, accept = 'application/json', raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: accept };
  if (auth && CFG.key) headers.Authorization = `Bearer ${CFG.key}`;
  const payload = raw ?? false;
  const body = payload
    ? JSON.stringify(payload)
    : JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params ? { params } : {}) });

  const res = await fetch(ENDPOINT, { method: 'POST', headers, body, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let parsed = null;
  if (text) {
    // Streamable HTTP may answer SSE-framed JSON when Accept includes SSE.
    const sse = /^event: message\ndata: (.*)$/ms.exec(text.trim());
    try {
      parsed = JSON.parse(sse ? sse[1] : text);
    } catch {
      parsed = { _unparseable: text.slice(0, 400) };
    }
  }
  return { status: res.status, headers: res.headers, body: parsed, text };
}

/** Calls a tool, returns structuredContent or throws the JSON-RPC error. */
async function callTool(name, argsObj) {
  const r = await rpc('tools/call', { name, arguments: argsObj ?? {} });
  if (r.body?.error) {
    const e = new Error(`${name}: ${r.body.error.message}`);
    e.rpc = r.body.error;
    throw e;
  }
  return r.body?.result?.structuredContent ?? r.body?.result;
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

async function suiteTransport() {
  if (!JSON_OUT) console.log('\n\x1b[1mTransport / JSON-RPC envelope\x1b[0m');

  const init = await rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'contract-test', version: '1.0' },
  }, { auth: false });

  check('initialize returns 200', init.status === 200, `got ${init.status}`);
  check('initialize carries Mcp-Session-Id', !!init.headers.get('mcp-session-id'));
  check('initialize exposes serverInfo.name', init.body?.result?.serverInfo?.name === 'novadesk-itsm',
    `got ${init.body?.result?.serverInfo?.name}`);
  check('initialize declares tools capability', !!init.body?.result?.capabilities?.tools);

  // Protocol negotiation: the spec requires echoing the highest mutually
  // supported version, NOT a hardcoded constant. A server that always
  // answers its own constant makes modern clients fall back silently.
  const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26'];
  for (const requested of SUPPORTED) {
    const r = await rpc('initialize', {
      protocolVersion: requested,
      capabilities: {},
      clientInfo: { name: 'negotiation-probe', version: '1.0' },
    }, { auth: false });
    check(
      `echoes protocolVersion ${requested} back to a client that speaks it`,
      r.body?.result?.protocolVersion === requested,
      `server answered ${r.body?.result?.protocolVersion}`,
    );
  }

  // A client newer than us must get our ceiling, not an echo of its own ask.
  const future = await rpc('initialize', {
    protocolVersion: '2026-07-28', capabilities: {}, clientInfo: { name: 'future', version: '1' },
  }, { auth: false });
  check('clamps a client newer than the server to our newest version',
    future.body?.result?.protocolVersion === SUPPORTED[0],
    `got ${future.body?.result?.protocolVersion}`);

  // Post-initialize requests carry MCP-Protocol-Version; an unknown value
  // must be refused rather than silently accepted.
  const badVersionHeader = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'MCP-Protocol-Version': '1999-01-01',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'ping' }),
    signal: AbortSignal.timeout(20_000),
  });
  const bvBody = await badVersionHeader.json().catch(() => null);
  check('rejects an unsupported MCP-Protocol-Version header',
    badVersionHeader.status === 400 && bvBody?.error?.code === -32600,
    `HTTP ${badVersionHeader.status} ${JSON.stringify(bvBody?.error)}`);

  // Capabilities must reflect what is actually implemented: advertising an
  // empty resources/prompts object makes clients render dead sections.
  const caps = init.body?.result?.capabilities ?? {};
  check('does not advertise unimplemented capabilities',
    !('resources' in caps) && !('prompts' in caps),
    `advertised: ${Object.keys(caps).join(', ')}`);

  // JSON-RPC 2.0 §4.1 notifications → HTTP 202, empty body.
  const notif = await rpc(null, null, { raw: { jsonrpc: '2.0', method: 'notifications/initialized' } });
  check('notification acked with 202', notif.status === 202, `got ${notif.status}`);
  check('notification body is empty', !notif.text, `got ${notif.text?.length ?? 0} bytes`);

  const ping = await rpc('ping', null, { auth: false });
  check('ping responds without auth', ping.status === 200 && !ping.body?.error);

  const bad = await rpc(null, null, { raw: { jsonrpc: '1.0', id: 1, method: 'ping' } });
  check('rejects non-2.0 envelope', bad.body?.error?.code === -32600, JSON.stringify(bad.body?.error));

  const unknown = await rpc('does/not/exist');
  check('unknown method → MethodNotFound', unknown.body?.error?.code === -32601, JSON.stringify(unknown.body?.error));

  const sse = await rpc('initialize', {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'sse', version: '1' },
  }, { auth: false, accept: 'application/json, text/event-stream' });
  check('honors Accept: text/event-stream on POST', sse.status === 200 && !!sse.body?.result);
}

async function suiteAuth() {
  if (!JSON_OUT) console.log('\n\x1b[1mAuthentication / authorization\x1b[0m');

  const noKey = await rpc('tools/list', null, { auth: false });
  check('tools/list without Bearer → -32001', noKey.body?.error?.code === -32001, JSON.stringify(noKey.body?.error));

  const noKeyCall = await rpc('tools/call', { name: 'tickets_list', arguments: {} }, { auth: false });
  check('tools/call without Bearer → -32001', noKeyCall.body?.error?.code === -32001);

  const savedKey = CFG.key;
  CFG.key = 'nvd_live_thisKeyDoesNotExist0000000';
  const badKey = await rpc('tools/list');
  check('invalid key → -32001', badKey.body?.error?.code === -32001, JSON.stringify(badKey.body?.error));
  CFG.key = savedKey;

  if (!CFG.key) {
    warn('authenticated suites skipped', false, 'no MCP_API_KEY / sandbox file found');
    return false;
  }
  const ok = await rpc('tools/list');
  check('valid key authenticates', !ok.body?.error, JSON.stringify(ok.body?.error));
  return !ok.body?.error;
}

async function suiteCatalog() {
  if (!JSON_OUT) console.log('\n\x1b[1mTool catalog contract\x1b[0m');

  const r = await rpc('tools/list');
  const tools = r.body?.result?.tools ?? [];
  check('catalog is non-empty (registry not tree-shaken)', tools.length > 0, `${tools.length} tools`);

  // Anthropic / OpenAI tool-name constraint. A single bad name makes some
  // clients drop the WHOLE catalog, so this is a hard gate.
  const NAME_RE = /^[a-zA-Z0-9_-]{1,128}$/;
  const badNames = tools.filter((t) => !NAME_RE.test(t.name)).map((t) => t.name);
  check('all tool names match ^[a-zA-Z0-9_-]{1,128}$', badNames.length === 0, badNames.join(', '));

  const noDesc = tools.filter((t) => !t.description || t.description.length < 20).map((t) => t.name);
  check('all tools carry a usable description', noDesc.length === 0, noDesc.join(', '));

  // An empty inputSchema means zodToJsonSchema failed to describe the shape;
  // Anthropic rejects those and drops the catalog.
  const emptySchema = tools
    .filter((t) => {
      const s = t.inputSchema;
      return !s || s.type !== 'object' || !s.properties || Object.keys(s.properties).length === 0;
    })
    .map((t) => t.name);
  check('no tool collapses to an empty inputSchema', emptySchema.length === 0, emptySchema.join(', '));

  const noScope = tools.filter((t) => !t._meta?.scope).map((t) => t.name);
  warn('all tools advertise their scope in _meta', noScope.length === 0, noScope.join(', '));

  // Descriptions that point at `tickets.get` when the tool is `tickets_get`
  // send agents to a MethodNotFound. Cross-check every dotted reference
  // against the live catalog.
  const names = new Set(tools.map((t) => t.name));
  const dangling = [];
  for (const t of tools) {
    const refs = t.description.match(/\b[a-z][a-z_]*\.[a-z_]{3,}\b/g) ?? [];
    for (const ref of refs) {
      const asTool = ref.replace('.', '_');
      // Only flag references that look like a tool we do publish under the
      // underscore spelling — avoids false hits on prose like "e.g." or urls.
      if (!names.has(ref) && names.has(asTool)) dangling.push(`${t.name}: "${ref}" → ${asTool}`);
    }
  }
  check('no description references a tool name that does not exist',
    dangling.length === 0, dangling.join(' | '));

  // Snapshot: detects accidental removals/renames across refactors.
  const catalog = tools
    .map((t) => ({ name: t.name, scope: t._meta?.scope ?? null, required: t.inputSchema?.required ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (WRITE_SNAPSHOT) {
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), count: catalog.length, tools: catalog }, null, 2)}\n`);
    record('snapshot written', true, `${catalog.length} tools → scripts/mcp/catalog.snapshot.json`);
  } else if (existsSync(SNAPSHOT_PATH)) {
    const base = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    const baseNames = new Set(base.tools.map((t) => t.name));
    const nowNames = new Set(catalog.map((t) => t.name));
    const removed = [...baseNames].filter((n) => !nowNames.has(n));
    const added = [...nowNames].filter((n) => !baseNames.has(n));
    check('no tool disappeared vs snapshot', removed.length === 0, removed.join(', '));
    if (added.length) record('new tools vs snapshot', true, added.join(', '), 'warn');

    // A changed `required` list is a breaking change for existing callers.
    const baseByName = new Map(base.tools.map((t) => [t.name, t]));
    const brokeRequired = catalog
      .filter((t) => baseByName.has(t.name))
      .filter((t) => {
        const was = new Set(baseByName.get(t.name).required ?? []);
        return (t.required ?? []).some((k) => !was.has(k));
      })
      .map((t) => t.name);
    check('no tool gained a new required field', brokeRequired.length === 0, brokeRequired.join(', '));
  } else {
    warn('catalog snapshot missing', false, 'run with --snapshot to create the baseline');
  }

  return tools;
}

async function suiteIsolation() {
  if (!JSON_OUT) console.log('\n\x1b[1mTenant / organization isolation (safety gate)\x1b[0m');

  const list = await callTool('tickets_list', { limit: 5 });
  const total = list?.pagination?.total ?? null;
  // The sandbox key is org-restricted; seeing foreign tickets means the
  // allowlist is not being enforced and writes are NOT safe to run.
  const sandboxOnly = total === 0 || (list?.tickets ?? []).every((t) => t.organization_id === CFG.org);
  check('org-restricted key cannot read foreign tickets', sandboxOnly, `total visible=${total}`);

  // Asking for an org outside the allowlist must not widen the result set.
  const others = await callTool('tickets_list', { limit: 5, organization_id: '5c32a495-68f5-4f83-aff2-d8050347bb71' });
  const leak = (others?.tickets ?? []).filter((t) => t.organization_id !== CFG.org);
  check('explicit foreign organization_id is ignored/intersected', leak.length === 0, `${leak.length} foreign rows returned`);

  return sandboxOnly && leak.length === 0;
}

async function suiteReads(tools) {
  if (!JSON_OUT) console.log('\n\x1b[1mRead tools smoke\x1b[0m');

  const readTools = tools
    .filter((t) => /_(list|search)$/.test(t.name))
    .filter((t) => (t.inputSchema?.required ?? []).length === 0);

  for (const t of readTools) {
    try {
      const out = await callTool(t.name, { limit: 2 });
      check(`${t.name} returns a shape`, out && typeof out === 'object');
    } catch (e) {
      // Missing scope is a config fact, not a contract break.
      const isScope = e.rpc?.code === -32002;
      record(`${t.name} callable`, false, `${e.rpc?.code ?? ''} ${e.message}`, isScope ? 'warn' : 'fail');
    }
  }

  // Input validation must reject out-of-range values, not silently clamp.
  try {
    await callTool('tickets_list', { limit: 9999 });
    check('tickets_list rejects limit > 100', false, 'accepted 9999');
  } catch (e) {
    check('tickets_list rejects limit > 100', e.rpc?.code === -32602 || e.rpc?.code === -32006, JSON.stringify(e.rpc?.code));
  }

  try {
    await callTool('tickets_get', { ticket_id: 'not-a-uuid' });
    check('tickets_get rejects malformed uuid', false, 'accepted');
  } catch (e) {
    check('tickets_get rejects malformed uuid', e.rpc?.code === -32602 || e.rpc?.code === -32006);
  }
}

async function suiteWrites(isolated) {
  if (!JSON_OUT) console.log('\n\x1b[1mWrite tools (sandbox only)\x1b[0m');

  if (!RUN_WRITES) {
    warn('write suite skipped', false, 'pass --write to enable');
    return;
  }
  if (!isolated) {
    record('write suite aborted', false, 'isolation gate failed — refusing to write', 'fail');
    return;
  }
  if (!CFG.org) {
    warn('write suite skipped', false, 'no sandbox org configured');
    return;
  }

  const stamp = new Date().toISOString();
  let ticketId = null;

  try {
    const created = await callTool('tickets_create', {
      title: `[contract-test] ${stamp}`,
      description: 'Created by the MCP contract harness. Safe to delete.',
      type: 'incident',
      urgency: 'low',
      impact: 'low',
      organization_id: CFG.org,
    });
    ticketId = created?.ticket?.id ?? null;
    check('tickets_create succeeds', !!ticketId);
    check('tickets_create lands in sandbox org', created?.ticket?.organization_id === CFG.org);
    check('ticket_number assigned by DB trigger', !!created?.ticket?.ticket_number);
    check('priority computed by DB trigger', created?.ticket?.priority != null);

    // These are the documented-but-missing side effects. Recorded as WARN
    // so the suite stays green while Phase 2 is pending — they flip to
    // PASS once writes route through the domain services.
    warn('[known gap] auto-assignment ran', !!created?.ticket?.assigned_agent_id,
      'tickets_create does not invoke assignAndNotify()');
    warn('[known gap] SLA stamped', !!created?.ticket?.sla_due_date,
      'sla_due_date null — stamp_ticket_sla did not resolve an SLA');

    if (ticketId) {
      const commented = await callTool('tickets_add_comment', {
        ticket_id: ticketId, content: 'Contract harness comment.', is_private: false,
      });
      check('tickets_add_comment succeeds', !!commented);
      // Migration 00064: the comment must carry a real author, otherwise
      // ticket_followups.author_id (NOT NULL FK to auth.users) would have
      // rejected it. A null here means the key has no acting agent.
      check('comment is attributed to the key\'s acting agent',
        !!commented?.followup?.author_id,
        `author_id=${commented?.followup?.author_id ?? 'null'}`);

      // Target a status that is reachable from both 'new' and 'assigned',
      // because the ticket may already have been auto-assigned by the
      // deferred default-owner chain by the time we get here.
      const moved = await callTool('tickets_transition_status', {
        ticket_id: ticketId, status: 'in_progress',
      });
      check('tickets_transition_status succeeds', !!moved);
      check('transition actually changed the status',
        moved?.ticket?.status === 'in_progress', `got ${moved?.ticket?.status}`);

      // A transition the map forbids must be refused as a conflict, not
      // silently applied — there is no DB constraint behind this.
      try {
        await callTool('tickets_transition_status', {
          ticket_id: ticketId, status: 'in_progress',
        });
        check('rejects a transition the map forbids', false, 'self-transition accepted');
      } catch (e) {
        check('rejects a transition the map forbids', e.rpc?.code === -32005,
          `got ${e.rpc?.code}`);
      }

      const updated = await callTool('tickets_update', {
        ticket_id: ticketId, title: `[contract-test] updated ${stamp}`,
      });
      check('tickets_update succeeds', !!updated);
      check('tickets_update applied the change',
        updated?.ticket?.title === `[contract-test] updated ${stamp}`,
        `got ${updated?.ticket?.title}`);

      // Every tickets_* tool should take the same identifier name.
      const byLegacyId = await callTool('tickets_update', {
        id: ticketId, urgency: 'medium',
      });
      check('tickets_update still accepts the legacy `id`', !!byLegacyId);

      // Writing outside the allowlist must be refused outright.
      try {
        await callTool('tickets_create', {
          title: '[contract-test] should be rejected',
          description: 'Attempt to write into a foreign organization.',
          type: 'incident', urgency: 'low', impact: 'low',
          organization_id: '5c32a495-68f5-4f83-aff2-d8050347bb71',
        });
        check('tickets_create refuses foreign organization_id', false, 'ACCEPTED — isolation breach');
      } catch {
        check('tickets_create refuses foreign organization_id', true);
      }
    }
  } catch (e) {
    record('write suite', false, `${e.rpc?.code ?? ''} ${e.message}`, 'fail');
  } finally {
    if (ticketId) {
      // Best-effort cleanup via the admin path; the MCP has no delete tool.
      const cleaned = await cleanupTicket(ticketId);
      record('sandbox ticket cleaned up', cleaned, cleaned ? '' : 'manual cleanup needed', cleaned ? 'fail' : 'warn');
    }
  }
}

/** Removes a sandbox ticket using the service role, if available. */
async function cleanupTicket(ticketId) {
  const url = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  try {
    for (const t of ['ticket_status_history', 'ticket_followups']) {
      await fetch(`${url}/rest/v1/${t}?ticket_id=eq.${ticketId}`, { method: 'DELETE', headers: h });
    }
    const r = await fetch(`${url}/rest/v1/tickets?id=eq.${ticketId}`, { method: 'DELETE', headers: h });
    return r.status === 204 || r.status === 200;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  if (!JSON_OUT) {
    console.log('\x1b[1mMCP contract harness\x1b[0m');
    console.log(`  endpoint : ${ENDPOINT}`);
    console.log(`  key      : ${CFG.key ? `${CFG.key.slice(0, 12)}…` : '(none)'}`);
    console.log(`  sandbox  : ${CFG.org ?? '(none)'}`);
    console.log(`  writes   : ${RUN_WRITES ? 'ENABLED' : 'disabled'}`);
  }

  await suiteTransport();
  const authed = await suiteAuth();

  if (authed) {
    const tools = await suiteCatalog();
    const isolated = await suiteIsolation();
    await suiteReads(tools);
    await suiteWrites(isolated);
  }

  const failed = results.filter((r) => !r.pass && r.severity === 'fail');
  const warned = results.filter((r) => !r.pass && r.severity === 'warn');

  if (JSON_OUT) {
    console.log(JSON.stringify({
      endpoint: ENDPOINT,
      total: results.length,
      passed: results.filter((r) => r.pass).length,
      failed: failed.length,
      warnings: warned.length,
      results,
    }, null, 2));
  } else {
    console.log(`\n\x1b[1mSummary\x1b[0m  ${results.filter((r) => r.pass).length}/${results.length} passed · ${failed.length} failed · ${warned.length} warnings`);
    if (failed.length) {
      console.log('\n\x1b[31mFailures\x1b[0m');
      failed.forEach((f) => console.log(`  · ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
    }
    if (warned.length) {
      console.log('\n\x1b[33mWarnings (known gaps / config)\x1b[0m');
      warned.forEach((f) => console.log(`  · ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
    }
  }

  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('harness crashed:', e);
  process.exit(2);
});
