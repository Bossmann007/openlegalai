# Privacy Gateway / Virtual Office (SafeDTO v3)

Thesis: private office context never returns to the native AI UI as raw or redacted documents. MCP tool results are **SafeDTO only**.

Thin-C BR PII redaction remains an **internal DLP stage**, not the product proof.

These are technical controls. They are not a statement of legal compliance.

## Evidence

```bash
cd /Users/bossmann/openlegalai && npm run evidence
```

The demo prints intern vs partner SafeDTO bytes, a denied `execute_sql` call, and a planted firewall fail-closed.

## MCP stdio (Inspector)

Identity comes from the process environment, never from tool arguments.

```bash
cd privacy-gateway
npx @modelcontextprotocol/inspector --cli ./scripts/run-mcp.sh --method tools/list -e OFFICE_USER_ID=adv-ana -e OFFICE_ROLE=advogado
```

Observed on 2026-09-12 (Inspector CLI 2.6): `tools/list` returned `enter_office`, `leave_office`, `get_safe_summary`, `ask_office` with JSON Schema and `additionalProperties: false`.

```bash
npx @modelcontextprotocol/inspector --cli ./scripts/run-mcp.sh --method tools/call --tool-name enter_office --tool-arg caseId=case-banco-001 -e OFFICE_USER_ID=adv-ana -e OFFICE_ROLE=advogado
```

Observed: `isError: false` and SafeDTO bytes (`schemaVersion: "1"`, `ofs_*`, `rel_session`, no case body).

`get_safe_summary` after `enter_office` was recorded with the in-repo SDK client (`npm run mcp:smoke`) because Inspector CLI starts a new process per invocation. Same stdio server, same SafeDTO wire.

Web UI (do not commit tokens):

```bash
npx @modelcontextprotocol/inspector ./scripts/run-mcp.sh -e OFFICE_USER_ID=adv-ana -e OFFICE_ROLE=advogado
```

## MCP tools (allowlist)

- `enter_office` / `leave_office`
- `get_safe_summary` / `ask_office`
- `get_safe_conversation` — channel state as counts and generated statements. No message body, author or timestamp crosses.
- `post_message` — ingress only. Stored `STRICT` and marked `external`; the ack never echoes the text.

Forbidden: `execute_sql`, `get_raw_document`, `get_all_messages`, `get_rag_chunks`, and any `user` / `role` key in arguments.

Text posted by an outside model is counted in the channel summary but never
interpreted, so a caller cannot plant a sentence and read it back as a team
decision. `test/convergence.test.ts` holds that case.

## Transports

Same allowlist on both; the tool list lives once in `src/mcp/tool-definitions.ts`.

| Transport | Command | Identity |
|---|---|---|
| stdio | `npm run mcp` | `OFFICE_USER_ID` / `OFFICE_ROLE` |
| Streamable HTTP | `npm run mcp:http` | `x-office-user-id` / `x-office-role` headers |

stdio only serves clients that spawn a local process. HTTP is what a
subscription UI on the network can reach. In front of anything real the HTTP
port belongs behind a terminator that authenticates the caller and sets those
headers itself — they are the seam an OAuth resource server plugs into, not the
authentication.

```bash
OFFICE_HTTP_PORT=8787 npm run mcp:http
```

Verified 2026-09-12 with a real MCP client over HTTP: `tools/list` returned the
six tools, a session opened by `enter_office` survived to the next request, and
a session opened by an intern was refused to a partner connection.

## Storage seam

`OfficeStore` (`src/store/office-store.ts`) is the boundary between the archive
and everything above it. `CaseFixtureStore` implements it over JSON today; a
database implementation replaces it without putting the declassifier or the
firewall back under review.

## Layout

- `src/mcp` — in-process `McpOfficeServer` plus stdio adapter (`stdio-server.ts`)
- `src/declassify` — information-destroying SafeDTO builder (no Ollama)
- `src/policy` — role richness and authorized declassification templates
- `src/firewall` — independent byte check after serialize
- `src/pii` — deterministic BR DLP stage only. Presidio stays a future option in the research notes. There is no in-repo client.
