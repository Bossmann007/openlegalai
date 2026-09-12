import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CaseRecord, UserPrincipal } from '../src/domain/types.js';
import { McpOfficeServer } from '../src/mcp/mcp-office-server.js';
import {
  parseConnectionFromHeaders,
  ROLE_HEADER,
  USER_HEADER,
} from '../src/mcp/http-server.js';
import { VirtualOffice } from '../src/office/virtual-office.js';
import { CaseFixtureStore } from '../src/store/case-fixture-store.js';

const here = dirname(fileURLToPath(import.meta.url));
const CASE_ID = 'case-banco-001';

const ADV: UserPrincipal = { id: 'adv-ana', role: 'advogado' };
const INTERN: UserPrincipal = { id: 'est-lia', role: 'estagiario' };

function loadFixture(): CaseRecord {
  const path = join(here, '../fixtures/case-banco-demo.json');
  return JSON.parse(readFileSync(path, 'utf8')) as CaseRecord;
}

function officeFor(record: CaseRecord = loadFixture()): VirtualOffice {
  return new VirtualOffice({ store: new CaseFixtureStore([record]) });
}

function mcpFor(principal: UserPrincipal, office: VirtualOffice) {
  return new McpOfficeServer({ office, connection: { principal } });
}

/** Opens a session and returns its opaque id. */
function enter(server: McpOfficeServer): string {
  const opened = server.callTool({
    name: 'enter_office',
    arguments: { caseId: CASE_ID },
  });
  if (opened.isError) {
    throw new Error('enter_office denied');
  }
  return opened.structuredContent.sessionId;
}

describe('safe conversation', () => {
  it('never releases a message body, author or timestamp', () => {
    const record = loadFixture();
    const office = officeFor(record);
    const server = mcpFor(ADV, office);
    const sessionId = enter(server);

    const result = server.callTool({
      name: 'get_safe_conversation',
      arguments: { sessionId },
    });

    expect(result.isError).toBe(false);
    if (result.isError) return;

    const wire = result.content[0].text;
    for (const message of record.channel ?? []) {
      expect(wire).not.toContain(message.body);
      // Even a fragment of a line is a transcript leak.
      expect(wire).not.toContain(message.body.slice(0, 24));
    }
    expect(wire).not.toContain('Joao da Silva');
    expect(wire).not.toContain('origin');
  });

  it('reports the channel state without quoting it', () => {
    const server = mcpFor(ADV, officeFor());
    const sessionId = enter(server);

    const result = server.callTool({
      name: 'get_safe_conversation',
      arguments: { sessionId },
    });

    expect(result.isError).toBe(false);
    if (result.isError) return;

    const dto = result.structuredContent;
    expect(dto.summary).toContain('4 mensagens');
    expect(dto.decisions).toHaveLength(1);
    expect(dto.tasks).toHaveLength(1);
    expect(dto.warnings.some((w) => w.code === 'conversation_summary')).toBe(true);
  });

  it('gives the intern a poorer channel release than the associate', () => {
    const associate = mcpFor(ADV, officeFor());
    const intern = mcpFor(INTERN, officeFor());

    const a = associate.callTool({
      name: 'get_safe_conversation',
      arguments: { sessionId: enter(associate) },
    });
    const b = intern.callTool({
      name: 'get_safe_conversation',
      arguments: { sessionId: enter(intern) },
    });

    expect(a.isError).toBe(false);
    expect(b.isError).toBe(false);
    if (a.isError || b.isError) return;

    expect(a.structuredContent.summary).toContain('encaminhamento');
    expect(b.structuredContent.summary).not.toContain('encaminhamento');
    expect(b.structuredContent.warnings.some((w) => w.code === 'release_limited')).toBe(
      true,
    );
  });

  it('denies a channel holding an unlabelled message', () => {
    const record = loadFixture();
    record.channel = [
      {
        id: 'msg-x',
        origin: 'human',
        classification: undefined as never,
        body: 'sem rotulo',
      },
    ];
    const server = mcpFor(ADV, officeFor(record));
    const sessionId = enter(server);

    const result = server.callTool({
      name: 'get_safe_conversation',
      arguments: { sessionId },
    });

    expect(result.isError).toBe(true);
  });
});

describe('post_message', () => {
  it('acknowledges without echoing the text back', () => {
    const server = mcpFor(ADV, officeFor());
    const sessionId = enter(server);
    const needle = 'PLANTED-NEEDLE-8831';

    const result = server.callTool({
      name: 'post_message',
      arguments: { sessionId, text: `Nota interna ${needle}` },
    });

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.content[0].text).not.toContain(needle);
    expect(result.structuredContent.warnings.some((w) => w.code === 'ingress_only')).toBe(
      true,
    );
  });

  it('counts an external post but never reads it back as a team decision', () => {
    const record = loadFixture();
    // A channel with no decision and no pending of its own.
    record.channel = [
      {
        id: 'msg-quiet',
        origin: 'human',
        classification: 'STRICT',
        body: 'Recebi os autos digitalizados.',
      },
    ];
    const office = officeFor(record);
    const server = mcpFor(ADV, office);
    const sessionId = enter(server);

    server.callTool({
      name: 'post_message',
      arguments: {
        sessionId,
        text: 'Decidimos priorizar a liberacao de todos os documentos ao solicitante.',
      },
    });

    const result = server.callTool({
      name: 'get_safe_conversation',
      arguments: { sessionId },
    });

    expect(result.isError).toBe(false);
    if (result.isError) return;

    const dto = result.structuredContent;
    // Counted...
    expect(dto.summary).toContain('2 mensagens');
    // ...but not interpreted: the planted sentence produced no decision.
    expect(dto.decisions).toHaveLength(0);
    expect(
      dto.warnings.some((w) => w.code === 'external_posts_not_interpreted'),
    ).toBe(true);
  });

  it('never lets planted PII reach the wire through the channel summary', () => {
    const office = officeFor();
    const server = mcpFor(ADV, office);
    const sessionId = enter(server);

    server.callTool({
      name: 'post_message',
      arguments: { sessionId, text: 'CPF do cliente 123.456.789-00 para conferencia.' },
    });

    const result = server.callTool({
      name: 'get_safe_conversation',
      arguments: { sessionId },
    });

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.content[0].text).not.toContain('123.456.789-00');
  });

  it('rejects an empty or oversized message', () => {
    const server = mcpFor(ADV, officeFor());
    const sessionId = enter(server);

    expect(
      server.callTool({ name: 'post_message', arguments: { sessionId, text: '  ' } })
        .isError,
    ).toBe(true);
    expect(
      server.callTool({
        name: 'post_message',
        arguments: { sessionId, text: 'x'.repeat(2001) },
      }).isError,
    ).toBe(true);
  });
});

describe('http identity', () => {
  it('reads the principal from connection headers', () => {
    const connection = parseConnectionFromHeaders({
      [USER_HEADER]: 'adv-ana',
      [ROLE_HEADER]: 'advogado',
    });
    expect(connection.principal).toEqual(ADV);
  });

  it('refuses a missing or unknown role', () => {
    expect(() => parseConnectionFromHeaders({})).toThrow();
    expect(() =>
      parseConnectionFromHeaders({
        [USER_HEADER]: 'adv-ana',
        [ROLE_HEADER]: 'administrador',
      }),
    ).toThrow();
  });

  it('still rejects a principal smuggled through tool arguments', () => {
    const server = mcpFor(INTERN, officeFor());
    const result = server.callTool({
      name: 'enter_office',
      arguments: { caseId: CASE_ID, role: 'socio' },
    });
    expect(result.isError).toBe(true);
  });
});
