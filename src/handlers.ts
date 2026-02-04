import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpListResourcesResult,
} from './types.js';
import { isJsonRpcNotification } from './types.js';

/**
 * 判断请求是否为通知（无需响应）
 */
export function isNotification(request: JsonRpcRequest): boolean {
  return isJsonRpcNotification(request);
}

/**
 * 创建空的 resources 列表响应
 * 如果是通知则返回 null
 */
export function createEmptyResourcesResponse(request: JsonRpcRequest): JsonRpcResponse | null {
  // 通知不需要响应
  if (isNotification(request)) {
    return null;
  }

  const result: McpListResourcesResult = {
    resources: [],
  };

  return {
    jsonrpc: '2.0',
    id: request.id!,
    result,
  };
}

/**
 * 创建资源未找到错误响应
 * 如果是通知则返回 null
 */
export function createResourceNotFoundResponse(request: JsonRpcRequest): JsonRpcResponse | null {
  // 通知不需要响应
  if (isNotification(request)) {
    return null;
  }

  return {
    jsonrpc: '2.0',
    id: request.id!,
    error: {
      code: -32002,
      message: 'Resource not found',
    },
  };
}

/**
 * Error codes with semantic meaning for LLM understanding
 */
export const ErrorCodes = {
  UPSTREAM_UNAVAILABLE: -32603,
  UPSTREAM_CONNECTION_LOST: -32603,
  UPSTREAM_TIMEOUT: -32603,
  RESOURCE_NOT_FOUND: -32002,
  INVALID_PARAMS: -32602,
} as const;

/**
 * LLM-friendly error messages with actionable guidance
 */
export const ErrorMessages = {
  UPSTREAM_UNAVAILABLE: {
    message: 'Codex service is not available',
    detail: 'The Codex backend process is not running or failed to start.',
    suggestion: 'Wait a few seconds and retry. If the problem persists, restart the MCP server.',
    retryable: true,
  },
  UPSTREAM_CONNECTION_LOST: {
    message: 'Connection to Codex service was lost',
    detail: 'The Codex backend process terminated unexpectedly.',
    suggestion: 'Restart the MCP server and retry your request.',
    retryable: false,
  },
  UPSTREAM_SEND_FAILED: {
    message: 'Failed to send request to Codex',
    detail: 'Unable to communicate with the Codex backend.',
    suggestion: 'This is usually a transient error. Wait 2-3 seconds and retry.',
    retryable: true,
  },
} as const;

export interface DetailedError {
  code: number;
  message: string;
  data?: {
    detail: string;
    suggestion: string;
    retryable: boolean;
    method?: string;
  };
}

/**
 * 创建通用错误响应
 */
export function createErrorResponse(
  request: JsonRpcRequest,
  code: number,
  message: string,
  data?: { detail: string; suggestion: string; retryable: boolean }
): JsonRpcResponse | null {
  if (isNotification(request)) {
    return null;
  }

  const error: DetailedError = { code, message };
  if (data) {
    error.data = { ...data, method: request.method };
  }

  return {
    jsonrpc: '2.0',
    id: request.id!,
    error,
  };
}

/**
 * 创建上游不可用错误
 */
export function createUpstreamUnavailableError(request: JsonRpcRequest): JsonRpcResponse | null {
  return createErrorResponse(
    request,
    ErrorCodes.UPSTREAM_UNAVAILABLE,
    ErrorMessages.UPSTREAM_UNAVAILABLE.message,
    {
      detail: ErrorMessages.UPSTREAM_UNAVAILABLE.detail,
      suggestion: ErrorMessages.UPSTREAM_UNAVAILABLE.suggestion,
      retryable: ErrorMessages.UPSTREAM_UNAVAILABLE.retryable,
    }
  );
}

/**
 * 创建上游连接丢失错误
 */
export function createUpstreamConnectionLostError(request: JsonRpcRequest): JsonRpcResponse | null {
  return createErrorResponse(
    request,
    ErrorCodes.UPSTREAM_CONNECTION_LOST,
    ErrorMessages.UPSTREAM_CONNECTION_LOST.message,
    {
      detail: ErrorMessages.UPSTREAM_CONNECTION_LOST.detail,
      suggestion: ErrorMessages.UPSTREAM_CONNECTION_LOST.suggestion,
      retryable: ErrorMessages.UPSTREAM_CONNECTION_LOST.retryable,
    }
  );
}

/**
 * 创建上游发送失败错误
 */
export function createUpstreamSendFailedError(request: JsonRpcRequest): JsonRpcResponse | null {
  return createErrorResponse(
    request,
    ErrorCodes.UPSTREAM_UNAVAILABLE,
    ErrorMessages.UPSTREAM_SEND_FAILED.message,
    {
      detail: ErrorMessages.UPSTREAM_SEND_FAILED.detail,
      suggestion: ErrorMessages.UPSTREAM_SEND_FAILED.suggestion,
      retryable: ErrorMessages.UPSTREAM_SEND_FAILED.retryable,
    }
  );
}

/**
 * 处理客户端请求，返回响应或 null（表示需要转发）
 */
export function handleRequest(request: JsonRpcRequest): JsonRpcResponse | null {
  if (request.method === 'resources/list') {
    return createEmptyResourcesResponse(request);
  }

  if (request.method === 'resources/read') {
    return createResourceNotFoundResponse(request);
  }

  // 需要转发到上游
  return null;
}

/**
 * 创建配置对象，应用默认值
 */
export function createConfig(options: {
  codexCommand?: string;
  codexArgs?: string[];
  debug?: boolean;
}): {
  codexCommand: string;
  codexArgs: string[];
  debug: boolean;
} {
  return {
    codexCommand: options.codexCommand ?? 'codex',
    codexArgs: options.codexArgs ?? ['mcp-server'],
    debug: options.debug ?? false,
  };
}

interface TrackedRequest {
  request: JsonRpcRequest;
  timestamp: number;
}

/**
 * 请求追踪器（带 TTL 清理）
 */
export class RequestTracker {
  private pending = new Map<string | number, TrackedRequest>();
  private ttlMs: number;
  private maxSize: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: { ttlMs?: number; maxSize?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 60000; // 默认 60 秒超时
    this.maxSize = options.maxSize ?? 10000; // 默认最大 10000 个请求
  }

  /**
   * 启动定期清理
   */
  startCleanup(intervalMs: number = 30000): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => this.cleanup(), intervalMs);
  }

  /**
   * 停止定期清理
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 追踪请求
   */
  track(request: JsonRpcRequest): void {
    if (request.id === undefined) return;
    
    // 如果超过最大容量，清理过期请求
    if (this.pending.size >= this.maxSize) {
      this.cleanup();
    }
    
    // 如果仍然超过容量，记录警告但仍然添加
    this.pending.set(request.id, {
      request,
      timestamp: Date.now(),
    });
  }

  /**
   * 完成请求
   */
  complete(id: string | number | null | undefined): JsonRpcRequest | undefined {
    if (id === undefined || id === null) return undefined;
    const tracked = this.pending.get(id);
    this.pending.delete(id);
    return tracked?.request;
  }

  /**
   * 清理过期请求
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, tracked] of this.pending) {
      if (now - tracked.timestamp > this.ttlMs) {
        this.pending.delete(id);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * 获取待处理请求数
   */
  get size(): number {
    return this.pending.size;
  }

  /**
   * 清空所有追踪
   */
  clear(): void {
    this.stopCleanup();
    this.pending.clear();
  }

  /**
   * 检查请求是否在追踪中
   */
  has(id: string | number): boolean {
    return this.pending.has(id);
  }
}

/**
 * 格式化日志消息
 */
export function formatLogMessage(
  level: 'debug' | 'info' | 'error',
  message: string
): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
}

/**
 * 判断是否应该输出日志
 */
export function shouldLog(level: 'debug' | 'info' | 'error', debug: boolean): boolean {
  if (level === 'debug' && !debug) return false;
  return true;
}
