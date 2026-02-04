import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, type ProxyConfig } from '../src/types.js';

describe('DEFAULT_CONFIG', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_CONFIG.codexCommand).toBe('codex');
    expect(DEFAULT_CONFIG.codexArgs).toEqual(['mcp-server']);
    expect(DEFAULT_CONFIG.debug).toBe(false);
  });

  it('should be a valid ProxyConfig', () => {
    const config: ProxyConfig = DEFAULT_CONFIG;
    expect(config).toBeDefined();
  });
});

describe('Type definitions', () => {
  it('should allow valid JsonRpcRequest', () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'test',
      params: { key: 'value' },
    };
    expect(request.jsonrpc).toBe('2.0');
  });

  it('should allow valid JsonRpcResponse with result', () => {
    const response = {
      jsonrpc: '2.0' as const,
      id: 1,
      result: { data: 'test' },
    };
    expect(response.result).toBeDefined();
  });

  it('should allow valid JsonRpcResponse with error', () => {
    const response = {
      jsonrpc: '2.0' as const,
      id: 1,
      error: {
        code: -32600,
        message: 'Invalid Request',
        data: { details: 'more info' },
      },
    };
    expect(response.error?.code).toBe(-32600);
  });

  it('should allow valid CodexToolArguments', () => {
    const args = {
      prompt: 'list files',
      model: 'gpt-5.2',
      cwd: '/home/user',
      'approval-policy': 'untrusted' as const,
      sandbox: 'read-only' as const,
      config: { reasoning_effort: 'high' },
    };
    expect(args.prompt).toBe('list files');
  });

  it('should allow valid CodexReplyArguments', () => {
    const args = {
      threadId: 'abc-123',
      prompt: 'continue',
    };
    expect(args.threadId).toBe('abc-123');
  });

  it('should allow valid McpListResourcesResult', () => {
    const result = {
      resources: [
        { uri: 'file:///test', name: 'test', description: 'A test resource' },
      ],
      nextCursor: 'cursor-123',
    };
    expect(result.resources).toHaveLength(1);
  });

  it('should allow valid McpListToolsResult', () => {
    const result = {
      tools: [
        {
          name: 'codex',
          description: 'Run codex',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    };
    expect(result.tools).toHaveLength(1);
  });
});
