import {
  RelatorioChance,
  RelatorioDissidio,
} from "@models/pesquisa.model";
import { Jurisprudencia } from "@models/jurisprudencia.model";

export const POSICOES_CLIENTE = [
  "consumidor",
  "instituicao_financeira",
] as const;

export type PosicaoCliente = (typeof POSICOES_CLIENTE)[number];

export type AmostraPrevencao = {
  total: number;
  fonte: "fixture";
};

export type HonestidadePrevencao = {
  rotulo: "fixture/heuristica";
  aviso: string;
  jurimetriaAoVivo: false;
  oraculo: false;
};

export type RelatorioPrevencao = {
  id: string;
  casoId: string;
  contratoId: string;
  contratoTitulo: string;
  posicaoCliente: PosicaoCliente;
  amostra: AmostraPrevencao;
  medidasPreProcessuais: string[];
  honestidade: HonestidadePrevencao;
  dissidioReport: RelatorioDissidio;
  chanceReport: RelatorioChance;
  jurisprudences: Jurisprudencia[];
  criadoEm: string;
};

export const AVISO_HONESTIDADE_PREVENCAO =
  "Leitura fixture/heurística sobre contratos e precedentes de amostra. Não é jurimetria ao vivo nem oráculo de resultado.";

export const ROTULO_POSICAO_CLIENTE: Record<PosicaoCliente, string> = {
  consumidor: "Consumidor",
  instituicao_financeira: "Instituição financeira",
};
