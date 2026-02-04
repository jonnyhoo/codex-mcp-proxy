# Codex MCP Proxy

一个轻量级 MCP 代理服务器，用于解决 Codex MCP Server 与 Warp 的兼容性问题。

> 🤖 **For LLM Integration**: See [LLM_GUIDE.md](./LLM_GUIDE.md) for detailed tool descriptions, error handling, and workflow examples.

## 问题背景

Warp 在连接 MCP Server 时会发送 `resources/list` 请求，但 Codex 上游实现仅打印日志而不返回响应，导致 Warp 一直等待。

## 解决方案

本代理作为中间层：
- 拦截 `resources/list` 请求，返回空列表
- 拦截 `resources/read` 请求，返回资源未找到错误
- 透传所有其他请求到 `codex mcp-server`

## 安装

```bash
npm install
npm run build
```

## 使用方法

### 在 Warp 中配置

编辑 MCP 配置文件：

```json
{
  "mcpServers": {
    "codex": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/Administrator/Desktop/sicko/codex-mcp-proxy/dist/index.js"]
    }
  }
}
```

### 环境变量

- `CODEX_MCP_DEBUG=1` - 启用调试日志

### 直接运行

```bash
npm start
# 或开发模式
npm run dev
```

## 开发

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 运行测试并查看覆盖率
npm run test:coverage

# 类型检查
npm run typecheck

# 构建
npm run build
```

## 架构

```
┌─────────┐     ┌──────────────┐     ┌─────────────────┐
│  Warp   │────▶│ codex-mcp-   │────▶│ codex mcp-server│
│ (Client)│◀────│    proxy     │◀────│   (upstream)    │
└─────────┘     └──────────────┘     └─────────────────┘
                      │
                      ▼
              拦截 resources/*
              返回空列表/错误
```

## 测试覆盖率

- Parser: 100%
- Server: 80%+
- Types: 100%

## Error Handling

错误响应包含 LLM 友好的详细信息：

```json
{
  "error": {
    "code": -32603,
    "message": "Codex service is not available",
    "data": {
      "detail": "The Codex backend process is not running or failed to start.",
      "suggestion": "Wait a few seconds and retry. If the problem persists, restart the MCP server.",
      "retryable": true,
      "method": "tools/call"
    }
  }
}
```

## License

MIT
