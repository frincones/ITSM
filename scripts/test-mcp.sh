#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# MCP Smoke Test
# ---------------------------------------------------------------------------
# Validates the deployed MCP server end-to-end:
#   1. GET  /api/mcp/manifest         (public; should return tool catalog)
#   2. POST /api/mcp { method: ping } (public; should return {})
#   3. POST /api/mcp { method: initialize } (public; server info)
#   4. POST /api/mcp { method: tools/list } WITHOUT auth (must 401)
#   5. POST /api/mcp { method: tools/list } WITH auth (if MCP_API_KEY set)
#   6. POST /api/mcp { method: tools/call name=tickets.list } (if key set)
#
# Usage:
#   MCP_BASE_URL=https://your-domain.com bash scripts/test-mcp.sh
#   MCP_BASE_URL=... MCP_API_KEY=nvd_live_... bash scripts/test-mcp.sh
# ---------------------------------------------------------------------------

set -u
BASE_URL="${MCP_BASE_URL:-http://localhost:3000}"
API_KEY="${MCP_API_KEY:-}"

# colors
G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; B=$'\e[34m'; X=$'\e[0m'

pass=0; fail=0

step() { echo; echo "${B}▶ $1${X}"; }
ok()   { echo "${G}  ✓ $1${X}"; pass=$((pass+1)); }
ng()   { echo "${R}  ✗ $1${X}"; fail=$((fail+1)); }
warn() { echo "${Y}  ! $1${X}"; }

curl_json() {
  # $1=method (GET|POST), $2=path, $3=body (or empty), $4=auth (or empty)
  local method="$1" path="$2" body="${3:-}" auth="${4:-}"
  local url="${BASE_URL}${path}"
  local headers=( -H "Accept: application/json" )
  [ -n "$body" ] && headers+=( -H "Content-Type: application/json" )
  [ -n "$auth" ] && headers+=( -H "Authorization: Bearer ${auth}" )
  if [ "$method" = "GET" ]; then
    curl -sS --max-time 30 -w "\n---STATUS:%{http_code}---" "${headers[@]}" "$url" 2>&1
  else
    curl -sS --max-time 30 -X POST -d "$body" -w "\n---STATUS:%{http_code}---" "${headers[@]}" "$url" 2>&1
  fi
}

extract_status() { echo "$1" | grep -oE '\-\-\-STATUS:[0-9]+\-\-\-' | tr -dc 0-9; }
extract_body()   { echo "$1" | sed 's/---STATUS:[0-9]*---//'; }

echo "${B}MCP Smoke Test${X}"
echo "  base: $BASE_URL"
echo "  key:  $([ -n "$API_KEY" ] && echo "set (${API_KEY:0:12}...)" || echo "(none)")"

# ---------------------------------------------------------------------------
# 1. Manifest (public)
# ---------------------------------------------------------------------------
step "1. GET /api/mcp/manifest (public)"
r=$(curl_json GET /api/mcp/manifest)
s=$(extract_status "$r")
b=$(extract_body  "$r")
if [ "$s" = "200" ]; then
  ok "HTTP 200"
  if echo "$b" | grep -q '"name":"novadesk-itsm"'; then
    ok 'server.name == "novadesk-itsm"'
  else
    ng 'server.name missing or different — is this the right deployment?'
  fi
  tools_count=$(echo "$b" | grep -oE '"name":"[a-z_]+\.[a-z_]+"' | wc -l)
  if [ "$tools_count" -ge 25 ]; then
    ok "tool catalog: $tools_count entries"
  else
    ng "tool catalog has $tools_count entries — expected 28+"
  fi
  proto=$(echo "$b" | grep -oE '"protocolVersion":"[^"]+"' | head -1)
  [ -n "$proto" ] && ok "protocolVersion: $proto" || ng 'protocolVersion missing'
else
  ng "HTTP $s — body: $(echo "$b" | head -c 200)"
fi

# ---------------------------------------------------------------------------
# 2. ping (public)
# ---------------------------------------------------------------------------
step "2. POST /api/mcp { method: ping } (public)"
r=$(curl_json POST /api/mcp '{"jsonrpc":"2.0","id":1,"method":"ping"}')
s=$(extract_status "$r")
b=$(extract_body "$r")
if [ "$s" = "200" ] && echo "$b" | grep -q '"id":1'; then
  ok "HTTP 200, JSON-RPC envelope correct"
else
  ng "HTTP $s — body: $(echo "$b" | head -c 200)"
fi

# ---------------------------------------------------------------------------
# 3. initialize (public)
# ---------------------------------------------------------------------------
step "3. POST /api/mcp { method: initialize } (public)"
r=$(curl_json POST /api/mcp '{"jsonrpc":"2.0","id":2,"method":"initialize"}')
s=$(extract_status "$r")
b=$(extract_body "$r")
if [ "$s" = "200" ] && echo "$b" | grep -q '"protocolVersion"'; then
  ok "HTTP 200, includes protocolVersion"
  echo "$b" | grep -oE '"protocolVersion":"[^"]+"' | head -1 | sed 's/^/    /'
  echo "$b" | grep -oE '"name":"novadesk-itsm","version":"[^"]+"' | head -1 | sed 's/^/    /'
else
  ng "HTTP $s — body: $(echo "$b" | head -c 200)"
fi

# ---------------------------------------------------------------------------
# 4. tools/list WITHOUT auth → must reject
# ---------------------------------------------------------------------------
step "4. POST /api/mcp { method: tools/list } WITHOUT Bearer → must 401"
r=$(curl_json POST /api/mcp '{"jsonrpc":"2.0","id":3,"method":"tools/list"}')
s=$(extract_status "$r")
b=$(extract_body "$r")
if [ "$s" = "401" ] && echo "$b" | grep -q '"code":-32001'; then
  ok "HTTP 401 with code -32001 (Unauthorized) — auth gate works"
else
  ng "Expected 401 + code -32001. Got HTTP $s — body: $(echo "$b" | head -c 200)"
fi

# ---------------------------------------------------------------------------
# 5. Auth-required tests — only if MCP_API_KEY is provided
# ---------------------------------------------------------------------------
if [ -z "$API_KEY" ]; then
  warn "MCP_API_KEY not set — skipping authenticated tests."
  warn "To run them: create a key in /home/settings/api-keys, then re-run with"
  warn "  MCP_API_KEY=nvd_live_... bash scripts/test-mcp.sh"
else
  step "5. POST /api/mcp { method: tools/list } WITH key"
  r=$(curl_json POST /api/mcp '{"jsonrpc":"2.0","id":4,"method":"tools/list"}' "$API_KEY")
  s=$(extract_status "$r")
  b=$(extract_body "$r")
  if [ "$s" = "200" ] && echo "$b" | grep -q '"tools"'; then
    n=$(echo "$b" | grep -oE '"name":"[a-z_]+\.[a-z_]+"' | wc -l)
    ok "HTTP 200, $n tools listed"
  else
    ng "HTTP $s — body: $(echo "$b" | head -c 300)"
  fi

  step "6. POST /api/mcp { method: tools/call name=tickets.list }"
  body='{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"tickets.list","arguments":{"limit":3}}}'
  r=$(curl_json POST /api/mcp "$body" "$API_KEY")
  s=$(extract_status "$r")
  b=$(extract_body "$r")
  if [ "$s" = "200" ] && echo "$b" | grep -q '"structuredContent"'; then
    ok "HTTP 200, tickets.list returned structured content"
    echo "$b" | grep -oE '"total":[0-9]+' | head -1 | sed 's/^/    /'
  elif [ "$s" = "403" ] && echo "$b" | grep -q '"code":-32002'; then
    warn "HTTP 403: API key missing tickets:read scope — expected if you scoped narrowly"
  else
    ng "HTTP $s — body: $(echo "$b" | head -c 300)"
  fi

  step "7. POST /api/mcp { method: tools/call name=metrics.ticket_summary }"
  body='{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"metrics.ticket_summary","arguments":{}}}'
  r=$(curl_json POST /api/mcp "$body" "$API_KEY")
  s=$(extract_status "$r")
  b=$(extract_body "$r")
  if [ "$s" = "200" ]; then
    ok "HTTP 200"
    echo "$b" | grep -oE '"total":[0-9]+,"by_status":\{[^}]*\}' | head -1 | sed 's/^/    /'
  elif [ "$s" = "403" ]; then
    warn "HTTP 403: API key missing metrics:read scope"
  else
    ng "HTTP $s — body: $(echo "$b" | head -c 300)"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "${B}═══════════════════════════════════════${X}"
echo "${G}Pass:${X} $pass   ${R}Fail:${X} $fail"
echo "${B}═══════════════════════════════════════${X}"
[ "$fail" -eq 0 ] && exit 0 || exit 1
