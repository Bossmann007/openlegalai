import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpOfficeServer } from './mcp-office-server.js';
import { parseConnectionFromEnv } from './connection-context.js';
import { TOOL_DEFINITIONS } from './tool-definitions.js';


function buildServer(): Server {
  const connection = parseConnectionFromEnv();
  const office = new McpOfficeServer({ connection });
  const server = new Server(
    { name: 'openlegalai-virtual-office', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...TOOL_DEFINITIONS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return office.callTool({ name, arguments: args });
  });

  return server;
}

async function main() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : 'stdio_boot_failed';
  console.error(message);
  process.exit(1);
});
