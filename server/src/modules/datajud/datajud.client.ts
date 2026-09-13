import { Injectable } from "@nestjs/common";
import { DATAJUD_BASE, DataJudHit } from "./datajud.types";
import {
  erroChaveRecusada,
  erroInvalido,
  erroRede,
  erroSemChave,
  erroTribunal,
} from "./datajud.errors";
import { hitDeSource, tribunalAlias, tribunalPadrao } from "./datajud.mapper";

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

  async buscarPorCnj(numeroProcesso: string, tribunal?: string): Promise<DataJudHit[]> {
    const alias = this.alias(tribunal);
    const numero = numeroProcesso.trim();
    if (!numero) {
      throw erroInvalido("Informe o número CNJ do processo.");
    }

    return this.pesquisar(alias, {
      size: 5,
      query: {
        match: { numeroProcesso: numero },
      },
    });
  }

  async buscar(params: {
    query?: string;
    assunto?: string;
    classe?: string;
    tribunal?: string;
  }): Promise<DataJudHit[]> {
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

    return this.pesquisar(alias, {
      size: 12,
      query: {
        bool: { should, minimum_should_match: 1 },
      },
    });
  }

  private async pesquisar(
    alias: string,
    corpo: Record<string, unknown>
  ): Promise<DataJudHit[]> {
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
        signal: AbortSignal.timeout(15000),
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
