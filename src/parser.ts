import type { JsonRpcRequest, JsonRpcResponse } from './types.js';
import { isJsonRpcRequest, isJsonRpcResponse, isJsonRpcBatch } from './types.js';

export type ParsedMessage = JsonRpcRequest | JsonRpcResponse;
export type ParseResult = ParsedMessage | ParsedMessage[];

/**
 * JSON-RPC 消息解析器
 * 处理 stdio 流中的 JSON-RPC 消息分割和解析
 * 支持单个对象 {...} 和批量数组 [...]
 */
export class MessageParser {
  private buffer = '';

  /**
   * 向缓冲区追加数据并尝试解析完整消息
   * 返回扁平化的消息数组（批量请求会被展开）
   */
  parse(chunk: string): ParsedMessage[] {
    this.buffer += chunk;
    const messages: ParsedMessage[] = [];

    while (true) {
      const result = this.tryExtractMessage();
      if (!result) break;
      
      // 展开批量请求
      if (Array.isArray(result)) {
        messages.push(...result);
      } else {
        messages.push(result);
      }
    }

    return messages;
  }

  /**
   * 尝试从缓冲区提取一条完整的 JSON 消息（对象或数组）
   */
  private tryExtractMessage(): ParseResult | null {
    const trimmed = this.buffer.trimStart();
    
    // 找到 JSON 开始字符（{ 或 [）
    const objectStart = trimmed.startsWith('{');
    const arrayStart = trimmed.startsWith('[');
    
    if (!objectStart && !arrayStart) {
      // 清理非 JSON 前缀（如日志输出）
      const objIndex = this.buffer.indexOf('{');
      const arrIndex = this.buffer.indexOf('[');
      
      let jsonStart = -1;
      if (objIndex === -1 && arrIndex === -1) {
        this.buffer = '';
        return null;
      } else if (objIndex === -1) {
        jsonStart = arrIndex;
      } else if (arrIndex === -1) {
        jsonStart = objIndex;
      } else {
        jsonStart = Math.min(objIndex, arrIndex);
      }
      
      this.buffer = this.buffer.slice(jsonStart);
    }

    // 确定是对象还是数组
    const isArray = this.buffer.trimStart().startsWith('[');
    const endIndex = isArray 
      ? this.findJsonArrayEnd(this.buffer)
      : this.findJsonObjectEnd(this.buffer);
      
    if (endIndex === -1) return null;

    const jsonStr = this.buffer.slice(0, endIndex + 1);
    this.buffer = this.buffer.slice(endIndex + 1);

    try {
      const parsed = JSON.parse(jsonStr);
      
      // 验证并返回
      if (Array.isArray(parsed)) {
        if (isJsonRpcBatch(parsed)) {
          return parsed;
        }
        // 无效的批量请求，跳过
        return null;
      }
      
      if (isJsonRpcRequest(parsed) || isJsonRpcResponse(parsed)) {
        return parsed;
      }
      
      // 无效的 JSON-RPC 消息，跳过
      return null;
    } catch {
      // 解析失败，可能是不完整的 JSON，继续等待
      return null;
    }
  }

  /**
   * 找到 JSON 对象的结束位置
   */
  private findJsonObjectEnd(str: string): number {
    return this.findJsonEnd(str, '{', '}');
  }

  /**
   * 找到 JSON 数组的结束位置
   */
  private findJsonArrayEnd(str: string): number {
    return this.findJsonEnd(str, '[', ']');
  }

  /**
   * 通用的 JSON 结束位置查找
   */
  private findJsonEnd(str: string, openChar: string, closeChar: string): number {
    let depth = 0;
    let inString = false;
    let escape = false;
    let started = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === openChar) {
        depth++;
        started = true;
      } else if (char === closeChar) {
        depth--;
        if (started && depth === 0) return i;
      }
    }

    return -1;
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.buffer = '';
  }

  /**
   * 获取当前缓冲区内容（用于调试）
   */
  getBuffer(): string {
    return this.buffer;
  }
}

/**
 * 序列化 JSON-RPC 消息
 */
export function serializeMessage(message: JsonRpcRequest | JsonRpcResponse): string {
  return JSON.stringify(message) + '\n';
}
