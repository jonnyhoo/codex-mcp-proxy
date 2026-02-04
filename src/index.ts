#!/usr/bin/env node

import { CodexMcpProxy } from './server.js';

const DEBUG = process.env.CODEX_MCP_DEBUG === '1';

async function main(): Promise<void> {
  const proxy = new CodexMcpProxy({ debug: DEBUG });

  proxy.on('error', (err) => {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  });

  proxy.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  // 优雅退出
  process.on('SIGINT', () => {
    proxy.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    proxy.stop();
    process.exit(0);
  });

  await proxy.start();
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
