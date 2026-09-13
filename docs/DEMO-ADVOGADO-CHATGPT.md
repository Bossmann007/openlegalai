# Demo do advogado: UI + ChatGPT (5 minutos)

Como abrir o escritório como advogado e testar o ChatGPT do cliente via MCP sem a demo morrer no rate-limit da API pública do CNJ.

Não é declaração de conformidade LGPD. É o roteiro técnico da fatia.

## Antes (1 minuto)

1. Copie `server/.env.example` para `server/.env`.
2. No dia da demo, force o fallback honesto:

```sh
DATAJUD_DEFAULT_TRIBUNAL=tjpr
DATAJUD_MODE=auto
```

`auto` tenta a API pública. Em HTTP 429, timeout ou rede, o servidor lê os arquivos em `server/src/fixtures/datajud-cache/` e rotula `fonte: datajud_captura` / `captura oficial (replay)`. Sem arquivo, a resposta é vazia. Nada é inventado.

Para ensaiar só o replay:

```sh
DATAJUD_MODE=cache
```

Para proibir replay:

```sh
DATAJUD_MODE=live
```

3. Suba os dois processos:

```sh
pnpm --prefix server install
pnpm --prefix client install
pnpm dev:server
pnpm dev
```

A UI escuta em http://localhost:8080. O Nest e o MCP escutam em http://127.0.0.1:3000.

Token do papel advogado: `demo-advogado`. Token que o auditor usa para negar capa: `demo-estagiario`.

## A) UI como advogado

1. Abra http://localhost:8080.
2. No painel **Metadados DataJud**, tribunal `tjpr`.
3. Cole `0000887-91.2025.8.16.0161` e clique **Abrir processo (DataJud)**.
4. Ou busque `Alienação Fiduciária` e abra um hit.

O que você deve ver:

- Se a API pública responder: selo `metadados DataJud ao vivo` e `fonte: datajud`.
- Se cair o replay: faixa `fonte: datajud_captura · captura oficial (replay)`. A tela não diz "ao vivo".
- Em **Jurisprudência**, selos mistos (`DataJud` / `TJPR` / `Acervo interno`). Hit DataJud sem ementa oficial fica **Não citável**.
- Em **Jurimetria**, amostra partida (lado DataJud + acervo) e o aviso de que não é oráculo.

CNJ e busca sem arquivo de captura, em `cache` ou após 429 em `auto`, devolvem erro honesto. Zero hit fabricado.

## B) ChatGPT BYOAI

O ChatGPT fala só com `POST /api/mcp` (Streamable HTTP). Auth: `Authorization: Bearer demo-advogado`.

O ChatGPT não alcança `localhost`. Escolha um túnel.

### Opção 1 — túnel HTTPS até o Nest

1. Exponha a porta **3000** (não a 8080):

```sh
ngrok http 3000
```

ou um túnel Cloudflare equivalente.

2. No ChatGPT (Plus ou Pro, Developer Mode ligado), crie um conector MCP.
3. URL do conector: `https://<seu-host>/api/mcp`.
4. Auth: Token. Valor: `demo-advogado`.

### Opção 2 — OpenAI Secure MCP Tunnel

Aponte o túnel oficial para o processo local:

```sh
--mcp-server-url http://127.0.0.1:3000/api/mcp
```

O Bearer continua `demo-advogado`.

### Prompts que o advogado cola no ChatGPT

Cole um de cada vez.

1. Abrir o processo:

> Use a ferramenta abrir_datajud com processNumber 0000887-91.2025.8.16.0161 e tribunal tjpr. Mostre só o SafeDTO. Não invente partes, CPF ou ementa.

2. Buscar jurisprudência:

> Use buscar_datajud com assunto Alienação Fiduciária e tribunal tjpr. Liste referencia, fonte e citavel. Se fonte for datajud_captura, diga que é replay, não sessão ao vivo.

3. Comparar jurimetria:

> Use comparar_datajud com processNumber 0000887-91.2025.8.16.0161 e tribunal tjpr. Mostre amostra, honestidade.live e a síntese. Não trate o número como chance de vitória.

### O que o auditor deve ver

- Só SafeDTO. Tipos: `case_summary`, `knowledge_result`, `jurimetria_mista`.
- Sem CPF e sem nome de parte no JSON.
- Hit DataJud: `citavel: false` e `ementa: null` quando não há ementa oficial.
- Replay: `fonte: datajud_captura` no conhecimento, ou `honestidade.live: datajud_captura` na jurimetria. Nunca `datajud_metadata` se o payload veio do arquivo local.
- Estagiário: `Authorization: Bearer demo-estagiario` em `abrir_datajud` ou `comparar_datajud` devolve negação do gateway. `buscar_datajud` no papel estagiário é a única tool DataJud liberada.

Prova local, sem ChatGPT:

```sh
curl -s http://127.0.0.1:3000/api/mcp \
  -H 'Authorization: Bearer demo-advogado' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"abrir_datajud","arguments":{"processNumber":"0000887-91.2025.8.16.0161","tribunal":"tjpr"}}}'
```

Troque o Bearer para `demo-estagiario` e o auditor deve ler a negação.

## C) Dia da demo

Deixe `DATAJUD_MODE=auto` no `server/.env`. A UI e o MCP usam o mesmo client. Rate-limit do CNJ vira replay rotulado. Sem captura para o recorte, a demo falha em voz alta em vez de inventar processo.
