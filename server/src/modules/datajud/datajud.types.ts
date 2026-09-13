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
  | "invalido";

export type AmostraMista = {
  total: number;
  aoVivo: number;
  acervo: number;
  honestidade: HonestidadeJurimetria;
};
