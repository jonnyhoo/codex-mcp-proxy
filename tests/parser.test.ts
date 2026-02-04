import { describe, it, expect, beforeEach } from 'vitest';
import { MessageParser, serializeMessage } from '../src/parser.js';

describe('MessageParser', () => {
  let parser: MessageParser;

  beforeEach(() => {
    parser = new MessageParser();
  });

  describe('parse', () => {
    it('should parse a complete JSON message', () => {
      const input = '{"jsonrpc":"2.0","id":1,"method":"test"}';
      const messages = parser.parse(input);
      
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });
    });

    it('should parse multiple messages in one chunk', () => {
      const input = '{"jsonrpc":"2.0","id":1,"method":"a"}{"jsonrpc":"2.0","id":2,"method":"b"}';
      const messages = parser.parse(input);
      
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ jsonrpc: '2.0', id: 1, method: 'a' });
      expect(messages[1]).toEqual({ jsonrpc: '2.0', id: 2, method: 'b' });
    });

    it('should handle messages split across chunks', () => {
      const msg1 = parser.parse('{"jsonrpc":"2.0"');
      expect(msg1).toHaveLength(0);

      const msg2 = parser.parse(',"id":1,"method":"test"}');
      expect(msg2).toHaveLength(1);
      expect(msg2[0]).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });
    });

    it('should handle nested JSON objects', () => {
      const input = '{"jsonrpc":"2.0","id":1,"method":"test","params":{"nested":{"deep":"value"}}}';
      const messages = parser.parse(input);
      
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
        params: { nested: { deep: 'value' } },
      });
    });

    it('should handle strings with escaped quotes', () => {
      const input = '{"jsonrpc":"2.0","id":1,"method":"test","params":{"msg":"hello \\"world\\""}}';
      const messages = parser.parse(input);
      
      expect(messages).toHaveLength(1);
      expect((messages[0] as any).params.msg).toBe('hello "world"');
    });

    it('should handle strings with braces', () => {
      const input = '{"jsonrpc":"2.0","id":1,"method":"test","params":{"code":"if (a) { b }"}}';
      const messages = parser.parse(input);
      
      expect(messages).toHaveLength(1);
      expect((messages[0] as any).params.code).toBe('if (a) { b }');
    });

    it('should skip non-JSON prefix (like log output)', () => {
      const input = 'Some log output\n{"jsonrpc":"2.0","id":1,"method":"test"}';
      const messages = parser.parse(input);
      
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });
    });

    it('should handle empty input', () => {
      const messages = parser.parse('');
      expect(messages).toHaveLength(0);
    });

    it('should handle whitespace-only input', () => {
      const messages = parser.parse('   \n\t  ');
      expect(messages).toHaveLength(0);
    });

    it('should return empty for incomplete JSON', () => {
      const messages = parser.parse('{"incomplete":');
      expect(messages).toHaveLength(0);
    });

    it('should handle messages with newlines between them', () => {
      const input = '{"jsonrpc":"2.0","id":1,"method":"a"}\n\n{"jsonrpc":"2.0","id":2,"method":"b"}';
      const messages = parser.parse(input);
      
      expect(messages).toHaveLength(2);
    });

    it('should parse JSON-RPC batch arrays', () => {
      const input = '[{"jsonrpc":"2.0","id":1,"method":"a"},{"jsonrpc":"2.0","id":2,"method":"b"}]';
      const messages = parser.parse(input);
      
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ jsonrpc: '2.0', id: 1, method: 'a' });
      expect(messages[1]).toEqual({ jsonrpc: '2.0', id: 2, method: 'b' });
    });

    it('should skip invalid JSON-RPC messages', () => {
      // Missing jsonrpc field
      const input = '{"id":1,"method":"test"}';
      const messages = parser.parse(input);
      
      expect(messages).toHaveLength(0);
    });

    it('should parse response messages', () => {
      const input = '{"jsonrpc":"2.0","id":1,"result":{"data":"value"}}';
      const messages = parser.parse(input);
      
      expect(messages).toHaveLength(1);
      expect((messages[0] as any).result).toEqual({ data: 'value' });
    });
  });

  describe('clear', () => {
    it('should clear the buffer', () => {
      parser.parse('{"incomplete":');
      expect(parser.getBuffer()).not.toBe('');
      
      parser.clear();
      expect(parser.getBuffer()).toBe('');
    });
  });

  describe('getBuffer', () => {
    it('should return current buffer contents', () => {
      parser.parse('{"partial');
      expect(parser.getBuffer()).toBe('{"partial');
    });

    it('should return empty string for empty buffer', () => {
      expect(parser.getBuffer()).toBe('');
    });
  });
});

describe('serializeMessage', () => {
  it('should serialize message with newline', () => {
    const msg = { jsonrpc: '2.0' as const, id: 1, method: 'test' };
    const result = serializeMessage(msg);
    
    expect(result).toBe('{"jsonrpc":"2.0","id":1,"method":"test"}\n');
  });

  it('should serialize response with result', () => {
    const msg = { jsonrpc: '2.0' as const, id: 1, result: { data: 'value' } };
    const result = serializeMessage(msg);
    
    expect(result).toContain('"result":{"data":"value"}');
    expect(result.endsWith('\n')).toBe(true);
  });

  it('should serialize response with error', () => {
    const msg = {
      jsonrpc: '2.0' as const,
      id: 1,
      error: { code: -32600, message: 'Invalid Request' },
    };
    const result = serializeMessage(msg);
    
    expect(result).toContain('"error"');
    expect(result).toContain('-32600');
  });
});
