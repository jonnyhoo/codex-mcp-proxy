import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JsonRpcRequest, JsonRpcResponse, ProxyConfig } from './types.js';
import { isJsonRpcRequest, isJsonRpcResponse } from './types.js';
import { MessageParser, serializeMessage } from './parser.js';
import {
  handleRequest,
  createConfig,
  createUpstreamUnavailableError,
  createUpstreamConnectionLostError,
  createUpstreamSendFailedError,
  RequestTracker,
  formatLogMessage,
  shouldLog,
  isNotification,
  enhanceToolsListResponse,
  shouldEnhanceResponse,
} from './handlers.js';

/**
 * Codex MCP 代理服务器
 * 
 * 作为中间层代理，解决 Warp 兼容性问题：
 * - 拦截 resources/list 请求并返回空列表
 * - 透传其他所有请求到 codex mcp-server
 */
export class CodexMcpProxy extends EventEmitter {
  private config: ProxyConfig;
  private codexProcess: ChildProcess | null = null;
  private inputParser = new MessageParser();
  private outputParser = new MessageParser();
  private requestTracker = new RequestTracker();
  private upstreamAvailable = false;

  constructor(config: Partial<ProxyConfig> = {}) {
    super();
    this.config = createConfig(config);
  }

  /**
   * 启动代理服务器
   */
  async start(): Promise<void> {
    this.requestTracker.startCleanup();
    this.spawnCodexProcess();
    this.setupStdioHandlers();
  }

  /**
   * 解析命令路径（Windows 下查找 .cmd/.bat 扩展）
   */
  private resolveCommand(command: string): string {
    if (process.platform !== 'win32') {
      return command;
    }

    // 如果已经有扩展名，直接返回
    if (/\.(cmd|bat|exe)$/i.test(command)) {
      return command;
    }

    // 尝试查找 .cmd 或 .bat 文件
    const pathDirs = (process.env.PATH || '').split(';');
    for (const dir of pathDirs) {
      for (const ext of ['.cmd', '.bat', '.exe']) {
        const fullPath = join(dir, command + ext);
        if (existsSync(fullPath)) {
          return fullPath;
        }
      }
    }

    // 找不到则返回原命令
    return command;
  }

  /**
   * 启动 codex mcp-server 子进程
   */
  private spawnCodexProcess(): void {
    const resolvedCommand = this.resolveCommand(this.config.codexCommand);
    
    this.codexProcess = spawn(resolvedCommand, this.config.codexArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false, // 避免 shell 注入风险
      windowsHide: true,
    });

    this.codexProcess.on('spawn', () => {
      this.upstreamAvailable = true;
      this.log('info', 'Codex process started');
    });

    this.codexProcess.on('error', (err) => {
      this.upstreamAvailable = false;
      this.log('error', `Codex process error: ${err.message}`);
      this.emit('error', err);
    });

    this.codexProcess.on('exit', (code, signal) => {
      this.upstreamAvailable = false;
      this.log('info', `Codex process exited: code=${code}, signal=${signal}`);
      this.emit('exit', code, signal);
    });

    // 处理 codex 的 stdout（响应）
    this.codexProcess.stdout?.on('data', (data: Buffer) => {
      const messages = this.outputParser.parse(data.toString());
      for (const msg of messages) {
        if (isJsonRpcResponse(msg)) {
          this.handleCodexResponse(msg);
        }
      }
    });

    // 处理 stdout 错误
    this.codexProcess.stdout?.on('error', (err) => {
      this.log('error', `Codex stdout error: ${err.message}`);
    });

    // 转发 codex 的 stderr
    this.codexProcess.stderr?.on('data', (data: Buffer) => {
      this.log('debug', `[codex stderr] ${data.toString().trim()}`);
    });

    // 处理 stderr 错误
    this.codexProcess.stderr?.on('error', (err) => {
      this.log('error', `Codex stderr error: ${err.message}`);
    });

    // 处理 stdin 错误
    this.codexProcess.stdin?.on('error', (err) => {
      this.log('error', `Codex stdin error: ${err.message}`);
    });
  }

  /**
   * 设置标准输入输出处理
   */
  private setupStdioHandlers(): void {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      const messages = this.inputParser.parse(chunk);
      for (const msg of messages) {
        if (isJsonRpcRequest(msg)) {
          this.handleClientRequest(msg);
        }
      }
    });

    process.stdin.on('end', () => {
      this.log('info', 'Client disconnected');
      this.stop();
    });

    process.stdin.on('error', (err) => {
      this.log('error', `Stdin error: ${err.message}`);
    });
  }

  /**
   * 处理客户端请求
   */
  private handleClientRequest(request: JsonRpcRequest): void {
    this.log('debug', `← Client: ${request.method}`);

    // 尝试拦截处理
    const interceptedResponse = handleRequest(request);
    if (interceptedResponse) {
      this.log('debug', `→ Intercepted ${request.method}`);
      this.sendToClient(interceptedResponse);
      return;
    }

    // 检查上游是否可用
    if (!this.upstreamAvailable) {
      this.log('error', `Upstream unavailable for ${request.method}`);
      const errorResponse = createUpstreamUnavailableError(request);
      if (errorResponse) {
        this.sendToClient(errorResponse);
      }
      return;
    }

    // 记录请求以便匹配响应（仅对非通知）
    if (!isNotification(request)) {
      this.requestTracker.track(request);
    }

    // 透传到 codex
    this.forwardToCodex(request);
  }

  /**
   * 处理 codex 响应
   */
  private handleCodexResponse(response: JsonRpcResponse): void {
    this.log('debug', `→ Codex response: id=${response.id}`);

    // 清理已完成的请求并获取原始请求
    const originalRequest = this.requestTracker.complete(response.id);

    // 如果是 tools/list 响应，增强 tool descriptions
    let finalResponse = response;
    if (originalRequest && shouldEnhanceResponse(originalRequest.method)) {
      finalResponse = enhanceToolsListResponse(response);
      this.log('debug', `→ Enhanced ${originalRequest.method} response`);
    }

    // 转发给客户端
    this.sendToClient(finalResponse);
  }

  /**
   * 转发请求到 codex
   */
  private forwardToCodex(request: JsonRpcRequest): void {
    const stdin = this.codexProcess?.stdin;
    
    if (!stdin || !stdin.writable || stdin.writableEnded) {
      this.log('error', 'Codex process not available');
      const errorResponse = createUpstreamConnectionLostError(request);
      if (errorResponse) {
        this.sendToClient(errorResponse);
      }
      return;
    }

    const data = serializeMessage(request);
    stdin.write(data, (err) => {
      if (err) {
        this.log('error', `Failed to write to codex: ${err.message}`);
        const errorResponse = createUpstreamSendFailedError(request);
        if (errorResponse) {
          this.sendToClient(errorResponse);
        }
      }
    });
  }

  /**
   * 发送响应给客户端
   */
  private sendToClient(response: JsonRpcResponse): void {
    const data = serializeMessage(response);
    process.stdout.write(data);
  }

  /**
   * 停止代理服务器
   */
  stop(): void {
    if (this.codexProcess) {
      this.codexProcess.kill();
      this.codexProcess = null;
    }
    this.inputParser.clear();
    this.outputParser.clear();
    this.requestTracker.clear();
  }

  /**
   * 日志输出
   */
  private log(level: 'debug' | 'info' | 'error', message: string): void {
    if (!shouldLog(level, this.config.debug)) return;
    process.stderr.write(formatLogMessage(level, message));
  }
}
