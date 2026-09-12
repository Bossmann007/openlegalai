import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpOfficeServer } from './mcp-office-server.js';
import {
  CONNECTION_PRINCIPAL_MISSING,
  type ConnectionContext,
  isRole,
} from './connection-context.js';
import { VirtualOffice } from '../office/virtual-office.js';
import { TOOL_DEFINITIONS } from './tool-definitions.js';

export const MCP_PATH = '/mcp';
export const USER_HEADER = 'x-office-user-id';
export const ROLE_HEADER = 'x-office-role';
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Streamable HTTP transport for the office.
 *
 * stdio only serves clients that can spawn a local process. A subscription UI
 * reaching the office over the network needs HTTP, and that is the difference
 * between "one model connects" and "the lawyer keeps the model they pay for".
 *
 * The identity rule does not change with the transport: the principal comes
 * from the connection headers, never from tool arguments. What changes is who
 * asserts the headers, so in front of anything real this port belongs behind a
 * terminator that authenticates the caller and sets them itself — the headers
 * are the seam an OAuth resource server plugs into, not the authentication.
 *
 * The MCP layer is per request — one transport, one protocol server — but the
 * office behind it is process-wide. It has to be: `enter_office` hands back a
 * session id the caller uses on the next HTTP request, and a per-request office
 * would forget it immediately. Sharing is safe because a session is bound to
 * the principal that opened it, so one caller cannot ride another's session.
 */
export function parseConnectionFromHeaders(
  headers: IncomingMessage['headers'],
): ConnectionContext {
  const id = headers[USER_HEADER];
  const role = headers[ROLE_HEADER];
  const userId = Array.isArray(id) ? id[0] : id;
  const roleValue = Array.isArray(role) ? role[0] : role;

  if (!userId || !isRole(roleValue)) {
    throw new Error(CONNECTION_PRINCIPAL_MISSING);
  }
  return { principal: { id: userId, role: roleValue } };
}

function buildServer(
  connection: ConnectionContext,
  sharedOffice: VirtualOffice,
): Server {
  const office = new McpOfficeServer({ office: sharedOffice, connection });
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

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('BODY_TOO_LARGE');
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** One opaque shape for every rejection: no oracle about why it failed. */
function deny(res: ServerResponse, status: number): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({ error: 'Requested resource could not be accessed.' }),
  );
}

export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sharedOffice: VirtualOffice,
): Promise<void> {
  if (!req.url || !req.url.startsWith(MCP_PATH)) {
    deny(res, 404);
    return;
  }
  if (req.method !== 'POST') {
    deny(res, 405);
    return;
  }

  let connection: ConnectionContext;
  try {
    connection = parseConnectionFromHeaders(req.headers);
  } catch {
    deny(res, 401);
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    deny(res, 400);
    return;
  }

  const server = buildServer(connection, sharedOffice);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch {
    if (!res.headersSent) {
      deny(res, 500);
    }
  }
}

export function startHttpServer(port: number, office = new VirtualOffice()) {
  const http = createServer((req, res) => {
    void handleMcpRequest(req, res, office);
  });
  http.listen(port);
  return http;
}

const isEntrypoint =
  process.argv[1] !== undefined && process.argv[1].includes('http-server');

if (isEntrypoint) {
  const port = Number(process.env.OFFICE_HTTP_PORT ?? 8787);
  startHttpServer(port);
  process.stderr.write(`office mcp http listening on ${port}${MCP_PATH}\n`);
}
