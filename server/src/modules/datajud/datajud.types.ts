import { HonestidadeJurimetria } from "@models/caso.model";

export const DATAJUD_TRIBUNAL_PADRAO = "tjpr";
export const DATAJUD_BASE = "https://api-publica.datajud.cnj.jus.br";

export type { HonestidadeJurimetria };

export type DataJudTribunal = string;

export type DataJudMovimento = {
  data: string;
  nome: string;
};

export type DataJudHit = {
  tribunal: string;
  tribunalAlias: string;
  numeroProcesso: string;
  classe: string;
  assuntos: string[];
  orgaoJulgador: string;
  grau: string;
  dataAjuizamento: string;
  atualizacao: string;
  movimentos: DataJudMovimento[];
};

export type DataJudErroKind =
  | "sem_chave"
  | "chave_recusada"
  | "tribunal"
  | "rede"
  | "vazio"
  | "invalido"
  | "cache_miss";

export type DataJudMode = "auto" | "live" | "cache";

export type DataJudOrigem =
  | {
      kind: "live";
      fonte: "datajud";
      rotulo: "metadados DataJud ao vivo";
      aoVivo: true;
    }
  | {
      kind: "captura";
      fonte: "datajud_captura";
      rotulo: "captura oficial (replay)";
      aoVivo: false;
    };

export const ORIGEM_LIVE: DataJudOrigem = {
  kind: "live",
  fonte: "datajud",
  rotulo: "metadados DataJud ao vivo",
  aoVivo: true,
};

export const ORIGEM_CAPTURA: DataJudOrigem = {
  kind: "captura",
  fonte: "datajud_captura",
  rotulo: "captura oficial (replay)",
  aoVivo: false,
};

export type DataJudPesquisa = {
  hits: DataJudHit[];
  origem: DataJudOrigem;
};

export type AmostraMista = {
  total: number;
  aoVivo: number;
  acervo: number;
  honestidade: HonestidadeJurimetria;
};

export function origemMaisHonesta(a: DataJudOrigem, b: DataJudOrigem): DataJudOrigem {
  return a.kind === "captura" || b.kind === "captura" ? ORIGEM_CAPTURA : ORIGEM_LIVE;
}
