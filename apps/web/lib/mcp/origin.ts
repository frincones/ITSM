// ---------------------------------------------------------------------------
// Request origin resolution
// ---------------------------------------------------------------------------
// OAuth metadata documents and the MCP manifest must advertise ABSOLUTE
// URLs. A relative path is meaningless to an MCP client, and in OAuth the
// `resource` identifier has to match byte-for-byte between the protected
// resource metadata, the WWW-Authenticate challenge and the token audience —
// so all of them derive it from here rather than each building their own.
//
// Behind Vercel the request URL carries the internal host, so the forwarded
// headers are what reflect the public origin.
// ---------------------------------------------------------------------------

/** Public origin of the incoming request, e.g. https://itsm.tdxcore.com */
export function resolveOrigin(request: Request): string {
  try {
    const url = new URL(request.url);
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const host = forwardedHost ?? url.host;
    // Split on comma: a chain of proxies appends rather than replaces.
    const proto = (forwardedProto ?? url.protocol.replace(':', '')).split(',')[0]!.trim();
    return `${proto}://${host}`;
  } catch {
    return '';
  }
}

/**
 * The canonical resource identifier for this MCP server.
 *
 * RFC 8707 resource indicators and RFC 9728 protected resource metadata both
 * key off this exact string, so it is defined once.
 */
export function resolveResourceId(request: Request): string {
  return `${resolveOrigin(request)}/api/mcp`;
}
