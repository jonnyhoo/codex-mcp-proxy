/** JSON-RPC 2.0 基础类型 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** MCP 协议类型 */
export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { listChanged?: boolean };
  prompts?: { listChanged?: boolean };
}

export interface McpInitializeResult {
  protocolVersion: string;
  serverInfo: McpServerInfo;
  capabilities: McpCapabilities;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpListResourcesResult {
  resources: McpResource[];
  nextCursor?: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpListToolsResult {
  tools: McpTool[];
}

/** Codex 特定类型 */
export interface CodexToolArguments {
  prompt: string;
  model?: string;
  profile?: string;
  cwd?: string;
  'approval-policy'?: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  config?: Record<string, unknown>;
}

export interface CodexReplyArguments {
  threadId: string;
  prompt: string;
}

export interface CodexToolResult {
  threadId: string;
  content: string;
}

/** 代理配置 */
export interface ProxyConfig {
  codexCommand: string;
  codexArgs: string[];
  debug: boolean;
}

export const DEFAULT_CONFIG: ProxyConfig = {
  codexCommand: 'codex',
  codexArgs: ['mcp-server'],
  debug: false,
};

/** Type guards for JSON-RPC messages */
export function isJsonRpcMessage(obj: unknown): obj is { jsonrpc: '2.0' } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'jsonrpc' in obj &&
    (obj as { jsonrpc: unknown }).jsonrpc === '2.0'
  );
}

export function isJsonRpcRequest(obj: unknown): obj is JsonRpcRequest {
  return (
    isJsonRpcMessage(obj) &&
    'method' in obj &&
    typeof (obj as { method: unknown }).method === 'string'
  );
}

export function isJsonRpcNotification(obj: unknown): obj is JsonRpcRequest {
  return isJsonRpcRequest(obj) && !('id' in obj);
}

export function isJsonRpcResponse(obj: unknown): obj is JsonRpcResponse {
  return (
    isJsonRpcMessage(obj) &&
    !('method' in obj) &&
    ('result' in obj || 'error' in obj)
  );
}

export function isJsonRpcBatch(obj: unknown): obj is Array<JsonRpcRequest | JsonRpcResponse> {
  return Array.isArray(obj) && obj.length > 0 && obj.every(item => isJsonRpcMessage(item));
}
