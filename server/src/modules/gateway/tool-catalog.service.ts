import { Identidade } from "@models/gateway.model";
import { EnvelopeSafe } from "@models/safe-dto.model";
import { DATAJUD_LIMITE } from "@modules/datajud/datajud.limites";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrevencaoService } from "@modules/prevencao/prevencao.service";
import { ClassificationService } from "./classification.service";
import { DeclassifyService } from "./declassify.service";

export type FerramentaGateway = {
  nome: string;
  titulo: string;
  descricao: string;
  esquema: z.ZodObject<z.ZodRawShape>;
  /** Só leitura: nenhuma ferramenta do acervo escreve no acervo. */
  somenteLeitura: true;
  executar: (
    argumentos: Record<string, unknown>,
    identidade: Identidade | null
  ) => Promise<EnvelopeSafe<string, unknown>>;
};

/**
 * A superfície MCP do escritório.
 *
 * Todo verbo aqui devolve `EnvelopeSafe` — nunca um registro do acervo. Não
 * existe `get_raw_document`, `execute_sql` nem `get_all_messages`, e a ausência
 * é estrutural: o tipo de retorno não comporta. A ferramenta não é um filtro
 * sobre o dado bruto; ela é o único formato em que o dado pode existir do lado
 * de fora.
 */
@Injectable()
export class ToolCatalogService {
  private readonly ferramentas: FerramentaGateway[];

  constructor(
    private classificationService: ClassificationService,
    private declassifyService: DeclassifyService,
    private prevencaoService: PrevencaoService
  ) {
    this.ferramentas = this.montar();
  }

  listar(): FerramentaGateway[] {
    return this.ferramentas;
  }

  buscar(nome: string): FerramentaGateway | undefined {
    return this.ferramentas.find((ferramenta) => ferramenta.nome === nome);
  }

  private montar(): FerramentaGateway[] {
    return [
      {
        nome: "enter_office",
        titulo: "Entrar no escritório",
        descricao:
          "Handshake com o escritório: devolve quem você é para o gateway, quais verbos a sua credencial libera e qual o teto de declassificação de cada nível de sigilo. Chame primeiro, antes de qualquer consulta.",
        esquema: z.object({}),
        somenteLeitura: true,
        executar: async (_argumentos, identidade) => ({
          tipo: "office_manifest",
          conteudo: {
            escritorio: identidade?.escritorio || "(sem credencial)",
            papel: identidade?.papel || "desconhecido",
            ferramentas: this.ferramentas.map((ferramenta) => ferramenta.nome),
            politica:
              "Nenhum registro do acervo sai deste escritório. Toda resposta é um DTO construído a partir de vocabulário controlado, contagens e texto gerado, limitado pelo rótulo de sigilo da fonte.",
            tetoDeDeclassificacao: this.declassifyService.tetos(),
          },
          declassificacao: {
            sigiloOrigem: "publico",
            nivel: "integral",
            fontes: ["gateway:politica"],
            omitido: [],
          },
        }),
      },
      {
        nome: "get_safe_summary",
        titulo: "Resumo seguro do caso",
        descricao:
          "Situação de um processo em forma reduzida: tribunal, grau, órgão julgador, fase, assuntos catalogados, contagens e a orientação do órgão. Não devolve partes, andamentos, tese nem qualquer texto da peça — esses dados existem no escritório e não atravessam.",
        esquema: z.object({
          processNumber: z
            .string()
            .describe("Número do processo no padrão CNJ: 0000000-00.0000.0.00.0000"),
        }),
        somenteLeitura: true,
        executar: async (argumentos) => {
          const capa = this.classificationService.capaDoProcesso(
            String(argumentos.processNumber)
          );

          return this.declassifyService.resumoDeCaso(capa);
        },
      },
      {
        nome: "search_safe_knowledge",
        titulo: "Busca no conhecimento público",
        descricao:
          "Procura precedentes ligados a assuntos catalogados. Ementa só sai quando a fonte é pública e o item é citável (citavel===true e campos oficiais presentes). Sem ementa oficial o item volta nao_citavel.",
        esquema: z.object({
          assuntos: z
            .array(z.string())
            .min(1)
            .describe(
              "Assuntos da tese, ex.: ['Tarifa de cadastro', 'Seguro prestamista']"
            ),
        }),
        somenteLeitura: true,
        executar: async (argumentos) => {
          const assuntos = (argumentos.assuntos as string[]) || [];
          const itens = this.classificationService.jurisprudencia(assuntos);

          return this.declassifyService.conhecimento(itens, assuntos);
        },
      },
      {
        nome: "get_safe_update",
        titulo: "Atualização estratégica do caso",
        descricao:
          "Leitura estratégica de um processo: faixa de risco, quantos precedentes alinham, divergem ou contrariam o órgão do caso, síntese gerada e pontos de atenção. Sem pontuação numérica, sem texto de voto, sem dados do cliente.",
        esquema: z.object({
          processNumber: z
            .string()
            .describe("Número do processo no padrão CNJ a ser analisado"),
        }),
        somenteLeitura: true,
        executar: async (argumentos) => {
          const analise = await this.classificationService.analise(
            String(argumentos.processNumber)
          );
          const sensivel = this.classificationService.textoSensivel(analise.valor);
          const entidades = this.classificationService.entidadesSensiveis(
            analise.valor
          );

          return this.declassifyService.atualizacaoEstrategica(
            analise,
            sensivel,
            entidades
          );
        },
      },
      {
        nome: "analisar_prevencao",
        titulo: "Análise preventiva segura",
        descricao:
          "Cruza um contrato da demo com a fixture de jurisprudência e devolve um SafeDTO: posição do cliente, amostra fixture, faixa heurística e medidas pré-processuais. Sem CPF, partes ou texto do contrato.",
        esquema: z.object({
          contratoId: z
            .string()
            .describe("Identificador opaco do contrato no acervo interno"),
          posicaoCliente: z
            .enum(["consumidor", "instituicao_financeira"])
            .describe("Posição do cliente no contrato, sem dados pessoais"),
          casoId: z
            .string()
            .optional()
            .describe("Identificador do caso, quando o id do contrato se repete"),
        }),
        somenteLeitura: true,
        executar: async (argumentos) => {
          const relatorio = await this.prevencaoService.analisar(
            String(argumentos.contratoId),
            argumentos.posicaoCliente as "consumidor" | "instituicao_financeira",
            typeof argumentos.casoId === "string" ? argumentos.casoId : undefined
          );
          const caso = await this.prevencaoService.resolverCaso(relatorio.casoId);

          return this.declassifyService.prevencao(
            relatorio,
            this.prevencaoService.textoSensivel(relatorio, caso),
            this.prevencaoService.entidadesSensiveis(caso)
          );
        },
      },
      {
        nome: "buscar_jurisprudencia_prevencao",
        titulo: "Precedentes da prevenção",
        descricao:
          "Busca precedentes da fixture ligados a assuntos catalogados do contrato. Ementa só sai quando a fonte é pública e citável. Sem PII.",
        esquema: z.object({
          contratoId: z
            .string()
            .optional()
            .describe("Contrato da demo cujos assuntos alimentam a busca"),
          casoId: z.string().optional().describe("Caso do contrato, se o id se repetir"),
          assuntos: z
            .array(z.string())
            .optional()
            .describe("Assuntos catalogados, ex.: ['Tarifa de cadastro']"),
        }),
        somenteLeitura: true,
        executar: async (argumentos) => {
          let assuntos = Array.isArray(argumentos.assuntos)
            ? (argumentos.assuntos as string[])
            : [];

          if (!assuntos.length && typeof argumentos.contratoId === "string") {
            assuntos = await this.prevencaoService.assuntosDeContrato(
              argumentos.contratoId,
              typeof argumentos.casoId === "string" ? argumentos.casoId : undefined
            );
          }

          if (!assuntos.length) {
            assuntos = ["Contratos bancários", "Revisão de contrato"];
          }

          const itens = this.classificationService.jurisprudencia(assuntos);
          return this.declassifyService.conhecimento(itens, assuntos);
        },
      },
      {
        nome: "abrir_datajud",
        titulo: "Abrir processo DataJud",
        descricao:
          "Busca a capa na API pública do CNJ (DataJud) e devolve um resumo SafeDTO: tribunal, grau, órgão, assuntos e contagens. Sem partes, CPF ou ementa inventada. Se DATAJUD_MODE=auto e a API pública responder 429/rede, devolve captura local com fonte datajud_captura.",
        esquema: z.object({
          processNumber: z
            .string()
            .min(DATAJUD_LIMITE.cnjMin)
            .max(DATAJUD_LIMITE.cnjMax)
            .describe("Número CNJ: 0000000-00.0000.0.00.0000"),
          tribunal: z
            .string()
            .max(DATAJUD_LIMITE.tribunal)
            .optional()
            .describe("Alias do índice DataJud. Padrão tjpr."),
        }),
        somenteLeitura: true,
        executar: async (argumentos) => {
          const capa = await this.classificationService.capaDataJud(
            String(argumentos.processNumber),
            typeof argumentos.tribunal === "string" ? argumentos.tribunal : undefined
          );
          return this.declassifyService.resumoDeCaso(capa);
        },
      },
      {
        nome: "buscar_datajud",
        titulo: "Buscar metadados DataJud",
        descricao:
          "Busca processos na API pública do CNJ por assunto, classe ou texto. Cada hit volta com citavel=false quando não há ementa oficial. Sem PII. Replay local usa fonte=datajud_captura e nunca inventa hits.",
        esquema: z.object({
          query: z
            .string()
            .max(DATAJUD_LIMITE.busca)
            .optional()
            .describe("Texto livre sobre assunto ou classe"),
          assunto: z
            .string()
            .max(DATAJUD_LIMITE.busca)
            .optional()
            .describe("Assunto catalogado, ex. Alienação Fiduciária"),
          classe: z
            .string()
            .max(DATAJUD_LIMITE.busca)
            .optional()
            .describe("Classe processual"),
          tribunal: z
            .string()
            .max(DATAJUD_LIMITE.tribunal)
            .optional()
            .describe("Alias DataJud, padrão tjpr"),
        }),
        somenteLeitura: true,
        executar: async (argumentos) => {
          const consulta = [
            argumentos.assunto,
            argumentos.classe,
            argumentos.query,
          ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
          const itens = await this.classificationService.jurisprudenciaDataJud({
            query: typeof argumentos.query === "string" ? argumentos.query : undefined,
            assunto: typeof argumentos.assunto === "string" ? argumentos.assunto : undefined,
            classe: typeof argumentos.classe === "string" ? argumentos.classe : undefined,
            tribunal: typeof argumentos.tribunal === "string" ? argumentos.tribunal : undefined,
          });
          return this.declassifyService.conhecimento(itens, consulta);
        },
      },
      {
        nome: "comparar_datajud",
        titulo: "Jurimetria mista DataJud + acervo",
        descricao:
          "Cruza metadados DataJud (ao vivo ou captura oficial) com a fixture/acervo interno via DissidioService. Devolve amostra partida, alinhamentos e síntese gerada. Sem ementa inventada, sem PII, sem oráculo de vitória.",
        esquema: z.object({
          processNumber: z
            .string()
            .min(DATAJUD_LIMITE.cnjMin)
            .max(DATAJUD_LIMITE.cnjMax)
            .describe("Número CNJ do processo a comparar"),
          tribunal: z
            .string()
            .max(DATAJUD_LIMITE.tribunal)
            .optional()
            .describe("Alias DataJud, padrão tjpr"),
        }),
        somenteLeitura: true,
        executar: async (argumentos) => {
          const { rotulado, textoSensivel, entidades } =
            await this.classificationService.comparacaoDataJud(
              String(argumentos.processNumber),
              typeof argumentos.tribunal === "string" ? argumentos.tribunal : undefined
            );
          return this.declassifyService.jurimetriaMista(
            rotulado,
            textoSensivel,
            entidades
          );
        },
      },
    ];
  }
}
