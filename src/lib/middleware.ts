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
  content: McpTextContent[];
  isError: true;
}

export type McpErrorCode =
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'INVALID_PARAMS'
  | 'NOT_FOUND'
  | 'SOURCE_UNAVAILABLE';

export function makeMcpError(
  error: string,
  code: McpErrorCode,
  details?: string,
): McpErrorResult {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error, code, details }, null, 2),
      },
    ],
    isError: true,
  };
}

export interface ToolCallContext {
  serverName: string;
  toolName: string;
  sessionId?: string;
}

/** Thin wrapper — runs handler and catches unexpected errors. */
export async function withMcpMiddleware(
  _ctx: ToolCallContext,
  handler: (user: null) => Promise<ToolResult>,
): Promise<ToolResult | McpErrorResult> {
  try {
    return await handler(null);
  } catch (err) {
    return makeMcpError('Internal server error', 'INTERNAL_ERROR', String(err));
  }
}
