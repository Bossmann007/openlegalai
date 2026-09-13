import { Injectable } from "@nestjs/common";
import {
  arquivoCachePara,
  ChaveCache,
  hitsDoCache,
  lerCacheElastic,
  modoDataJud,
  recorteCache,
} from "./datajud.cache";
import {
  erroCacheMiss,
  erroChaveRecusada,
  erroInvalido,
  erroRede,
  erroSemChave,
  erroTribunal,
  DataJudException,
} from "./datajud.errors";
import { hitDeSource, tribunalAlias, tribunalPadrao } from "./datajud.mapper";
import {
  DATAJUD_BASE,
  DataJudHit,
  DataJudPesquisa,
  ORIGEM_CAPTURA,
  ORIGEM_LIVE,
} from "./datajud.types";

type ElasticHit = {
  _source?: Record<string, unknown>;
};

type ElasticResposta = {
  hits?: {
    hits?: ElasticHit[];
  };
};

const CAMPOS_PII = [
  "partes",
  "poloAtivo",
  "poloPassivo",
  "advogados",
  "documentos",
  "cpf",
  "cnpj",
];

@Injectable()
export class DataJudClient {
  alias(tribunal?: string): string {
    return tribunal ? tribunalAlias(tribunal) : tribunalPadrao();
  }

  async buscarPorCnj(numeroProcesso: string, tribunal?: string): Promise<DataJudPesquisa> {
    const alias = this.alias(tribunal);
    const numero = numeroProcesso.trim();
    if (!numero) {
      throw erroInvalido("Informe o número CNJ do processo.");
    }

    const digitos = numero.replace(/\D/g, "");
    const should = [{ match: { numeroProcesso: numero } }];
    if (digitos && digitos !== numero) {
      should.push({ match: { numeroProcesso: digitos } });
    }

    return this.pesquisar(
      alias,
      {
        size: 5,
        query: {
          bool: { should, minimum_should_match: 1 },
        },
      },
      { kind: "cnj", alias, digitos }
    );
  }

  async buscar(params: {
    query?: string;
    assunto?: string;
    classe?: string;
    tribunal?: string;
  }): Promise<DataJudPesquisa> {
    const alias = this.alias(params.tribunal);
    const should: Record<string, unknown>[] = [];
    const assunto = (params.assunto || "").trim();
    const classe = (params.classe || "").trim();
    const texto = (params.query || "").trim();

    if (assunto) {
      should.push({ match: { "assuntos.nome": assunto } });
    }
    if (classe) {
      should.push({ match: { "classe.nome": classe } });
    }
    if (texto) {
      should.push({
        multi_match: {
          query: texto,
          fields: ["assuntos.nome", "classe.nome", "movimentos.nome", "orgaoJulgador.nome"],
        },
      });
    }

    if (!should.length) {
      throw erroInvalido("Informe assunto, classe ou texto para buscar no DataJud.");
    }

    return this.pesquisar(
      alias,
      {
        size: 12,
        query: {
          bool: { should, minimum_should_match: 1 },
        },
      },
      { kind: "busca", alias, termo: [assunto, classe, texto].filter(Boolean).join(" ") }
    );
  }

  private async pesquisar(
    alias: string,
    corpo: Record<string, unknown>,
    chave: ChaveCache
  ): Promise<DataJudPesquisa> {
    const modo = modoDataJud();

    switch (modo) {
      case "cache":
        return this.lerCaptura(chave);
      case "live":
        return this.consultarLive(alias, corpo);
      case "auto":
        try {
          return await this.consultarLive(alias, corpo);
        } catch (erro) {
          if (!podeReplay(erro)) {
            throw erro;
          }
          const replay = this.tentarCaptura(chave);
          if (replay) {
            return replay;
          }
          throw erro;
        }
      default: {
        const neverModo: never = modo;
        return neverModo;
      }
    }
  }

  private async consultarLive(
    alias: string,
    corpo: Record<string, unknown>
  ): Promise<DataJudPesquisa> {
    return {
      hits: await this.buscarNaApi(alias, corpo),
      origem: ORIGEM_LIVE,
    };
  }

  private lerCaptura(chave: ChaveCache): DataJudPesquisa {
    const replay = this.tentarCaptura(chave);
    if (!replay) {
      throw erroCacheMiss(recorteCache(chave));
    }
    return replay;
  }

  private tentarCaptura(chave: ChaveCache): DataJudPesquisa | null {
    const arquivo = arquivoCachePara(chave);
    if (!arquivo) {
      return null;
    }

    const json = lerCacheElastic(arquivo);
    if (!json) {
      return null;
    }

    const hits = hitsDoCache(json)
      .map((item) => hitDeSource(sanitizarSource(item._source), chave.alias))
      .filter((item): item is DataJudHit => item !== null);

    return {
      hits,
      origem: ORIGEM_CAPTURA,
    };
  }

  private async buscarNaApi(alias: string, corpo: Record<string, unknown>): Promise<DataJudHit[]> {
    const chave = (process.env.DATAJUD_API_KEY || "").trim();
    if (!chave) {
      throw erroSemChave();
    }

    const url = `${DATAJUD_BASE}/api_publica_${alias}/_search`;
    let resposta: Response;

    try {
      resposta = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `APIKey ${chave}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(30000),
      });
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : "falha de rede";
      throw erroRede(detalhe);
    }

    if (resposta.status === 401 || resposta.status === 403) {
      throw erroChaveRecusada();
    }

    if (resposta.status === 404) {
      throw erroTribunal(alias);
    }

    if (!resposta.ok) {
      throw erroRede(`HTTP ${resposta.status}`);
    }

    const json = (await resposta.json()) as ElasticResposta;
    const hits = json.hits?.hits || [];

    return hits
      .map((item) => hitDeSource(sanitizarSource(item._source), alias))
      .filter((item): item is DataJudHit => item !== null);
  }
}

function sanitizarSource(source: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!source) {
    return {};
  }

  const limpo = { ...source };
  for (const campo of CAMPOS_PII) {
    delete limpo[campo];
  }
  return limpo;
}

function podeReplay(erro: unknown): boolean {
  if (!(erro instanceof DataJudException)) {
    return true;
  }

  switch (erro.kind) {
    case "rede":
    case "sem_chave":
      return true;
    case "chave_recusada":
    case "tribunal":
    case "vazio":
    case "invalido":
    case "cache_miss":
      return false;
    default: {
      const neverKind: never = erro.kind;
      return neverKind;
    }
  }
}
