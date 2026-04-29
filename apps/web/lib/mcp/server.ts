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
];
if (_toolModulesLoaded.some((v) => v !== true)) {
  throw new Error('MCP tool module markers misconfigured');
}

export { registry };
export const MCP_SERVER_VERSION = '1.0.0';
export const MCP_PROTOCOL_VERSION = '2025-03-26';
export const MCP_SERVER_NAME = 'novadesk-itsm';
