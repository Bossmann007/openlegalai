<!-- ENZO-PORTFOLIO-BRAND -->
<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:111111,100:1E3A8A&height=165&section=header&text=OpenLegalAI&fontSize=42&fontColor=ffffff&animation=fadeIn&fontAlignY=35&desc=Legal%20research%20workspace%20built%20during%20Hackathon%20OAB%20Rush.&descAlignY=57&descSize=14" alt="OpenLegalAI" />
</p>

<p align="center"><strong>TypeScript · React · NestJS</strong></p>

---

# OpenLegalAI

Workspace jurídico da **Zhegga Advogados Associados**: casos do TiDB, ementas oficiais do TJPR e modelos para escrever peça.

## Como subir

Dois terminais:

```bash
pnpm dev:server    # Nest em http://127.0.0.1:3000
pnpm dev           # tela em http://localhost:8080
```

`DB_*` fica em `server/.env` (veja `server/.env.example`). Sem o Nest, a tela usa a cópia local do acervo.

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

<!-- ENZO-PORTFOLIO-BRAND-FOOTER -->
<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:111111,100:1E3A8A&height=85&section=footer" alt="Footer" />
</p>
