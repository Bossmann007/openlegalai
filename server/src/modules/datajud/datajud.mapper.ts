import { aplicarPoliticaCaso } from "@common/security/caso-policy";
import { ementaCitavel } from "@common/security/cite-or-silent";
import { CHANCE_INDISPONIVEL, FonteFato } from "@common/security/fonte-fato";
import {
  Andamento,
  Caso,
  Dissidio,
  Jurisprudencia,
  Jurimetria,
} from "@models/caso.model";
import {
  Jurisprudencia as JurisClassificada,
  JurisprudenciaFixture,
} from "@models/jurisprudencia.model";
import { RelatorioChance, RelatorioDissidio } from "@models/pesquisa.model";
import { OrientacaoCamara, Processo } from "@models/processo.model";
import { formatarCnj, cnjDigitos } from "@modules/casos/caso.assembler";
import {
  AmostraMista,
  DATAJUD_TRIBUNAL_PADRAO,
  DataJudHit,
  HonestidadeJurimetria,
} from "./datajud.types";

const BLOCO_VAZIO = { resumo: "", itens: [] as string[] };

export function tribunalPadrao(): string {
  return tribunalAlias(process.env.DATAJUD_DEFAULT_TRIBUNAL || DATAJUD_TRIBUNAL_PADRAO);
}

export function tribunalAlias(valor: string): string {
  const alias = valor
    .trim()
    .toLowerCase()
    .replace(/^api_publica_/, "")
    .replace(/[^a-z0-9]/g, "");

  if (alias.length < 2 || alias.length > 20) {
    return DATAJUD_TRIBUNAL_PADRAO;
  }

  return alias;
}

export function hitDeSource(
  source: Record<string, unknown>,
  alias: string
): DataJudHit | null {
  const numero = formatarCnj(
    texto(source.numeroProcesso) || texto(source.numero_processo)
  );
  if (cnjDigitos(numero).length !== 20) {
    return null;
  }

  const assuntos = nomesDe(source.assuntos);
  const classe = nomeDe(source.classe);
  const orgao = nomeDe(source.orgaoJulgador);
  const tribunal = texto(source.tribunal) || alias.toUpperCase();

  return {
    tribunal,
    tribunalAlias: alias,
    numeroProcesso: numero || texto(source.numeroProcesso),
    classe,
    assuntos,
    orgaoJulgador: orgao,
    grau: rotuloGrau(texto(source.grau)),
    dataAjuizamento: dataDe(source.dataAjuizamento),
    atualizacao: dataDe(source.dataHoraUltimaAtualizacao),
    movimentos: movimentosDe(source.movimentos),
  };
}

export function processoDeHit(hit: DataJudHit): Processo {
  return {
    processNumber: hit.numeroProcesso,
    court: hit.tribunal,
    courtUnit: hit.orgaoJulgador,
    caseClass: hit.classe,
    subjects: hit.assuntos,
    chamber: hit.orgaoJulgador,
    organ: hit.orgaoJulgador,
    degree: hit.grau,
    distributionDate: hit.dataAjuizamento,
    parties: [],
    movements: hit.movimentos.map((item) => ({
      data: item.data,
      descricao: item.nome,
    })),
    thesis: "",
    summary: resumoDeHit(hit),
    chamberOrientation: "indeterminada",
  };
}

export function fixtureDeHit(hit: DataJudHit, indice: number): JurisprudenciaFixture {
  const data = hit.dataAjuizamento || hit.atualizacao;
  return {
    id: `datajud-${hit.tribunalAlias}-${cnjDigitos(hit.numeroProcesso) || indice}`,
    processNumber: hit.numeroProcesso,
    acordaoNumber: null,
    court: hit.tribunal,
    chamber: hit.orgaoJulgador,
    organ: hit.orgaoJulgador,
    reporter: null,
    district: null,
    caseClass: hit.classe,
    subjects: hit.assuntos,
    judgmentDate: data || null,
    publicationDate: null,
    decisionType: "Metadados DataJud",
    ementaSnippet: null,
    voteSummary: null,
    orientation: null,
    relatedSubjects: hit.assuntos,
    citavel: false,
    fonte: "datajud",
  };
}

export function fonteCasoDeClassificada(
  fonte: FonteFato | undefined
): "datajud" | "tjpr" | "acervo_interno" {
  switch (fonte) {
    case "datajud":
    case "tjpr":
      return fonte;
    case "acervo_interno":
    case "inferencia":
    case "indisponivel":
    case undefined:
      return "acervo_interno";
    default: {
      const neverFonte: never = fonte;
      return neverFonte;
    }
  }
}

export function fixtureDeCasoJuris(item: Jurisprudencia): JurisprudenciaFixture {
  return {
    id: item.id,
    processNumber: item.processNumber,
    acordaoNumber: item.acordao || null,
    court: item.court,
    chamber: item.chamber,
    organ: item.chamber,
    reporter: item.reporter || null,
    district: null,
    caseClass: "",
    subjects: item.pontos || [],
    judgmentDate: item.date || null,
    publicationDate: item.date || null,
    decisionType: "",
    ementaSnippet: item.ementa || null,
    voteSummary: item.essencial?.resumo || null,
    orientation: null,
    relatedSubjects: item.pontos || [],
    citavel: item.citavel,
    fonte: item.fonte,
  };
}

export function mesclarAcervo(
  casoJuris: Jurisprudencia[],
  fixtures: JurisprudenciaFixture[]
): JurisprudenciaFixture[] {
  const vistos = new Set<string>();
  const saida: JurisprudenciaFixture[] = [];

  for (const item of casoJuris) {
    const fixture = carimbarFixture(fixtureDeCasoJuris(item));
    const chave = cnjDigitos(fixture.processNumber) || fixture.id;
    if (vistos.has(chave)) {
      continue;
    }
    vistos.add(chave);
    saida.push(fixture);
  }

  for (const item of fixtures) {
    const chave = cnjDigitos(item.processNumber) || item.id;
    if (vistos.has(chave)) {
      continue;
    }
    vistos.add(chave);
    saida.push(carimbarFixture(item));
  }

  return saida;
}

export function precedentesDeHits(
  hits: DataJudHit[],
  capaCnj: string
): JurisprudenciaFixture[] {
  const alvo = cnjDigitos(capaCnj);
  const vistos = new Set<string>();
  const fixtures: JurisprudenciaFixture[] = [];

  for (const [indice, item] of hits.entries()) {
    const chave = cnjDigitos(item.numeroProcesso);
    if (!chave || vistos.has(chave) || chave === alvo) {
      continue;
    }
    vistos.add(chave);
    fixtures.push(fixtureDeHit(item, indice));
  }

  return fixtures.slice(0, 8);
}

export function casoJurisDeClassificada(item: JurisClassificada): Jurisprudencia {
  const fonte = fonteCasoDeClassificada(item.fonte);
  const citavel = fonte !== "datajud" && ementaCitavel(item);
  const ementa = citavel ? item.ementaSnippet || "" : "";
  const resumo =
    fonte === "datajud"
      ? "Metadados DataJud. Sem ementa. Não cite como acórdão."
      : item.voteSummary ||
        (item.citeStatus === "nao_citavel"
          ? "Ementa ausente no acervo interno (fixture)."
          : "");

  return {
    id: item.id,
    processNumber: item.processNumber,
    acordao: item.acordaoNumber || item.processNumber,
    court: item.court,
    chamber: item.chamber,
    reporter: item.reporter || "",
    date: item.judgmentDate || item.publicationDate || "",
    status: "ATIVO",
    alignment: item.alignment,
    ementa,
    pontos: item.subjects || [],
    essencial: { resumo, itens: item.subjects || [] },
    fortalecer: BLOCO_VAZIO,
    blindar: BLOCO_VAZIO,
    contrapor: BLOCO_VAZIO,
    citavel,
    fonte,
    relacao: "precedente_tema",
  };
}

export function historicoDeHit(hit: DataJudHit): Andamento[] {
  return hit.movimentos.map((item) => ({
    data: item.data,
    titulo: item.nome,
    detalhe: `Andamento DataJud (${hit.tribunal}). Metadado oficial, sem peça.`,
  }));
}

export function resumoDeHit(hit: DataJudHit): string {
  const assuntos = hit.assuntos.length
    ? `Assunto(s) DataJud: ${hit.assuntos.join(", ")}.`
    : "Assuntos DataJud não informados.";
  const classe = hit.classe || "Classe não informada";
  const orgao = hit.orgaoJulgador || hit.tribunal;
  return `${classe} perante ${orgao} (${hit.tribunal}). ${assuntos} Metadados DataJud — sem ementa.`;
}

export function montarCasoLive(
  hit: DataJudHit,
  base: Caso | undefined,
  juris: Jurisprudencia[],
  dissidios: Dissidio[],
  jurimetria: Jurimetria
): Caso {
  const numero = hit.numeroProcesso || base?.processNumber || "";
  const id = base?.id || cnjDigitos(numero) || `datajud-${hit.tribunalAlias}`;

  return aplicarPoliticaCaso({
    id,
    processoId: base?.processoId || "",
    titulo: hit.classe || base?.titulo || `Processo ${numero}`,
    tema: hit.assuntos[0] || base?.tema || hit.classe,
    subtema: hit.grau || base?.subtema || "Metadados DataJud",
    processNumber: numero,
    court: hit.tribunal || base?.court || "",
    chamber: hit.orgaoJulgador || base?.chamber || "",
    status: base?.status || "ATIVO",
    cliente: base?.cliente || "",
    partes: base?.partes || [],
    resumo: resumoDeHit(hit),
    tese: base?.tese || "",
    atualizacao: hit.atualizacao || base?.atualizacao || "",
    chance: 0,
    chanceRotulo: CHANCE_INDISPONIVEL,
    chanceTexto: CHANCE_INDISPONIVEL,
    votos: votosDe(juris),
    peticoes: base?.peticoes || [],
    contratos: base?.contratos || [],
    documentos: base?.documentos || [],
    decisoes: base?.decisoes || [],
    modelos: base?.modelos || [],
    historico: historicoDeHit(hit).length ? historicoDeHit(hit) : base?.historico || [],
    prazos: base?.prazos || [],
    teses: base?.teses || [],
    resultados: base?.resultados || [],
    conversas: base?.conversas || [],
    jurisprudencias: juris,
    dissidios,
    jurimetria,
    fontes: base?.fontes,
  });
}

export function jurimetriaMista(
  amostra: AmostraMista,
  dissidio: RelatorioDissidio,
  chance: RelatorioChance
): Jurimetria {
  const honestidade: HonestidadeJurimetria = amostra.honestidade;
  return {
    amostra: amostra.total,
    amostraAoVivo: amostra.aoVivo,
    amostraAcervo: amostra.acervo,
    padrao: dissidio.narrative,
    interno:
      amostra.honestidade.live === "datajud_captura"
        ? "Lado DataJud: captura oficial (replay). Metadados de classe, assuntos, movimentos e órgão. Não é ementa completa nem oráculo de jurimetria."
        : "Lado DataJud: metadados ao vivo (classe, assuntos, movimentos, órgão). Não é ementa completa nem oráculo de jurimetria.",
    riscos: chance.blindagem,
    honestidade,
  };
}

export function dissidiosDeRelatorio(relatorio: RelatorioDissidio): Dissidio[] {
  return relatorio.conflicts.map((item) => ({
    camara: item.chamber || item.court,
    orientacao: item.orientationLabel,
    versus: item.vsProcessChamber,
    nota: item.note,
    fonte: "datajud",
  }));
}

export function amostraDe(
  aoVivo: number,
  acervo: number,
  acervoKind: HonestidadeJurimetria["acervo"],
  liveKind: HonestidadeJurimetria["live"] = "datajud_metadata"
): AmostraMista {
  return {
    total: aoVivo + acervo,
    aoVivo,
    acervo,
    honestidade: {
      live: liveKind,
      acervo: acervoKind,
      ementaOracle: false,
    },
  };
}

function votosDe(juris: Jurisprudencia[]): Caso["votos"] {
  return {
    for: juris.filter((item) => item.alignment === "for").length,
    against: juris.filter((item) => item.alignment === "against").length,
    diverge: juris.filter((item) => item.alignment === "diverge").length,
  };
}

function texto(valor: unknown): string {
  if (valor == null) {
    return "";
  }
  return String(valor).trim();
}

function nomeDe(valor: unknown): string {
  if (!valor) {
    return "";
  }
  if (typeof valor === "string") {
    return valor.trim();
  }
  if (typeof valor === "object" && valor !== null && "nome" in valor) {
    return texto((valor as { nome?: unknown }).nome);
  }
  return "";
}

function nomesDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    const unico = nomeDe(valor);
    return unico ? [unico] : [];
  }

  return valor.map((item) => nomeDe(item)).filter(Boolean);
}

function movimentosDe(valor: unknown): DataJudHit["movimentos"] {
  if (!Array.isArray(valor)) {
    return [];
  }

  return valor
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const linha = item as Record<string, unknown>;
      const nome = texto(linha.nome) || nomeDe(linha);
      if (!nome) {
        return null;
      }
      return {
        data: dataDe(linha.dataHora || linha.data),
        nome,
      };
    })
    .filter((item): item is DataJudHit["movimentos"][number] => item !== null)
    .slice(0, 20);
}

function dataDe(valor: unknown): string {
  const bruto = texto(valor);
  if (!bruto) {
    return "";
  }
  const iso = bruto.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    return iso[1];
  }
  const compacto = bruto.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compacto) {
    return `${compacto[1]}-${compacto[2]}-${compacto[3]}`;
  }
  return "";
}

function rotuloGrau(valor: string): string {
  const upper = valor.toUpperCase();
  if (upper === "G1" || upper === "1" || /1/.test(valor) && /grau/i.test(valor)) {
    return "1º grau";
  }
  if (upper === "G2" || upper === "2") {
    return "2º grau";
  }
  return valor || "grau não informado";
}

export function carimbarFixture(item: JurisprudenciaFixture): JurisprudenciaFixture {
  return {
    ...item,
    fonte: item.fonte || "acervo_interno",
  };
}

export function orientacaoCapa(base?: Caso): OrientacaoCamara {
  if (!base) {
    return "indeterminada";
  }
  if (base.votos.against > base.votos.for) {
    return "rejeita_revisao";
  }
  if (base.votos.for > base.votos.against) {
    return "aceita_revisao";
  }
  return "indeterminada";
}
