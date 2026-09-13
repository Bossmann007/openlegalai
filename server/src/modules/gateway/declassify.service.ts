import { ementaCitavel, ementaParaCitacao } from "@common/security/cite-or-silent";
import { CHANCE_INDISPONIVEL, FonteFato } from "@common/security/fonte-fato";
import { sanitizeUntrustedList, sanitizeUntrustedText } from "@common/security/untrusted-text";
import {
  maiorSigilo,
  NivelDeclassificacao,
  ORDEM_SIGILO,
  Rotulado,
  Sigilo,
  TETO_POR_SIGILO,
} from "@models/classificacao.model";
import { JurisprudenciaFixture } from "@models/jurisprudencia.model";
import { ResultadoPesquisa } from "@models/pesquisa.model";
import { ComparacaoPublica } from "@modules/datajud/datajud.service";
import { RelatorioPrevencao } from "@models/prevencao.model";
import { AndamentoProcesso, Processo } from "@models/processo.model";
import {
  CAMPOS_GERADOS,
  EnvelopeSafe,
  FaseProcessual,
  SafeCaseSummary,
  SafeJurimetriaMista,
  SafeKnowledgeResult,
  SafePrevencaoSummary,
  SafeStrategicUpdate,
} from "@models/safe-dto.model";
import { normalizarAssuntos } from "../../fixtures/vocabulario";
import { Injectable, Logger } from "@nestjs/common";
import { DlpService } from "./dlp.service";

/** Tamanho da sequência considerada citação literal da fonte. */
const TAMANHO_NGRAMA = 5;

function fonteConhecimento(
  fonteItem: FonteFato | undefined,
  fonteRotulo: string
): "datajud" | "datajud_captura" | "acervo_interno" | "tjpr" {
  if (fonteRotulo.startsWith("datajud_captura")) {
    return "datajud_captura";
  }
  if (fonteItem === "datajud" || fonteItem === "tjpr") {
    return fonteItem;
  }
  return "acervo_interno";
}

export class FalhaDeDeclassificacao extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = "FalhaDeDeclassificacao";
  }
}

/**
 * Constrói as respostas que saem do escritório.
 *
 * Duas ideias sustentam este serviço:
 *
 * 1. **Construção, não filtragem.** Cada DTO é montado campo a campo a partir
 *    de vocabulário controlado, contagens e faixas. O registro bruto nunca é
 *    serializado, então esquecer de remover um campo não é um modo de falha
 *    possível — o campo só existe se alguém o escreveu aqui.
 *
 * 2. **O determinístico tem a palavra final.** Hoje quem monta o texto é um
 *    gerador de templates; amanhã pode ser um modelo local, que resume melhor.
 *    Em ambos os casos a saída passa pelo mesmo `verificar()`, que é burro,
 *    checável e fail closed. Um resumidor probabilístico nunca é a última
 *    barreira.
 */
@Injectable()
export class DeclassifyService {
  private readonly logger = new Logger(DeclassifyService.name);

  constructor(private dlpService: DlpService) {}

  resumoDeCaso(rotulado: Rotulado<Processo>): SafeCaseSummary {
    const processo = rotulado.valor;
    const nivel = this.nivel(rotulado.sigilo, "resumo");
    const fase = this.derivarFase(processo.movements);
    const orientacao = this.derivarOrientacao(processo.chamberOrientation);
    const assuntos = sanitizeUntrustedList(normalizarAssuntos(processo.subjects));

    const dto: SafeCaseSummary = {
      tipo: "case_summary",
      conteudo: {
        referencia: sanitizeUntrustedText(processo.processNumber),
        tribunal: sanitizeUntrustedText(processo.court),
        grau: sanitizeUntrustedText(processo.degree),
        orgaoJulgador: sanitizeUntrustedText(processo.chamber),
        fase,
        assuntos,
        quantidadeAndamentos: processo.movements.length,
        quantidadePartes: processo.parties.length,
        orientacaoDoOrgao: orientacao,
        situacao: this.textoSituacao(processo, fase, orientacao),
      },
      declassificacao: {
        sigiloOrigem: rotulado.sigilo,
        nivel,
        fontes: [rotulado.fonte],
        omitido: [
          "nomes e qualificação das partes",
          "texto dos andamentos",
          "resumo e tese do caso",
          "unidade judiciária de origem",
        ],
      },
    };

    this.verificar(dto, this.textoDaCapa(processo), this.entidadesDaCapa(processo));
    return dto;
  }

  conhecimento(
    rotulado: Rotulado<JurisprudenciaFixture[]>,
    consulta: string[]
  ): SafeKnowledgeResult {
    const nivel = this.nivel(rotulado.sigilo, "integral");
    const publico = rotulado.sigilo === "publico";

    const dto: SafeKnowledgeResult = {
      tipo: "knowledge_result",
      conteudo: {
        consulta: sanitizeUntrustedList(normalizarAssuntos(consulta)),
        quantidade: rotulado.valor.length,
        itens: rotulado.valor.map((item) => {
          const citavel = publico && ementaCitavel(item);
          return {
            referencia: sanitizeUntrustedText(item.acordaoNumber || item.processNumber),
            tribunal: sanitizeUntrustedText(item.court),
            orgaoJulgador: sanitizeUntrustedText(item.chamber),
            relator: item.reporter ? sanitizeUntrustedText(item.reporter) : null,
            data: item.judgmentDate ? sanitizeUntrustedText(item.judgmentDate) : null,
            sentido: this.derivarSentido(item.orientation),
            citavel,
            ementa: citavel ? ementaParaCitacao(item) : null,
            fonte: fonteConhecimento(item.fonte, rotulado.fonte),
          };
        }),
      },
      declassificacao: {
        sigiloOrigem: rotulado.sigilo,
        nivel,
        fontes: [rotulado.fonte],
        omitido: publico ? [] : ["texto integral das ementas"],
      },
    };

    // Fonte pública não entra na checagem de n-gramas: citar acórdão publicado
    // não é vazamento.
    this.verificar(dto, []);
    return dto;
  }

  atualizacaoEstrategica(
    rotulado: Rotulado<ResultadoPesquisa>,
    textoSensivel: string[],
    entidadesSensiveis: string[] = []
  ): SafeStrategicUpdate {
    const resultado = rotulado.valor;
    const nivel = this.nivel(rotulado.sigilo, "resumo");
    const alinhamentos = this.contarAlinhamentos(resultado);
    const faixa = this.derivarFaixa(resultado.chanceReport);

    const dto: SafeStrategicUpdate = {
      tipo: "strategic_update",
      conteudo: {
        referencia: resultado.process.processNumber,
        faixaDeRisco: faixa,
        divergenciaEntreOrgaos: alinhamentos,
        sintese: this.textoSintese(resultado, alinhamentos, faixa),
        recomendacao: this.textoRecomendacao(alinhamentos),
      },
      declassificacao: {
        sigiloOrigem: maiorSigilo([rotulado.sigilo, "cliente"]),
        nivel,
        fontes: [rotulado.fonte, "acervo:jurisprudencia"],
        omitido: [
          "pontuação numérica de chance",
          "texto dos votos e das ementas",
          "pontos de blindagem redigidos internamente",
          "dados das partes e do contrato",
        ],
      },
    };

    this.verificar(dto, textoSensivel, entidadesSensiveis);
    return dto;
  }

  prevencao(
    relatorio: RelatorioPrevencao,
    textoSensivel: string[] = [],
    entidadesSensiveis: string[] = []
  ): SafePrevencaoSummary {
    const faixa = this.derivarFaixa(relatorio.chanceReport);
    const alinhados = relatorio.jurisprudences.filter(
      (item) => item.alignment === "for"
    ).length;
    const divergentes = relatorio.jurisprudences.filter(
      (item) => item.alignment === "diverge"
    ).length;

    const dto: SafePrevencaoSummary = {
      tipo: "prevencao_summary",
      conteudo: {
        posicaoCliente: relatorio.posicaoCliente,
        amostra: {
          total: relatorio.amostra.total,
          fonte: "fixture",
        },
        faixaDeRisco: faixa,
        medidasPreProcessuais: relatorio.medidasPreProcessuais,
        honestidade: {
          rotulo: "fixture/heuristica",
          jurimetriaAoVivo: false,
          oraculo: false,
        },
        sintese: this.textoSintesePrevencao(
          relatorio.amostra.total,
          alinhados,
          divergentes,
          faixa,
          relatorio.posicaoCliente
        ),
      },
      declassificacao: {
        sigiloOrigem: "cliente",
        nivel: "resumo",
        fontes: ["acervo:contrato", "acervo:jurisprudencia"],
        omitido: [
          "título e resumo do contrato",
          "nomes e qualificação das partes",
          "texto de ementas e votos",
          "pontuação numérica de chance",
        ],
      },
    };

    this.verificar(dto, textoSensivel, entidadesSensiveis);
    return dto;
  }

  jurimetriaMista(
    rotulado: Rotulado<ComparacaoPublica>,
    textoSensivel: string[] = [],
    entidadesSensiveis: string[] = []
  ): SafeJurimetriaMista {
    const comparacao = rotulado.valor;
    const alinhamentos = {
      alinhados: comparacao.classificadas.filter((item) => item.alignment === "for").length,
      divergentes: comparacao.classificadas.filter((item) => item.alignment === "diverge")
        .length,
      contrarios: comparacao.classificadas.filter((item) => item.alignment === "against")
        .length,
      semEmentaCitavel: comparacao.classificadas.filter(
        (item) => item.alignment === "unknown"
      ).length,
    };
    const faixa = this.derivarFaixa(comparacao.chance);

    const dto: SafeJurimetriaMista = {
      tipo: "jurimetria_mista",
      conteudo: {
        referencia: sanitizeUntrustedText(comparacao.processo.processNumber),
        tribunal: sanitizeUntrustedText(comparacao.processo.court),
        amostra: {
          total: comparacao.amostra.total,
          aoVivo: comparacao.amostra.aoVivo,
          acervo: comparacao.amostra.acervo,
        },
        honestidade: {
          live:
            comparacao.amostra.honestidade.live === "datajud_captura"
              ? "datajud_captura"
              : "datajud_metadata",
          acervo: comparacao.amostra.honestidade.acervo,
          ementaOracle: false,
          oraculo: false,
        },
        divergenciaEntreOrgaos: alinhamentos,
        faixaDeRisco: faixa,
        sintese: this.textoSinteseMista(comparacao.amostra, alinhamentos, faixa),
      },
      declassificacao: {
        sigiloOrigem: rotulado.sigilo,
        nivel: this.nivel(rotulado.sigilo, "resumo"),
        fontes: [rotulado.fonte, "acervo:jurisprudencia"],
        omitido: [
          "nomes e qualificação das partes",
          "texto de petições e contratos",
          "ementa inventada",
          "pontuação numérica de chance",
        ],
      },
    };

    this.verificar(dto, textoSensivel, entidadesSensiveis);
    return dto;
  }

  /**
   * A checagem que transforma "confio no resumo" em garantia verificável.
   *
   * Fail closed em três frentes: nenhum campo fora da allowlist do tipo,
   * nenhum n-grama literal das fontes sensíveis nos campos gerados, nenhum
   * padrão de DLP em lugar nenhum do DTO.
   */
  private verificar(
    dto: EnvelopeSafe<string, unknown>,
    fontesSensiveis: string[],
    entidadesSensiveis: string[] = []
  ): void {
    const achados = this.dlpService.detectar(dto);

    if (achados.length) {
      this.reprovar(
        `DLP encontrou ${achados.join(", ")} no DTO. A declassificação falhou; nada sai.`
      );
    }

    // Entidades curtas — nome de parte, unidade de origem — passam por baixo da
    // janela de n-gramas: "A. S. Oliveira" tem 3 palavras. Elas são conferidas
    // inteiras, e contra o DTO todo, porque não há campo em que possam aparecer.
    const corpo = this.normalizar(JSON.stringify(dto));

    for (const entidade of entidadesSensiveis) {
      const alvo = this.normalizar(entidade);

      if (alvo.length >= 4 && corpo.includes(alvo)) {
        this.reprovar(
          `Entidade sigilosa da fonte aparece no DTO. Identificador de parte não atravessa em nenhuma forma; nada sai.`
        );
      }
    }

    const sensivel = this.ngramas(fontesSensiveis.join(" \n "));

    if (!sensivel.size) {
      return;
    }

    for (const campo of CAMPOS_GERADOS) {
      const valor = (dto.conteudo as Record<string, unknown>)[campo];
      const textos = Array.isArray(valor) ? valor : [valor];

      for (const texto of textos) {
        if (typeof texto !== "string") {
          continue;
        }

        for (const ngrama of this.ngramas(texto)) {
          if (sensivel.has(ngrama)) {
            this.reprovar(
              `Campo '${campo}' repete literalmente ${TAMANHO_NGRAMA} palavras da fonte sigilosa. Citação não é resumo; nada sai.`
            );
          }
        }
      }
    }
  }

  private reprovar(motivo: string): never {
    this.logger.error(`Declassificação reprovada: ${motivo}`);
    throw new FalhaDeDeclassificacao(motivo);
  }

  /** Minúsculas, sem acento e sem pontuação, para comparar texto com texto. */
  private normalizar(texto: string): string {
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private ngramas(texto: string): Set<string> {
    const palavras = this.normalizar(texto).split(" ").filter(Boolean);

    const conjunto = new Set<string>();

    for (let i = 0; i + TAMANHO_NGRAMA <= palavras.length; i += 1) {
      conjunto.add(palavras.slice(i, i + TAMANHO_NGRAMA).join(" "));
    }

    return conjunto;
  }

  /** O nível pedido, limitado pelo teto do rótulo da fonte. */
  private nivel(sigilo: Sigilo, desejado: NivelDeclassificacao): NivelDeclassificacao {
    const ordem: NivelDeclassificacao[] = ["resumo", "abstrato", "integral"];
    const teto = TETO_POR_SIGILO[sigilo];

    return ordem.indexOf(desejado) > ordem.indexOf(teto) ? teto : desejado;
  }

  /** Identificadores curtos que nao podem aparecer em forma nenhuma na saida. */
  private entidadesDaCapa(processo: Processo): string[] {
    return [
      ...processo.parties.map((parte) => parte.nome),
      processo.courtUnit,
    ].filter(Boolean);
  }

  private textoDaCapa(processo: Processo): string[] {
    return [
      processo.summary,
      processo.thesis,
      processo.courtUnit,
      ...processo.parties.map((parte) => parte.nome),
      ...processo.movements.map((andamento) => andamento.descricao),
    ].filter(Boolean);
  }

  private derivarFase(andamentos: AndamentoProcesso[]): FaseProcessual {
    const texto = andamentos
      .map((andamento) => sanitizeUntrustedText(andamento.descricao).toLowerCase())
      .join(" ");

    if (texto.includes("trânsito em julgado")) return "transitado";
    if (texto.includes("apelação") || texto.includes("recurso")) return "recursal";
    if (texto.includes("sentença")) return "sentenciado";
    if (texto.includes("distribuição")) return "conhecimento";

    return "indeterminada";
  }

  private derivarOrientacao(
    orientacao: string
  ): "restritiva" | "favoravel" | "indefinida" {
    if (orientacao === "rejeita_revisao") return "restritiva";
    if (orientacao === "aceita_revisao") return "favoravel";

    return "indefinida";
  }

  private derivarSentido(
    orientacao: string | null
  ): "restritivo" | "favoravel" | "indefinido" {
    if (orientacao === "rejeita_revisao") return "restritivo";
    if (orientacao === "aceita_revisao") return "favoravel";

    return "indefinido";
  }

  private derivarFaixa(
    chance: ResultadoPesquisa["chanceReport"]
  ): "baixa" | "moderada" | "razoavel" | "indisponivel" {
    if (chance.fonte === "indisponivel" || chance.label === CHANCE_INDISPONIVEL) {
      return "indisponivel";
    }

    if (chance.score >= 60) return "razoavel";
    if (chance.score >= 40) return "moderada";

    return "baixa";
  }

  private contarAlinhamentos(resultado: ResultadoPesquisa) {
    const itens = resultado.jurisprudences;

    return {
      alinhados: itens.filter((item) => item.alignment === "for").length,
      divergentes: itens.filter((item) => item.alignment === "diverge").length,
      contrarios: itens.filter((item) => item.alignment === "against").length,
      semEmentaCitavel: itens.filter((item) => item.alignment === "unknown").length,
    };
  }

  private textoSituacao(
    processo: Processo,
    fase: FaseProcessual,
    orientacao: "restritiva" | "favoravel" | "indefinida"
  ): string {
    const rotuloFase: Record<FaseProcessual, string> = {
      conhecimento: "em primeiro grau",
      sentenciado: "com sentença proferida",
      recursal: "em fase recursal",
      transitado: "com trânsito em julgado",
      indeterminada: "em fase não identificada",
    };

    const rotuloOrientacao = {
      restritiva: "costuma decidir de forma restritiva",
      favoravel: "costuma decidir de forma favorável ao pedido",
      indefinida: "não tem orientação consolidada registrada",
    }[orientacao];

    return [
      `Caso ${rotuloFase[fase]} no ${processo.court}.`,
      `O órgão julgador ${rotuloOrientacao} nos assuntos catalogados deste caso.`,
      `Há ${processo.movements.length} movimentações e ${processo.parties.length} partes registradas.`,
    ].join(" ");
  }

  private textoSintese(
    resultado: ResultadoPesquisa,
    alinhamentos: ReturnType<DeclassifyService["contarAlinhamentos"]>,
    faixa: "baixa" | "moderada" | "razoavel" | "indisponivel"
  ): string {
    const total = resultado.jurisprudences.length;
    const rotuloFaixa = {
      baixa: "chance baixa no órgão do caso",
      moderada: "chance moderada",
      razoavel: "chance razoável",
      indisponivel: CHANCE_INDISPONIVEL,
    }[faixa];

    const partes = [
      `Foram cruzados ${total} precedentes com a orientação do órgão julgador do caso.`,
      `${alinhamentos.alinhados} seguem a mesma linha, ${alinhamentos.divergentes} divergem de outro órgão e ${alinhamentos.contrarios} contrariam a linha predominante.`,
      `A leitura do conjunto indica ${rotuloFaixa}.`,
    ];

    if (alinhamentos.semEmentaCitavel > 0) {
      partes.push(
        `${alinhamentos.semEmentaCitavel} precedente(s) apareceram sem ementa citável e não sustentam citação.`
      );
    }

    return partes.join(" ");
  }

  private textoRecomendacao(
    alinhamentos: ReturnType<DeclassifyService["contarAlinhamentos"]>
  ): string[] {
    const pontos: string[] = [];

    if (alinhamentos.divergentes > 0) {
      pontos.push(
        "Existe divergência entre órgãos do mesmo tribunal: trabalhe a distinção em vez de apresentar o precedente divergente como se fosse a linha do órgão do caso."
      );
    }

    if (alinhamentos.contrarios > 0) {
      pontos.push(
        "A linha predominante do próprio órgão pesa contra o pedido principal: antecipe a resposta a ela na peça."
      );
    }

    if (alinhamentos.semEmentaCitavel > 0) {
      pontos.push(
        "Parte dos resultados veio sem texto oficial: solicite a peça na fonte antes de citar."
      );
    }

    if (!pontos.length) {
      pontos.push(
        "Nenhuma divergência relevante encontrada entre os órgãos consultados."
      );
    }

    return pontos;
  }

  private textoSintesePrevencao(
    total: number,
    alinhados: number,
    divergentes: number,
    faixa: "baixa" | "moderada" | "razoavel" | "indisponivel",
    posicao: RelatorioPrevencao["posicaoCliente"]
  ): string {
    const rotuloFaixa = {
      baixa: "faixa baixa no órgão de referência",
      moderada: "faixa moderada",
      razoavel: "faixa razoável",
      indisponivel: CHANCE_INDISPONIVEL,
    }[faixa];

    const rotuloPosicao = this.rotuloPosicao(posicao);

    return [
      `Análise preventiva de contrato na posição de ${rotuloPosicao}.`,
      `Amostra fixture de ${total} precedente(s): ${alinhados} alinhado(s) e ${divergentes} divergente(s).`,
      `A leitura heurística indica ${rotuloFaixa}.`,
      "Não é jurimetria ao vivo nem oráculo de resultado.",
    ].join(" ");
  }

  private textoSinteseMista(
    amostra: ComparacaoPublica["amostra"],
    alinhamentos: {
      alinhados: number;
      divergentes: number;
      contrarios: number;
      semEmentaCitavel: number;
    },
    faixa: "baixa" | "moderada" | "razoavel" | "indisponivel"
  ): string {
    const rotuloFaixa = {
      baixa: "faixa baixa no órgão de referência",
      moderada: "faixa moderada",
      razoavel: "faixa razoável",
      indisponivel: CHANCE_INDISPONIVEL,
    }[faixa];

    return [
      `Comparação mista de ${amostra.total} item(ns): ${amostra.aoVivo} metadado(s) DataJud (${
        amostra.honestidade.live === "datajud_captura" ? "captura oficial (replay)" : "ao vivo"
      }) e ${amostra.acervo} do acervo/fixture.`,
      `${alinhamentos.alinhados} alinhado(s), ${alinhamentos.divergentes} divergente(s), ${alinhamentos.contrarios} contrário(s), ${alinhamentos.semEmentaCitavel} sem ementa citável.`,
      `A leitura descritiva indica ${rotuloFaixa}.`,
      amostra.honestidade.live === "datajud_captura"
        ? "O lado DataJud é captura oficial (replay), não ementa completa nem oráculo de resultado."
        : "O lado ao vivo é metadado DataJud, não ementa completa nem oráculo de resultado.",
    ].join(" ");
  }

  private rotuloPosicao(
    posicao: RelatorioPrevencao["posicaoCliente"]
  ): string {
    switch (posicao) {
      case "consumidor":
        return "consumidor";
      case "instituicao_financeira":
        return "instituição financeira";
      default: {
        const nunca: never = posicao;
        return nunca;
      }
    }
  }

  /** Exposto para a política: qual o teto de cada rótulo. */
  tetos(): Record<string, string> {
    return Object.fromEntries(
      ORDEM_SIGILO.map((sigilo) => [sigilo, TETO_POR_SIGILO[sigilo]])
    );
  }
}
