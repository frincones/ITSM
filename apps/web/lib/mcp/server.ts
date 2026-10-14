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

// Domain modules — each exports a marker that we reference below to defeat
// webpack tree-shaking of side-effect-only imports (the package has
// `"sideEffects": false`, which would otherwise drop these and leave the
// registry empty in production builds).
import { __ticketsToolsLoaded } from './tools/tickets';
import { __organizationsToolsLoaded } from './tools/organizations';
import { __contactsToolsLoaded } from './tools/contacts';
import { __agentsToolsLoaded } from './tools/agents';
import { __kbToolsLoaded } from './tools/kb';
import { __problemsToolsLoaded } from './tools/problems';
import { __changesToolsLoaded } from './tools/changes';
import { __assetsToolsLoaded } from './tools/assets';
import { __slasToolsLoaded } from './tools/slas';
import { __metricsToolsLoaded } from './tools/metrics';
import { __auditToolsLoaded } from './tools/audit';
import { __inboxToolsLoaded } from './tools/inbox';
import { __automationToolsLoaded } from './tools/automation';
import { __kbWriteToolsLoaded } from './tools/kb-write';
import { __organizationsWriteToolsLoaded } from './tools/organizations-write';
import { __changesWriteToolsLoaded } from './tools/changes-write';
import { __reportingToolsLoaded } from './tools/reporting';
import { __operationsToolsLoaded } from './tools/operations';

// The bundler must believe these markers are observed. Without this array
// the imports above can still be eliminated under aggressive tree-shaking.
const _toolModulesLoaded = [
  __ticketsToolsLoaded,
  __organizationsToolsLoaded,
  __contactsToolsLoaded,
  __agentsToolsLoaded,
  __kbToolsLoaded,
  __problemsToolsLoaded,
  __changesToolsLoaded,
  __assetsToolsLoaded,
  __slasToolsLoaded,
  __metricsToolsLoaded,
  __auditToolsLoaded,
  __inboxToolsLoaded,
  __automationToolsLoaded,
  __kbWriteToolsLoaded,
  __organizationsWriteToolsLoaded,
  __changesWriteToolsLoaded,
  __reportingToolsLoaded,
  __operationsToolsLoaded,
];
if (_toolModulesLoaded.some((v) => v !== true)) {
  throw new Error('MCP tool module markers misconfigured');
}

export { registry };
export const MCP_SERVER_VERSION = '1.1.0';
export const MCP_SERVER_NAME = 'novadesk-itsm';

// ---------------------------------------------------------------------------
// Protocol version negotiation
// ---------------------------------------------------------------------------
// MCP requires the server to answer `initialize` with the highest version it
// shares with the client — NOT a fixed constant. Returning a hardcoded value
// is what made Claude Desktop (which asks for 2025-11-25) silently fall back
// to an older wire format.
//
// Ordered newest → oldest. The first entry is what we advertise when a client
// sends nothing or asks for something newer than we implement.
export const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25', // current stable: OIDC discovery, tool icons, experimental tasks
  '2025-06-18', // structured output, elicitation, resource indicators
  '2025-03-26', // Streamable HTTP baseline — what this server shipped with
] as const;

export type McpProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

/** Newest version this server speaks. Used for the manifest and as default. */
export const MCP_PROTOCOL_VERSION: McpProtocolVersion =
  SUPPORTED_PROTOCOL_VERSIONS[0];

/** Oldest version still accepted, exported for diagnostics. */
export const MCP_MIN_PROTOCOL_VERSION: McpProtocolVersion =
  SUPPORTED_PROTOCOL_VERSIONS[SUPPORTED_PROTOCOL_VERSIONS.length - 1]!;

/**
 * Resolves the version to answer `initialize` with.
 *
 * - exact match            → echo it back
 * - client newer than us   → our newest (client decides whether to proceed)
 * - client older than us   → our newest, per spec: the client then either
 *                            accepts it or disconnects. We deliberately do
 *                            not guess an unsupported older dialect.
 * - absent / malformed     → our newest
 *
 * Dates are compared lexicographically, which is correct for YYYY-MM-DD.
 */
export function negotiateProtocolVersion(requested: unknown): McpProtocolVersion {
  if (typeof requested !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    return MCP_PROTOCOL_VERSION;
  }

  const exact = SUPPORTED_PROTOCOL_VERSIONS.find((v) => v === requested);
  if (exact) return exact;

  // Highest supported version that is not newer than what the client asked
  // for — the closest dialect the client can actually understand.
  const downgrade = SUPPORTED_PROTOCOL_VERSIONS.find((v) => v < requested);
  return downgrade ?? MCP_PROTOCOL_VERSION;
}
