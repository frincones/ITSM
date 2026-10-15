// ---------------------------------------------------------------------------
// Default scope offer
// ---------------------------------------------------------------------------
// Shared by the protected resource metadata and the 401 challenge so the two
// cannot drift. A client reads `scopes_supported` from one and `scope` from
// the other; if they disagree, which one wins depends on the client, and the
// resulting grant is whatever that accident produced.
//
// The server understands all 40 scopes in ALL_SCOPES. This is what a client
// is offered when it asks for nothing in particular — read access plus the
// writes a support workflow starts with. Destructive and administrative
// scopes are grantable on request, never by default.
// ---------------------------------------------------------------------------

export const DEFAULT_OFFERED_SCOPES = [
  'tickets:read',
  'tickets:write',
  'tickets:comment',
  'organizations:read',
  'contacts:read',
  'agents:read',
  'kb:read',
  'kb:search',
  'metrics:read',
  'reports:read',
] as const;
