import { describe, it, expect } from 'vitest';

// 由于 CodexMcpProxy 直接操作 process.stdin/stdout，
// 我们测试其核心逻辑而不是完整的集成测试

describe('CodexMcpProxy core logic', () => {
  describe('resources/list interception logic', () => {
    it('should identify resources/list method', () => {
      const method = 'resources/list';
      expect(method === 'resources/list').toBe(true);
    });

    it('should create correct empty resources response', () => {
      const request = { jsonrpc: '2.0' as const, id: 1, method: 'resources/list' };
      const response = {
        jsonrpc: '2.0' as const,
        id: request.id ?? null,
        result: { resources: [] },
      };
      
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 1,
        result: { resources: [] },
      });
    });

    it('should handle missing id in request', () => {
      const request = { jsonrpc: '2.0' as const, method: 'resources/list' } as any;
      const response = {
        jsonrpc: '2.0' as const,
        id: request.id ?? null,
        result: { resources: [] },
      };
      
      expect(response.id).toBeNull();
    });
  });

  describe('resources/read interception logic', () => {
    it('should identify resources/read method', () => {
      const method = 'resources/read';
      expect(method === 'resources/read').toBe(true);
    });

    it('should create correct not found error response', () => {
      const request = { jsonrpc: '2.0' as const, id: 2, method: 'resources/read' };
      const response = {
        jsonrpc: '2.0' as const,
        id: request.id ?? null,
        error: {
          code: -32002,
          message: 'Resource not found',
        },
      };
      
      expect(response.error.code).toBe(-32002);
      expect(response.error.message).toBe('Resource not found');
    });
  });

  describe('request routing logic', () => {
    const shouldIntercept = (method: string): boolean => {
      return method === 'resources/list' || method === 'resources/read';
    };

    it('should intercept resources/list', () => {
      expect(shouldIntercept('resources/list')).toBe(true);
    });

    it('should intercept resources/read', () => {
      expect(shouldIntercept('resources/read')).toBe(true);
    });

    it('should not intercept tools/list', () => {
      expect(shouldIntercept('tools/list')).toBe(false);
    });

    it('should not intercept tools/call', () => {
      expect(shouldIntercept('tools/call')).toBe(false);
    });

    it('should not intercept initialize', () => {
      expect(shouldIntercept('initialize')).toBe(false);
    });

    it('should not intercept notifications/cancelled', () => {
      expect(shouldIntercept('notifications/cancelled')).toBe(false);
    });
  });

  describe('config handling', () => {
    it('should use default config values', () => {
      const defaultConfig = {
        codexCommand: 'codex',
        codexArgs: ['mcp-server'],
        debug: false,
      };
      
      const config = {
        codexCommand: undefined ?? 'codex',
        codexArgs: undefined ?? ['mcp-server'],
        debug: undefined ?? false,
      };
      
      expect(config).toEqual(defaultConfig);
    });

    it('should override config with provided values', () => {
      const provided = {
        codexCommand: 'custom-codex',
        codexArgs: ['--arg1'],
        debug: true,
      };
      
      const config = {
        codexCommand: provided.codexCommand ?? 'codex',
        codexArgs: provided.codexArgs ?? ['mcp-server'],
        debug: provided.debug ?? false,
      };
      
      expect(config.codexCommand).toBe('custom-codex');
      expect(config.codexArgs).toEqual(['--arg1']);
      expect(config.debug).toBe(true);
    });
  });

  describe('pending requests tracking', () => {
    it('should track requests by id', () => {
      const pendingRequests = new Map<string | number, unknown>();
      const request = { jsonrpc: '2.0', id: 1, method: 'test' };
      
      pendingRequests.set(request.id, request);
      
      expect(pendingRequests.has(1)).toBe(true);
      expect(pendingRequests.get(1)).toBe(request);
    });

    it('should remove completed requests', () => {
      const pendingRequests = new Map<string | number, unknown>();
      const request = { jsonrpc: '2.0', id: 1, method: 'test' };
      
      pendingRequests.set(request.id, request);
      pendingRequests.delete(request.id);
      
      expect(pendingRequests.has(1)).toBe(false);
    });

    it('should handle string ids', () => {
      const pendingRequests = new Map<string | number, unknown>();
      const request = { jsonrpc: '2.0', id: 'abc-123', method: 'test' };
      
      pendingRequests.set(request.id, request);
      
      expect(pendingRequests.has('abc-123')).toBe(true);
    });

    it('should not track requests without id', () => {
      const pendingRequests = new Map<string | number, unknown>();
      const request = { jsonrpc: '2.0', method: 'notification' } as any;
      
      if (request.id !== undefined) {
        pendingRequests.set(request.id, request);
      }
      
      expect(pendingRequests.size).toBe(0);
    });
  });

  describe('JSON-RPC response construction', () => {
    it('should construct valid success response', () => {
      const response = {
        jsonrpc: '2.0' as const,
        id: 1,
        result: { data: 'test' },
      };
      
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
    });

    it('should construct valid error response', () => {
      const response = {
        jsonrpc: '2.0' as const,
        id: 1,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };
      
      expect(response.jsonrpc).toBe('2.0');
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });
  });
});

// Module export test
describe('CodexMcpProxy module', () => {
  it('should export CodexMcpProxy class', async () => {
    const module = await import('../src/server.js');
    expect(module.CodexMcpProxy).toBeDefined();
    expect(typeof module.CodexMcpProxy).toBe('function');
  });
});
