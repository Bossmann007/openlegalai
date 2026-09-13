import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DataJudMode } from "./datajud.types";

export type ElasticHit = {
  _source?: Record<string, unknown>;
};

export type ElasticResposta = {
  hits?: {
    hits?: ElasticHit[];
  };
};

export type ChaveCache =
  | { kind: "cnj"; alias: string; digitos: string }
  | { kind: "busca"; alias: string; termo: string };

const ARQUIVO_CNJ_DEMO = "tjpr-00008879120258160161.json";
const ARQUIVO_BUSCA_ALIENACAO = "tjpr-busca-alienacao.json";

export function modoDataJud(valor = process.env.DATAJUD_MODE): DataJudMode {
  const bruto = (valor || "auto").trim().toLowerCase();
  switch (bruto) {
    case "live":
    case "cache":
    case "auto":
      return bruto;
    default:
      return "auto";
  }
}

export function diretorioCacheDataJud(): string {
  const candidatos = [
    resolve(__dirname, "../../fixtures/datajud-cache"),
    resolve(process.cwd(), "src/fixtures/datajud-cache"),
    resolve(process.cwd(), "server/src/fixtures/datajud-cache"),
    resolve(process.cwd(), "dist/fixtures/datajud-cache"),
  ];

  return candidatos.find((pasta) => existsSync(pasta)) || candidatos[0];
}

export function normalizarTermoCache(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function arquivoCachePara(chave: ChaveCache): string | null {
  if (chave.kind === "cnj") {
    if (chave.alias === "tjpr" && chave.digitos === "00008879120258160161") {
      return ARQUIVO_CNJ_DEMO;
    }
    return null;
  }

  const termo = normalizarTermoCache(chave.termo);
  if (chave.alias === "tjpr" && termo.includes("alienacao fiduciaria")) {
    return ARQUIVO_BUSCA_ALIENACAO;
  }
  return null;
}

export function lerCacheElastic(arquivo: string, pasta = diretorioCacheDataJud()): ElasticResposta | null {
  const caminho = join(pasta, arquivo);
  if (!existsSync(caminho)) {
    return null;
  }

  try {
    const json = JSON.parse(readFileSync(caminho, "utf8")) as ElasticResposta;
    if (!json || typeof json !== "object") {
      return null;
    }
    return json;
  } catch {
    return null;
  }
}

export function hitsDoCache(resposta: ElasticResposta | null): ElasticHit[] {
  if (!resposta) {
    return [];
  }
  return resposta.hits?.hits || [];
}

export function recorteCache(chave: ChaveCache): string {
  switch (chave.kind) {
    case "cnj":
      return `${chave.alias} CNJ ${chave.digitos}`;
    case "busca":
      return `${chave.alias} busca "${chave.termo}"`;
    default: {
      const neverChave: never = chave;
      return neverChave;
    }
  }
}

