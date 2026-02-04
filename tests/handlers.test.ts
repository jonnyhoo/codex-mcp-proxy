import { describe, it, expect, beforeEach } from 'vitest';
import {
  isNotification,
  createEmptyResourcesResponse,
  createResourceNotFoundResponse,
  createErrorResponse,
  handleRequest,
  createConfig,
  RequestTracker,
  formatLogMessage,
  shouldLog,
  enhanceToolsListResponse,
  shouldEnhanceResponse,
  ENHANCED_TOOL_DESCRIPTIONS,
} from '../src/handlers.js';

describe('isNotification', () => {
  it('should return true for request without id', () => {
    const request = { jsonrpc: '2.0' as const, method: 'notifications/initialized' };
    expect(isNotification(request)).toBe(true);
  });

  it('should return false for request with id', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'tools/list' };
    expect(isNotification(request)).toBe(false);
  });

  it('should return false for request with string id', () => {
    const request = { jsonrpc: '2.0' as const, id: 'abc', method: 'tools/list' };
    expect(isNotification(request)).toBe(false);
  });
});

describe('createEmptyResourcesResponse', () => {
  it('should create response with numeric id', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'resources/list' };
    const response = createEmptyResourcesResponse(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { resources: [] },
    });
  });

  it('should create response with string id', () => {
    const request = { jsonrpc: '2.0' as const, id: 'abc-123', method: 'resources/list' };
    const response = createEmptyResourcesResponse(request);

    expect(response?.id).toBe('abc-123');
  });

  it('should return null for notification (no id)', () => {
    const request = { jsonrpc: '2.0' as const, method: 'resources/list' };
    const response = createEmptyResourcesResponse(request);

    expect(response).toBeNull();
  });

  it('should always return empty resources array for request with id', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'resources/list' };
    const response = createEmptyResourcesResponse(request);

    expect(response?.result).toEqual({ resources: [] });
  });
});

describe('createResourceNotFoundResponse', () => {
  it('should create error response with correct code', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'resources/read' };
    const response = createResourceNotFoundResponse(request);

    expect(response?.error?.code).toBe(-32002);
  });

  it('should create error response with correct message', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'resources/read' };
    const response = createResourceNotFoundResponse(request);

    expect(response?.error?.message).toBe('Resource not found');
  });

  it('should preserve request id', () => {
    const request = { jsonrpc: '2.0' as const, id: 42, method: 'resources/read' };
    const response = createResourceNotFoundResponse(request);

    expect(response?.id).toBe(42);
  });

  it('should return null for notification (no id)', () => {
    const request = { jsonrpc: '2.0' as const, method: 'resources/read' };
    const response = createResourceNotFoundResponse(request);

    expect(response).toBeNull();
  });
});

describe('createErrorResponse', () => {
  it('should create error response with custom code and message', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'test' };
    const response = createErrorResponse(request, -32603, 'Internal error');

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32603, message: 'Internal error' },
    });
  });

  it('should return null for notification', () => {
    const request = { jsonrpc: '2.0' as const, method: 'test' };
    const response = createErrorResponse(request, -32603, 'Internal error');

    expect(response).toBeNull();
  });
});

describe('handleRequest', () => {
  it('should return response for resources/list', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'resources/list' };
    const response = handleRequest(request);

    expect(response).not.toBeNull();
    expect(response?.result).toEqual({ resources: [] });
  });

  it('should return error response for resources/read', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'resources/read' };
    const response = handleRequest(request);

    expect(response).not.toBeNull();
    expect(response?.error?.code).toBe(-32002);
  });

  it('should return null for tools/list', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'tools/list' };
    const response = handleRequest(request);

    expect(response).toBeNull();
  });

  it('should return null for tools/call', () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'tools/call' };
    const response = handleRequest(request);

    expect(response).toBeNull();
  });

  it('should return null for initialize', () => {
    const request = { jsonrpc: '2.0' as const, id: 0, method: 'initialize' };
    const response = handleRequest(request);

    expect(response).toBeNull();
  });
});

describe('createConfig', () => {
  it('should use defaults when no options provided', () => {
    const config = createConfig({});

    expect(config).toEqual({
      codexCommand: 'codex',
      codexArgs: ['mcp-server'],
      debug: false,
    });
  });

  it('should override codexCommand', () => {
    const config = createConfig({ codexCommand: 'my-codex' });

    expect(config.codexCommand).toBe('my-codex');
  });

  it('should override codexArgs', () => {
    const config = createConfig({ codexArgs: ['--custom'] });

    expect(config.codexArgs).toEqual(['--custom']);
  });

  it('should override debug', () => {
    const config = createConfig({ debug: true });

    expect(config.debug).toBe(true);
  });

  it('should handle partial overrides', () => {
    const config = createConfig({ codexCommand: 'custom', debug: true });

    expect(config.codexCommand).toBe('custom');
    expect(config.codexArgs).toEqual(['mcp-server']); // default
    expect(config.debug).toBe(true);
  });
});

describe('RequestTracker', () => {
  let tracker: RequestTracker;

  beforeEach(() => {
    tracker = new RequestTracker();
  });

  describe('track', () => {
    it('should track request with numeric id', () => {
      const request = { jsonrpc: '2.0' as const, id: 1, method: 'test' };
      tracker.track(request);

      expect(tracker.has(1)).toBe(true);
    });

    it('should track request with string id', () => {
      const request = { jsonrpc: '2.0' as const, id: 'abc', method: 'test' };
      tracker.track(request);

      expect(tracker.has('abc')).toBe(true);
    });

    it('should not track request without id', () => {
      const request = { jsonrpc: '2.0' as const, method: 'notification' };
      tracker.track(request);

      expect(tracker.size).toBe(0);
    });
  });

  describe('complete', () => {
    it('should return tracked request', () => {
      const request = { jsonrpc: '2.0' as const, id: 1, method: 'test' };
      tracker.track(request);

      const completed = tracker.complete(1);
      expect(completed).toBe(request);
    });

    it('should remove request after completion', () => {
      const request = { jsonrpc: '2.0' as const, id: 1, method: 'test' };
      tracker.track(request);
      tracker.complete(1);

      expect(tracker.has(1)).toBe(false);
    });

    it('should return undefined for unknown id', () => {
      const completed = tracker.complete(999);
      expect(completed).toBeUndefined();
    });

    it('should return undefined for null id', () => {
      const completed = tracker.complete(null);
      expect(completed).toBeUndefined();
    });

    it('should return undefined for undefined id', () => {
      const completed = tracker.complete(undefined);
      expect(completed).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should return 0 for empty tracker', () => {
      expect(tracker.size).toBe(0);
    });

    it('should return correct count', () => {
      tracker.track({ jsonrpc: '2.0' as const, id: 1, method: 'a' });
      tracker.track({ jsonrpc: '2.0' as const, id: 2, method: 'b' });

      expect(tracker.size).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all tracked requests', () => {
      tracker.track({ jsonrpc: '2.0' as const, id: 1, method: 'a' });
      tracker.track({ jsonrpc: '2.0' as const, id: 2, method: 'b' });
      tracker.clear();

      expect(tracker.size).toBe(0);
    });
  });

  describe('has', () => {
    it('should return true for tracked id', () => {
      tracker.track({ jsonrpc: '2.0' as const, id: 1, method: 'test' });
      expect(tracker.has(1)).toBe(true);
    });

    it('should return false for untracked id', () => {
      expect(tracker.has(999)).toBe(false);
    });
  });
});

describe('formatLogMessage', () => {
  it('should format debug message', () => {
    const msg = formatLogMessage('debug', 'test message');

    expect(msg).toContain('[DEBUG]');
    expect(msg).toContain('test message');
    expect(msg.endsWith('\n')).toBe(true);
  });

  it('should format info message', () => {
    const msg = formatLogMessage('info', 'info message');

    expect(msg).toContain('[INFO]');
    expect(msg).toContain('info message');
  });

  it('should format error message', () => {
    const msg = formatLogMessage('error', 'error message');

    expect(msg).toContain('[ERROR]');
    expect(msg).toContain('error message');
  });

  it('should include ISO timestamp', () => {
    const msg = formatLogMessage('info', 'test');

    // ISO timestamp format: 2024-01-01T00:00:00.000Z
    expect(msg).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('shouldLog', () => {
  it('should return false for debug when debug is disabled', () => {
    expect(shouldLog('debug', false)).toBe(false);
  });

  it('should return true for debug when debug is enabled', () => {
    expect(shouldLog('debug', true)).toBe(true);
  });

  it('should return true for info regardless of debug flag', () => {
    expect(shouldLog('info', false)).toBe(true);
    expect(shouldLog('info', true)).toBe(true);
  });

  it('should return true for error regardless of debug flag', () => {
    expect(shouldLog('error', false)).toBe(true);
    expect(shouldLog('error', true)).toBe(true);
  });
});

describe('shouldEnhanceResponse', () => {
  it('should return true for tools/list', () => {
    expect(shouldEnhanceResponse('tools/list')).toBe(true);
  });

  it('should return false for other methods', () => {
    expect(shouldEnhanceResponse('tools/call')).toBe(false);
    expect(shouldEnhanceResponse('initialize')).toBe(false);
    expect(shouldEnhanceResponse('resources/list')).toBe(false);
  });
});

describe('enhanceToolsListResponse', () => {
  it('should enhance codex tool description', () => {
    const response = {
      jsonrpc: '2.0' as const,
      id: 1,
      result: {
        tools: [
          { name: 'codex', description: 'Original description' },
        ],
      },
    };

    const enhanced = enhanceToolsListResponse(response);
    const tools = (enhanced.result as { tools: Array<{ name: string; description: string }> }).tools;

    expect(tools[0].description).toContain('Quick start');
    expect(tools[0].description).toContain('Use when');
    expect(tools[0].description).toContain('审查代码');
  });

  it('should enhance codex-reply tool description', () => {
    const response = {
      jsonrpc: '2.0' as const,
      id: 1,
      result: {
        tools: [
          { name: 'codex-reply', description: 'Original' },
        ],
      },
    };

    const enhanced = enhanceToolsListResponse(response);
    const tools = (enhanced.result as { tools: Array<{ name: string; description: string }> }).tools;

    expect(tools[0].description).toContain('threadId');
    expect(tools[0].description).toContain('继续');
  });

  it('should preserve unknown tools', () => {
    const response = {
      jsonrpc: '2.0' as const,
      id: 1,
      result: {
        tools: [
          { name: 'unknown-tool', description: 'Keep this' },
        ],
      },
    };

    const enhanced = enhanceToolsListResponse(response);
    const tools = (enhanced.result as { tools: Array<{ name: string; description: string }> }).tools;

    expect(tools[0].description).toBe('Keep this');
  });

  it('should handle response without tools', () => {
    const response = {
      jsonrpc: '2.0' as const,
      id: 1,
      result: {},
    };

    const enhanced = enhanceToolsListResponse(response);
    expect(enhanced).toEqual(response);
  });

  it('should handle response without result', () => {
    const response = {
      jsonrpc: '2.0' as const,
      id: 1,
      error: { code: -32600, message: 'Error' },
    };

    const enhanced = enhanceToolsListResponse(response);
    expect(enhanced).toEqual(response);
  });
});

describe('ENHANCED_TOOL_DESCRIPTIONS', () => {
  it('should have codex tool with LLM-friendly description', () => {
    const codex = ENHANCED_TOOL_DESCRIPTIONS.codex;
    expect(codex).toBeDefined();
    expect(codex.description).toContain('Quick start');
    expect(codex.description).toContain('Best practices');
    expect(codex.description).toContain('Workflow');
    expect(codex.description).toContain('Use when');
  });

  it('should have codex-reply tool with LLM-friendly description', () => {
    const reply = ENHANCED_TOOL_DESCRIPTIONS['codex-reply'];
    expect(reply).toBeDefined();
    expect(reply.description).toContain('Example');
    expect(reply.description).toContain('When to use');
    expect(reply.description).toContain('Important');
  });

  it('should have proper inputSchema for codex', () => {
    const schema = ENHANCED_TOOL_DESCRIPTIONS.codex.inputSchema;
    expect(schema).toBeDefined();
    expect(schema?.properties).toHaveProperty('prompt');
    expect(schema?.properties).toHaveProperty('cwd');
    expect(schema?.properties).toHaveProperty('sandbox');
  });
});
