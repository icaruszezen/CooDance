#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCoodanceMcpServer } from './server.js';

async function main(): Promise<void> {
  const server = createCoodanceMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  process.stderr.write('[coodance-mcp] CooDance Studio MCP stdio server ready.\n');

  const shutdown = async () => {
    await server.close().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

main().catch((err) => {
  process.stderr.write(
    `[coodance-mcp] Fatal startup error: ${err instanceof Error ? err.stack || err.message : String(err)}\n`,
  );
  process.exit(1);
});
