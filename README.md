# OpenLegalAI

Workspace jurídico da **Zhegga Advogados Associados**: casos do TiDB, ementas oficiais do TJPR e modelos para escrever peça.

## Como subir

Dois terminais:

```bash
pnpm dev:server    # Nest em http://127.0.0.1:3000
pnpm dev           # tela em http://localhost:8080
```

`DB_*` fica em `server/.env` (veja `server/.env.example`). Sem o Nest, a tela usa a cópia local do acervo.

Para DataJud, copie `DATAJUD_API_KEY` da [wiki do CNJ](https://datajud-wiki.cnj.jus.br/api-publica/acesso/), `DATAJUD_DEFAULT_TRIBUNAL=tjpr` e `DATAJUD_MODE=auto`. Sem a chave, `auto` cai no replay local rotulado `datajud_captura`. `live` não cai. `cache` só lê `server/src/fixtures/datajud-cache/`. Roteiro de 60s: [docs/DEMO.md](docs/DEMO.md). Advogado + ChatGPT: [docs/DEMO-ADVOGADO-CHATGPT.md](docs/DEMO-ADVOGADO-CHATGPT.md).

## Documentação

- [Manual de teste (o que pesquisar e o que deve aparecer)](docs/MANUAL-TESTE.md)
- [Como contribuir, branches e versões](CONTRIBUTING.md)
- [Visão do produto](docs/PRODUCT.md)
- [Fluxo do usuário](docs/FLUXO.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Casos no TiDB e prova do GET /api/casos](docs/TIDB-CASOS.md)
- [Anti-alucinação e anti-injeção](docs/ANTI-ALUCINACAO.md)

## Stack

- **Client:** React + Vite em `client/`
- **Server:** NestJS em `server/` (`common`, `config`, `modules`, prefixo `/api`)
