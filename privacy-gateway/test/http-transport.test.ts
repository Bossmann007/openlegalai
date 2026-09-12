import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MCP_PATH, ROLE_HEADER, startHttpServer, USER_HEADER } from '../src/mcp/http-server.js';

const CASE_ID = 'case-banco-001';

let server: ReturnType<typeof startHttpServer>;
let baseUrl: URL;

beforeAll(async () => {
  server = startHttpServer(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = new URL(`http://127.0.0.1:${port}${MCP_PATH}`);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function connect(userId: string, role: string): Promise<Client> {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(baseUrl, {
      requestInit: {
        headers: { [USER_HEADER]: userId, [ROLE_HEADER]: role },
      },
    }),
  );
  return client;
}

function wireOf(result: unknown): string {
  const content = (result as { content: { type: string; text: string }[] }).content;
  return content[0]?.text ?? '';
}

describe('mcp over streamable http', () => {
  it('advertises the same allowlist as stdio', async () => {
    const client = await connect('adv-ana', 'advogado');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'ask_office',
        'enter_office',
        'get_safe_conversation',
        'get_safe_summary',
        'leave_office',
        'post_message',
      ].sort(),
    );
    await client.close();
  });

  /**
   * Regression: the office used to be rebuilt per HTTP request, so a session id
   * handed out by enter_office was already forgotten by the next call. A
   * transport that cannot hold a session is not a usable transport.
   */
  it('keeps an office session alive across separate http requests', async () => {
    const client = await connect('adv-ana', 'advogado');

    const opened = await client.callTool({
      name: 'enter_office',
      arguments: { caseId: CASE_ID },
    });
    expect(opened.isError).toBeFalsy();
    const sessionId = (opened.structuredContent as { sessionId: string }).sessionId;
    expect(sessionId).toMatch(/^ofs_/);

    const conversation = await client.callTool({
      name: 'get_safe_conversation',
      arguments: { sessionId },
    });
    expect(conversation.isError).toBeFalsy();
    expect(wireOf(conversation)).toContain('mensagens');

    await client.close();
  });

  it('refuses a connection without an identity header', async () => {
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await expect(
      client.connect(new StreamableHTTPClientTransport(baseUrl)),
    ).rejects.toThrow();
  });

  it('does not let one principal use another principal session', async () => {
    const intern = await connect('est-lia', 'estagiario');
    const opened = await intern.callTool({
      name: 'enter_office',
      arguments: { caseId: CASE_ID },
    });
    const sessionId = (opened.structuredContent as { sessionId: string }).sessionId;
    await intern.close();

    const partner = await connect('socio-paulo', 'socio');
    const stolen = await partner.callTool({
      name: 'get_safe_conversation',
      arguments: { sessionId },
    });
    expect(stolen.isError).toBe(true);
    await partner.close();
  });
});
