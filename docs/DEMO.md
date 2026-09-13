# Demo DataJud ao vivo (60s)

Pitch: a IA do cliente entra pelo MCP. O escritório é memória + porta fail-closed. DataJud é ferramenta de metadados oficiais, não oráculo de ementa.

## Antes

1. Copie a chave pública vigente em [Acesso à API pública](https://datajud-wiki.cnj.jus.br/api-publica/acesso/).
2. Em `server/.env` (e na raiz, se quiser):

```sh
DATAJUD_API_KEY=
DATAJUD_DEFAULT_TRIBUNAL=tjpr
DATAJUD_MODE=auto
```

`auto` tenta a API pública e, em 429/rede/timeout, lê `server/src/fixtures/datajud-cache/` com o rótulo `fonte: datajud_captura`. Roteiro do advogado + ChatGPT: [DEMO-ADVOGADO-CHATGPT.md](DEMO-ADVOGADO-CHATGPT.md).

3. Suba o Nest e a tela:

```sh
pnpm --prefix server install
pnpm --prefix client install
pnpm dev:server
pnpm dev
```

## Roteiro UI (notebook, sem Claude)

1. Abra http://localhost:8080.
2. No painel **Metadados DataJud ao vivo**, tribunal `tjpr`.
3. Cole um CNJ do TJPR. A busca por `Alienação Fiduciária` devolve hits atuais; um exemplo recente é `0000887-91.2025.8.16.0161`. Se o número não estiver no índice, a API responde vazio — nada é inventado.
4. **Abrir processo (DataJud)**.
5. Em **Jurisprudência**, cada item tem selo `DataJud` ou `Acervo interno`. Hits ao vivo vêm **Não citável** se não há ementa oficial.
6. Em **Jurimetria**, leia a amostra partida (`N` ao vivo + `M` acervo) e o aviso: metadados, não garantia de vitória.

**Busca:** assunto `Alienação Fiduciária` → **Buscar no DataJud** → clique num hit.

Se a chave, o tribunal ou a rede falharem, a tela mostra o erro. Nenhum hit é inventado.

## Roteiro MCP (IA do cliente)

Token de demo do papel advogado: `demo-advogado`.

```sh
# Handshake
curl -s http://127.0.0.1:3000/api/mcp \
  -H 'Authorization: Bearer demo-advogado' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Capa ao vivo (SafeDTO)
curl -s http://127.0.0.1:3000/api/mcp \
  -H 'Authorization: Bearer demo-advogado' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"abrir_datajud","arguments":{"processNumber":"0000887-91.2025.8.16.0161","tribunal":"tjpr"}}}'

# Busca ao vivo
curl -s http://127.0.0.1:3000/api/mcp \
  -H 'Authorization: Bearer demo-advogado' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"buscar_datajud","arguments":{"assunto":"Alienação Fiduciária","tribunal":"tjpr"}}}'

# Jurimetria mista
curl -s http://127.0.0.1:3000/api/mcp \
  -H 'Authorization: Bearer demo-advogado' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"comparar_datajud","arguments":{"processNumber":"0000887-91.2025.8.16.0161","tribunal":"tjpr"}}}'

# Estagiário não abre capa
curl -s http://127.0.0.1:3000/api/mcp \
  -H 'Authorization: Bearer demo-estagiario' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"abrir_datajud","arguments":{"processNumber":"0000887-91.2025.8.16.0161"}}}'
```

O auditor deve ver: `tipo` SafeDTO (`case_summary`, `knowledge_result`, `jurimetria_mista`); `citavel: false` e `ementa: null` nos hits DataJud; amostra `aoVivo` + `acervo`; `ementaOracle: false`; nenhum CPF nem nome de parte no payload; estagiário recebe negação.

## UI HTTP (mesmo pipeline, sem MCP)

```sh
curl -s http://127.0.0.1:3000/api/datajud/abrir \
  -H 'Content-Type: application/json' \
  -d '{"numeroProcesso":"0000887-91.2025.8.16.0161","tribunal":"tjpr"}'

curl -s http://127.0.0.1:3000/api/datajud/buscar \
  -H 'Content-Type: application/json' \
  -d '{"assunto":"Alienação Fiduciária","tribunal":"tjpr"}'
```

`ResearchService` (`POST /api/research`) continua fixture (`demo: true`). Não é o caminho ao vivo.
