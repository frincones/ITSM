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

  // Capabilities must reflect what is actually implemented, in both
  // directions: advertising what does not exist strands clients, and not
  // advertising what does means they never ask for it.
  const caps = init.body?.result?.capabilities ?? {};
  check('advertises the tools capability', !!caps.tools);
  check('advertises resources now that they are implemented', 'resources' in caps);
  check('advertises prompts now that they are implemented', 'prompts' in caps);
  // No push channel exists, so promising subscriptions or list-change
  // notifications would leave clients waiting for events that never come.
  check('does not promise resource subscriptions it cannot deliver',
    !caps.resources?.subscribe && !caps.resources?.listChanged,
    JSON.stringify(caps.resources));

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

  // RFC 9728 discovery: the document a client fetches after a 401 to learn
  // where to authenticate. Required by the MCP authorization spec.
  // RFC 9728 §3.1: when the resource identifier has a path, the metadata
  // lives at /.well-known/oauth-protected-resource<path> — the path is
  // APPENDED after the well-known suffix, not placed before it. Claude.ai
  // requests exactly that URL, and serving the document only at the root is
  // what made the connection fail with "No se pudo conectar con ITSM":
  // a 404 there aborts the flow before it starts.
  const resourcePath = new URL(ENDPOINT).pathname;
  const prmPathUrl = `${CFG.baseUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource${resourcePath}`;
  const prmPathRes = await fetch(prmPathUrl, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const prmPath = prmPathRes?.ok ? await prmPathRes.json().catch(() => null) : null;

  check('RFC 9728 path-based metadata is published', prmPathRes?.status === 200,
    `HTTP ${prmPathRes?.status ?? 'unreachable'} at ${prmPathUrl}`);
  check('path-based metadata names this exact resource',
    prmPath?.resource === ENDPOINT, `${prmPath?.resource} vs ${ENDPOINT}`);

  // A catch-all that answers for any path would hand out discovery metadata
  // for resources this server does not serve.
  const bogus = await fetch(
    `${CFG.baseUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource/no/such/resource`,
    { signal: AbortSignal.timeout(20_000) },
  ).catch(() => null);
  check('metadata is not served for an unknown resource path',
    bogus?.status === 404, `HTTP ${bogus?.status}`);

  const prmUrl = `${CFG.baseUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource`;
  const prmRes = await fetch(prmUrl, { signal: AbortSignal.timeout(20_000) });
  const prm = await prmRes.json().catch(() => null);

  check('protected resource metadata is published', prmRes.status === 200, `HTTP ${prmRes.status}`);
  check('metadata is readable without a token', prmRes.status === 200);
  check('metadata declares an absolute resource id',
    typeof prm?.resource === 'string' && prm.resource.startsWith('http'),
    `resource=${prm?.resource}`);
  check('metadata resource matches this endpoint',
    prm?.resource === ENDPOINT, `${prm?.resource} vs ${ENDPOINT}`);
  check('metadata declares authorization_servers',
    Array.isArray(prm?.authorization_servers),
    `got ${typeof prm?.authorization_servers}`);
  check('metadata lists supported scopes',
    Array.isArray(prm?.scopes_supported) && prm.scopes_supported.length > 0,
    `${prm?.scopes_supported?.length ?? 0} scopes`);
  check('metadata accepts bearer tokens in the header',
    Array.isArray(prm?.bearer_methods_supported) && prm.bearer_methods_supported.includes('header'));
  // Advertising an authorization server that cannot complete a flow is worse
  // than advertising none: the client fails mid-flow and blames us.
  warn('an authorization server is configured',
    (prm?.authorization_servers?.length ?? 0) > 0,
    prm?.authorization_status?.detail ?? 'none configured');

  // RFC 8414 — the authorization server metadata the document above points
  // at. Fetched from the first entry of authorization_servers rather than
  // assumed, because a client follows the same chain and a mismatch between
  // the two documents is exactly the bug worth catching here.
  const asBase = prm?.authorization_servers?.[0];
  if (asBase) {
    const asUrl = `${String(asBase).replace(/\/$/, '')}/.well-known/oauth-authorization-server`;
    const asRes = await fetch(asUrl, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    const as = asRes ? await asRes.json().catch(() => null) : null;

    check('authorization server metadata is published', asRes?.status === 200,
      `HTTP ${asRes?.status ?? 'unreachable'} at ${asUrl}`);
    check('AS issuer matches the advertised server', as?.issuer === asBase,
      `${as?.issuer} vs ${asBase}`);
    check('AS publishes an authorization endpoint',
      typeof as?.authorization_endpoint === 'string' && as.authorization_endpoint.startsWith('http'),
      `got ${as?.authorization_endpoint}`);
    check('AS publishes a token endpoint',
      typeof as?.token_endpoint === 'string' && as.token_endpoint.startsWith('http'),
      `got ${as?.token_endpoint}`);
    // The spec tells clients to REFUSE to proceed when this is absent, since
    // there is no other way to discover PKCE support. Omitting it would make
    // every compliant client give up before starting.
    check('AS advertises PKCE S256',
      Array.isArray(as?.code_challenge_methods_supported) &&
        as.code_challenge_methods_supported.includes('S256'),
      `got ${JSON.stringify(as?.code_challenge_methods_supported)}`);
    check('AS does not offer the plain PKCE method',
      !as?.code_challenge_methods_supported?.includes('plain'));
    check('AS supports the authorization_code grant',
      Array.isArray(as?.grant_types_supported) &&
        as.grant_types_supported.includes('authorization_code'));
    check('AS does not offer the implicit flow',
      !as?.response_types_supported?.includes('token'),
      'removed in OAuth 2.1');
    check('AS declares RFC 8707 resource indicators',
      as?.resource_indicators_supported === true);

    // A token endpoint that accepts a request with no PKCE verifier would
    // defeat the whole exchange, so probe it rather than trusting metadata.
    if (typeof as?.token_endpoint === 'string') {
      const noPkce = await fetch(as.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=authorization_code&code=probe&client_id=probe',
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      const body = noPkce ? await noPkce.json().catch(() => null) : null;
      check('token endpoint rejects a code exchange without PKCE',
        body?.error === 'invalid_request',
        `got ${JSON.stringify(body)}`);

      const badGrant = await fetch(as.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=password&username=a&password=b',
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      const bg = badGrant ? await badGrant.json().catch(() => null) : null;
      check('token endpoint refuses the password grant',
        bg?.error === 'unsupported_grant_type',
        `got ${JSON.stringify(bg)}`);
    }
  } else {
    warn('authorization server metadata reachable', false,
      'no authorization_servers entry to follow');
  }

  const noKey = await rpc('tools/list', null, { auth: false });
  check('tools/list without Bearer → -32001', noKey.body?.error?.code === -32001, JSON.stringify(noKey.body?.error));

  // The 401 has to say HOW to authenticate, not just that it failed.
  const challenge = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/list' }),
    signal: AbortSignal.timeout(20_000),
  });
  const wwwAuth = challenge.headers.get('www-authenticate');
  check('401 carries a WWW-Authenticate challenge', !!wwwAuth, `got ${wwwAuth ?? 'none'}`);
  check('challenge points at the metadata document',
    !!wwwAuth && wwwAuth.includes('resource_metadata=') && wwwAuth.includes('/.well-known/oauth-protected-resource'),
    wwwAuth ?? '');

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

async function suiteResourcesAndPrompts() {
  if (!JSON_OUT) console.log('\n\x1b[1mResources and prompts\x1b[0m');

  const templates = await rpc('resources/templates/list');
  const tpl = templates.body?.result?.resourceTemplates ?? [];
  check('resource templates are published', tpl.length > 0, `${tpl.length} templates`);
  check('every template declares a uriTemplate and a name',
    tpl.every((t) => typeof t.uriTemplate === 'string' && typeof t.name === 'string'));

  const listed = await rpc('resources/list');
  if (listed.body?.error) {
    // A missing scope is a config fact, not a contract break.
    warn('resources/list callable', false, listed.body.error.message);
  } else {
    const res = listed.body?.result?.resources ?? [];
    check('resources/list returns an array', Array.isArray(res), typeof res);
    check('every resource carries a uri and a name',
      res.every((r) => typeof r.uri === 'string' && typeof r.name === 'string'));
    check('resource uris use the declared scheme',
      res.every((r) => r.uri.startsWith('novadesk://')),
      res.find((r) => !r.uri.startsWith('novadesk://'))?.uri ?? '');
  }

  // An unknown scheme and an unknown id must fail differently: one is a
  // malformed request, the other a missing resource.
  const badScheme = await rpc('resources/read', { uri: 'file:///etc/passwd' });
  check('rejects a foreign URI scheme',
    badScheme.body?.error?.code === -32602,
    JSON.stringify(badScheme.body?.error?.code));

  const missing = await rpc('resources/read', {
    uri: 'novadesk://kb/00000000-0000-4000-8000-000000000000',
  });
  check('unknown resource returns not-found, not a crash',
    missing.body?.error?.code === -32004 || missing.body?.error?.code === -32002,
    JSON.stringify(missing.body?.error?.code));

  const prompts = await rpc('prompts/list');
  const list = prompts.body?.result?.prompts ?? [];
  check('prompts are published', list.length > 0, `${list.length} prompts`);
  check('every prompt has a name and description',
    list.every((p) => typeof p.name === 'string' && typeof p.description === 'string'));

  if (list.length) {
    const withRequired = list.find((p) => (p.arguments ?? []).some((a) => a.required));
    if (withRequired) {
      const noArgs = await rpc('prompts/get', { name: withRequired.name, arguments: {} });
      check('prompts/get rejects missing required arguments',
        noArgs.body?.error?.code === -32602,
        JSON.stringify(noArgs.body?.error?.code));

      const args = {};
      for (const a of withRequired.arguments.filter((x) => x.required)) args[a.name] = 'TEST-VALUE';
      const got = await rpc('prompts/get', { name: withRequired.name, arguments: args });
      const msgs = got.body?.result?.messages ?? [];
      check('prompts/get returns messages', msgs.length > 0, JSON.stringify(got.body?.error));
      check('prompt messages carry a role and text content',
        msgs.every((m) => (m.role === 'user' || m.role === 'assistant') && m.content?.type === 'text' && typeof m.content.text === 'string'));
      check('prompt interpolates its arguments',
        msgs.some((m) => m.content.text.includes('TEST-VALUE')));
    }
  }

  const unknownPrompt = await rpc('prompts/get', { name: 'does_not_exist' });
  check('unknown prompt is rejected',
    unknownPrompt.body?.error?.code === -32602,
    JSON.stringify(unknownPrompt.body?.error?.code));
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
    await suiteResourcesAndPrompts();
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
