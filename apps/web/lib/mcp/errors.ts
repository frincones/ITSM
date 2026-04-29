// ---------------------------------------------------------------------------
// MCP Errors
// ---------------------------------------------------------------------------
// JSON-RPC 2.0 error codes (https://www.jsonrpc.org/specification#error_object)
// plus MCP-specific application codes in the -32000 .. -32099 reserved range.
// ---------------------------------------------------------------------------

export const JsonRpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // Application-defined (MCP-specific)
  Unauthorized: -32001,
  Forbidden: -32002,
  RateLimited: -32003,
  NotFound: -32004,
  Conflict: -32005,
  ValidationError: -32006,
} as const;

export type JsonRpcErrorCodeValue =
  (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

export class McpError extends Error {
  public readonly code: number;
  public readonly httpStatus: number;
  public readonly data?: unknown;

  constructor(
    code: number,
    message: string,
    httpStatus = 500,
    data?: unknown,
  ) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.data = data;
  }
}

export const unauthorized = (msg = 'Missing or invalid API key') =>
  new McpError(JsonRpcErrorCode.Unauthorized, msg, 401);

export const forbidden = (msg: string) =>
  new McpError(JsonRpcErrorCode.Forbidden, msg, 403);

export const rateLimited = (limit: number) =>
  new McpError(
    JsonRpcErrorCode.RateLimited,
    `Rate limit exceeded (${limit} req/min)`,
    429,
    { limit },
  );

export const notFound = (resource: string) =>
  new McpError(
    JsonRpcErrorCode.NotFound,
    `${resource} not found`,
    404,
  );

export const validationError = (msg: string, details?: unknown) =>
  new McpError(JsonRpcErrorCode.ValidationError, msg, 422, details);

export const methodNotFound = (method: string) =>
  new McpError(
    JsonRpcErrorCode.MethodNotFound,
    `Method '${method}' not found`,
    404,
  );

export const invalidParams = (msg: string, details?: unknown) =>
  new McpError(JsonRpcErrorCode.InvalidParams, msg, 400, details);
