import { Caso } from "@models/caso.model";
import { Contrato } from "@models/contrato.model";
import {
  AVISO_HONESTIDADE_PREVENCAO,
  HonestidadePrevencao,
  PosicaoCliente,
  RelatorioPrevencao,
} from "@models/prevencao.model";
import { OrientacaoCamara, Processo } from "@models/processo.model";
import { CasosService } from "@modules/casos/casos.service";
import { ContractsService } from "@modules/contracts/contracts.service";
import { DissidioService } from "@modules/dissidio/dissidio.service";
import { JurisprudenceService } from "@modules/jurisprudence/jurisprudence.service";
import { ProcessService } from "@modules/process/process.service";
import { assuntosDoContrato } from "@modules/prevencao/prevencao.assuntos";
import { medidasPreProcessuais } from "@modules/prevencao/prevencao.medidas";
import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PROCESSO_BANCARIO } from "../../fixtures/processos";

const HONESTIDADE: HonestidadePrevencao = {
  rotulo: "fixture/heuristica",
  aviso: AVISO_HONESTIDADE_PREVENCAO,
  jurimetriaAoVivo: false,
  oraculo: false,
};

@Injectable()
export class PrevencaoService {
  private readonly logger = new Logger(PrevencaoService.name);
  private readonly relatorios = new Map<string, RelatorioPrevencao[]>();

  constructor(
    private readonly contractsService: ContractsService,
    private readonly casosService: CasosService,
    private readonly processService: ProcessService,
    private readonly jurisprudenceService: JurisprudenceService,
    private readonly dissidioService: DissidioService
  ) {}

  async analisar(
    contratoId: string,
    posicaoCliente: PosicaoCliente,
    casoId?: string
  ): Promise<RelatorioPrevencao> {
    const { contrato, caso } = await this.resolverContrato(contratoId, casoId);
    const processo = this.processoDoContrato(contrato, caso);
    const assuntos = assuntosDoContrato(contrato, caso);
    const encontradas = this.jurisprudenceService.buscarRelacionadas(assuntos);
    const jurisprudences = this.dissidioService.classificar(processo, encontradas);
    const dissidioReport = this.dissidioService.montarRelatorioDissidio(
      processo,
      jurisprudences
    );
    const chanceReport = this.dissidioService.montarRelatorioChance(
      processo,
      jurisprudences
    );

    const relatorio: RelatorioPrevencao = {
      id: `prv_${randomBytes(6).toString("hex")}`,
      casoId: contrato.casoId,
      contratoId: contrato.id,
      contratoTitulo: contrato.titulo,
      posicaoCliente,
      amostra: {
        total: jurisprudences.length,
        fonte: "fixture",
      },
      medidasPreProcessuais: medidasPreProcessuais(posicaoCliente),
      honestidade: HONESTIDADE,
      dissidioReport,
      chanceReport,
      jurisprudences,
      criadoEm: new Date().toISOString(),
    };

    const existentes = this.relatorios.get(relatorio.casoId) || [];
    this.relatorios.set(relatorio.casoId, [relatorio, ...existentes]);
    return relatorio;
  }

  async assuntosDeContrato(
    contratoId: string,
    casoId?: string
  ): Promise<string[]> {
    const { contrato, caso } = await this.resolverContrato(contratoId, casoId);
    return assuntosDoContrato(contrato, caso);
  }

  listar(casoId: string): RelatorioPrevencao[] {
    const chave = casoId.trim();
    if (!chave) {
      return [];
    }

    return (this.relatorios.get(chave) || []).map((item) => ({ ...item }));
  }

  /**
   * Texto e identificadores que não podem reaparecer no SafeDTO.
   * Usado só no caminho MCP.
   */
  textoSensivel(relatorio: RelatorioPrevencao, caso?: Caso): string[] {
    return [
      relatorio.contratoTitulo,
      caso?.resumo,
      caso?.tese,
      caso?.cliente,
      ...(caso?.partes || []).map((parte) => parte.nome),
    ].filter((item): item is string => Boolean(item && item.trim()));
  }

  entidadesSensiveis(caso?: Caso): string[] {
    return [
      caso?.cliente,
      ...(caso?.partes || []).map((parte) => parte.nome),
    ].filter((item): item is string => Boolean(item && item.trim()));
  }

  async resolverCaso(casoId?: string): Promise<Caso | undefined> {
    const chave = (casoId || "").trim();
    if (!chave) {
      return undefined;
    }

    try {
      return await this.casosService.obter(chave);
    } catch (erro) {
      this.logger.debug(
        `Caso '${chave}' indisponível para prevenção: ${
          erro instanceof Error ? erro.message : String(erro)
        }`
      );
      return undefined;
    }
  }

  private async resolverContrato(
    contratoId: string,
    casoId?: string
  ): Promise<{ contrato: Contrato; caso?: Caso }> {
    const id = contratoId.trim();
    const casoChave = (casoId || "").trim();

    try {
      const contrato = await this.contractsService.obter(id);
      if (!casoChave || contrato.casoId === casoChave) {
        const caso = await this.resolverCaso(casoChave || contrato.casoId);
        return { contrato, caso };
      }
    } catch {
      /* tenta o acervo do caso */
    }

    if (casoChave) {
      const listados = await this.contractsService.listar({ casoId: casoChave });
      const naLista = listados.find((item) => item.id === id);
      if (naLista) {
        return { contrato: naLista, caso: await this.resolverCaso(casoChave) };
      }

      const caso = await this.resolverCaso(casoChave);
      const noCaso = caso?.contratos.find((item) => item.id === id);
      if (noCaso && caso) {
        return {
          contrato: { ...noCaso, casoId: caso.id },
          caso,
        };
      }

      if (caso) {
        const primeiro = caso.contratos[0];
        if (primeiro) {
          return {
            contrato: { ...primeiro, casoId: caso.id },
            caso,
          };
        }

        return {
          contrato: {
            id,
            casoId: caso.id,
            titulo: caso.tema || "Contrato do caso",
            tipo: "Contrato",
            data: caso.atualizacao || "",
            origem: "Acervo interno",
            resumo: caso.tese || caso.resumo || caso.tema,
          },
          caso,
        };
      }
    }

    throw new NotFoundException("Contrato não encontrado.");
  }

  private processoDoContrato(contrato: Contrato, caso?: Caso): Processo {
    if (caso?.processNumber) {
      try {
        if (this.processService.numeroValido(caso.processNumber)) {
          return this.processService.buscarCapa(caso.processNumber);
        }
      } catch {
        /* capa fixture só existe para o processo bancário da demo */
      }
    }

    return {
      ...PROCESSO_BANCARIO,
      processNumber: caso?.processNumber || PROCESSO_BANCARIO.processNumber,
      court: caso?.court || PROCESSO_BANCARIO.court,
      chamber: caso?.chamber || PROCESSO_BANCARIO.chamber,
      subjects: assuntosDoContrato(contrato, caso),
      thesis: caso?.tese || PROCESSO_BANCARIO.thesis,
      summary: contrato.resumo || caso?.resumo || PROCESSO_BANCARIO.summary,
      chamberOrientation: this.orientacaoDoCaso(caso),
      parties: caso?.partes?.length ? caso.partes : PROCESSO_BANCARIO.parties,
    };
  }

  private orientacaoDoCaso(caso?: Caso): OrientacaoCamara {
    if (!caso) {
      return PROCESSO_BANCARIO.chamberOrientation;
    }

    if (caso.votos.against >= caso.votos.for) {
      return "rejeita_revisao";
    }

    return "aceita_revisao";
  }
}
