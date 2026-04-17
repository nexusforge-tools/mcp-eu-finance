// Lightweight MCP middleware for standalone (stdio/npx) mode.
// No Redis, no Supabase — rate limiting is enforced at the hosted SSE layer.

export type McpErrorCode =
  | 'SOURCE_UNAVAILABLE'
  | 'INVALID_PARAMS'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'INTERNAL_ERROR';

export interface McpTextContent {
  [key: string]: unknown;
  type: 'text';
  text: string;
}

export interface ToolResult {
  [key: string]: unknown;
  content: McpTextContent[];
  isError?: boolean;
}

export interface McpErrorResult {
  [key: string]: unknown;
  content: [{ [key: string]: unknown; type: 'text'; text: string }];
  isError: true;
}

export function makeMcpError(error: string, code: McpErrorCode, details?: string): McpErrorResult {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error, code, details }, null, 2) }],
    isError: true,
  };
}

export interface ToolCallContext {
  serverName: string;
  toolName: string;
}

/** Execute a tool handler, catching and formatting any thrown errors. */
export async function withMcpMiddleware(
  _ctx: ToolCallContext,
  handler: () => Promise<ToolResult>,
): Promise<ToolResult | McpErrorResult> {
  try {
    return await handler();
  } catch (err) {
    return makeMcpError('Internal server error', 'INTERNAL_ERROR', String(err));
  }
}
