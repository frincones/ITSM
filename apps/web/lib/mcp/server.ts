// ---------------------------------------------------------------------------
// MCP Server Bootstrap
// ---------------------------------------------------------------------------
// Single import surface for the MCP runtime. Imports each domain module
// (which self-register their tools into the registry) and re-exports the
// registry for the HTTP route, internal callers, and the manifest.
//
// To add a new domain:
//   1. Create lib/mcp/tools/<domain>.ts that exports nothing — calls
//      registry.register(...) at module load.
//   2. Add an `import './tools/<domain>'` line below.
// ---------------------------------------------------------------------------

import 'server-only';

import { registry } from './registry';

// Domain modules — order is irrelevant.
import './tools/tickets';
import './tools/organizations';
import './tools/contacts';
import './tools/agents';
import './tools/kb';
import './tools/problems';
import './tools/changes';
import './tools/assets';
import './tools/slas';
import './tools/metrics';
import './tools/audit';

export { registry };
export const MCP_SERVER_VERSION = '1.0.0';
export const MCP_PROTOCOL_VERSION = '2025-03-26';
export const MCP_SERVER_NAME = 'novadesk-itsm';
