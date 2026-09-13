# DataJud cache (replay)

Local Elastic `_search` replays for demo day. The API labels them `fonte: datajud_captura` / `captura oficial (replay)`. They are not a live CNJ session.

Do not invent extra hits at runtime. If the file is missing, the client returns `cache_miss`.

| File | Recorte |
| --- | --- |
| `tjpr-00008879120258160161.json` | CNJ `0000887-91.2025.8.16.0161` |
| `tjpr-busca-alienacao.json` | Busca `Alienação Fiduciária` no TJPR |

Sources carry public metadata only (classe, assuntos, órgão, movimentos). No `partes`, CPF, or ementa.
