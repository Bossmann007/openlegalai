import { Caso } from "@models/caso.model";
import { Jurisprudencia, JurisprudenciaFixture } from "@models/jurisprudencia.model";
import { RelatorioChance, RelatorioDissidio } from "@models/pesquisa.model";
import { Processo } from "@models/processo.model";
import { CasosService } from "@modules/casos/casos.service";
import { DissidioService } from "@modules/dissidio/dissidio.service";
import { JurisprudenceService } from "@modules/jurisprudence/jurisprudence.service";
import { ProcessService } from "@modules/process/process.service";
import { Injectable, Logger } from "@nestjs/common";
import { DataJudClient } from "./datajud.client";
import { erroInvalido, erroVazio } from "./datajud.errors";
import {
  amostraDe,
  casoJurisDeClassificada,
  dissidiosDeRelatorio,
  fixtureDeHit,
  jurimetriaMista,
  mesclarAcervo,
  montarCasoLive,
  orientacaoCapa,
  precedentesDeHits,
  processoDeHit,
} from "./datajud.mapper";
import { AmostraMista, DataJudHit, DataJudOrigem, ORIGEM_LIVE, origemMaisHonesta } from "./datajud.types";

export type ComparacaoPublica = {
  processo: Processo;
  classificadas: Jurisprudencia[];
  amostra: AmostraMista;
  dissidio: RelatorioDissidio;
  chance: RelatorioChance;
  origem: DataJudOrigem;
};

export type ComparacaoComTaint = ComparacaoPublica & {
  textoSensivel: string[];
  entidades: string[];
};

@Injectable()
export class DataJudService {
  private readonly logger = new Logger(DataJudService.name);

  constructor(
    private readonly client: DataJudClient,
    private readonly casosService: CasosService,
    private readonly processService: ProcessService,
    private readonly jurisprudenceService: JurisprudenceService,
    private readonly dissidioService: DissidioService
  ) {}

  async abrir(numeroProcesso: string, tribunal?: string): Promise<Caso> {
    const numero = this.processService.normalizarNumero(numeroProcesso);
    if (!this.processService.numeroValido(numero)) {
      throw erroInvalido(
        "Número inválido. Use o padrão CNJ: 0000000-00.0000.0.00.0000."
      );
    }

    const alias = this.client.alias(tribunal);
    const pesquisa = await this.client.buscarPorCnj(numero, alias);
    const hit = pesquisa.hits[0];
    if (!hit) {
      throw erroVazio(numero, alias);
    }

    const caso = await this.compararEMontar(hit, alias, pesquisa.origem);
    this.casosService.guardarLive(caso);
    await this.casosService.tentarPersistirLive(hit);
    return caso;
  }

  async buscar(params: {
    query?: string;
    assunto?: string;
    classe?: string;
    tribunal?: string;
  }): Promise<{
    tribunal: string;
    aoVivo: boolean;
    fonte: DataJudOrigem["fonte"];
    rotulo: DataJudOrigem["rotulo"];
    origem: DataJudOrigem;
    hits: DataJudHit[];
  }> {
    const alias = this.client.alias(params.tribunal);
    const pesquisa = await this.client.buscar({ ...params, tribunal: alias });
    return {
      tribunal: alias,
      aoVivo: pesquisa.origem.aoVivo,
      fonte: pesquisa.origem.fonte,
      rotulo: pesquisa.origem.rotulo,
      origem: pesquisa.origem,
      hits: pesquisa.hits,
    };
  }

  async capaPublica(
    numeroProcesso: string,
    tribunal?: string
  ): Promise<{ processo: Processo; origem: DataJudOrigem }> {
    const numero = this.processService.normalizarNumero(numeroProcesso);
    if (!this.processService.numeroValido(numero)) {
      throw erroInvalido(
        "Número inválido. Use o padrão CNJ: 0000000-00.0000.0.00.0000."
      );
    }

    const alias = this.client.alias(tribunal);
    const pesquisa = await this.client.buscarPorCnj(numero, alias);
    if (!pesquisa.hits[0]) {
      throw erroVazio(numero, alias);
    }

    return {
      processo: processoDeHit(pesquisa.hits[0]),
      origem: pesquisa.origem,
    };
  }

  async precedentesAoVivoPublicos(params: {
    query?: string;
    assunto?: string;
    classe?: string;
    tribunal?: string;
  }): Promise<{ itens: JurisprudenciaFixture[]; origem: DataJudOrigem }> {
    const resultado = await this.buscar(params);
    return {
      itens: resultado.hits.map((hit, indice) => fixtureDeHit(hit, indice)),
      origem: resultado.origem,
    };
  }

  async comparacaoPublica(
    numeroProcesso: string,
    tribunal?: string
  ): Promise<ComparacaoComTaint> {
    const numero = this.processService.normalizarNumero(numeroProcesso);
    if (!this.processService.numeroValido(numero)) {
      throw erroInvalido(
        "Número inválido. Use o padrão CNJ: 0000000-00.0000.0.00.0000."
      );
    }

    const alias = this.client.alias(tribunal);
    const pesquisa = await this.client.buscarPorCnj(numero, alias);
    const hit = pesquisa.hits[0];
    if (!hit) {
      throw erroVazio(numero, alias);
    }

    const base = await this.casosService.obterDoAcervo(hit.numeroProcesso);
    const capa = this.capaComparacao(hit, base);
    capa.parties = [];
    const assuntos = this.assuntosComparacao(hit, base, capa);
    const relacionados = await this.precedentesAoVivo(assuntos, alias, hit);
    const acervoFixtures = this.acervoParaComparacao(base, assuntos);
    const classificadas = this.dissidioService.classificar(capa, [
      ...acervoFixtures,
      ...relacionados.itens,
    ]);
    const origem = origemMaisHonesta(pesquisa.origem, relacionados.origem);

    return {
      processo: capa,
      classificadas,
      amostra: amostraDe(
        relacionados.itens.length,
        acervoFixtures.length,
        base ? "acervo_interno" : "fixture",
        origem.kind === "captura" ? "datajud_captura" : "datajud_metadata"
      ),
      dissidio: this.dissidioService.montarRelatorioDissidio(capa, classificadas),
      chance: this.dissidioService.montarRelatorioChance(capa, classificadas),
      origem,
      textoSensivel: this.textoSensivelAcervo(base),
      entidades: this.entidadesAcervo(base),
    };
  }

  textoSensivelAcervo(caso?: Caso): string[] {
    if (!caso) {
      return [];
    }

    return [
      caso.resumo,
      caso.tese,
      caso.cliente,
      ...(caso.partes || []).map((parte) => parte.nome),
      ...(caso.peticoes || []).map((peca) => peca.titulo),
      ...(caso.peticoes || []).map((peca) => peca.resumo),
    ].filter((item): item is string => Boolean(item && item.trim()));
  }

  entidadesAcervo(caso?: Caso): string[] {
    if (!caso) {
      return [];
    }

    return [
      caso.cliente,
      ...(caso.partes || []).map((parte) => parte.nome),
    ].filter((item): item is string => Boolean(item && item.trim()));
  }

  private async compararEMontar(
    hit: DataJudHit,
    alias: string,
    origemCapa: DataJudOrigem
  ): Promise<Caso> {
    const base = await this.casosService.obterDoAcervo(hit.numeroProcesso);
    const capa = this.capaComparacao(hit, base);
    const assuntos = this.assuntosComparacao(hit, base, capa);

    const relacionados = await this.precedentesAoVivo(assuntos, alias, hit);
    const acervoFixtures = this.acervoParaComparacao(base, assuntos);

    const merged: JurisprudenciaFixture[] = [...acervoFixtures, ...relacionados.itens];
    const classificadas = this.dissidioService.classificar(capa, merged);
    const dissidio = this.dissidioService.montarRelatorioDissidio(capa, classificadas);
    const chance = this.dissidioService.montarRelatorioChance(capa, classificadas);

    const juris = classificadas.map((item) => casoJurisDeClassificada(item));
    const origem = origemMaisHonesta(origemCapa, relacionados.origem);

    const amostra = amostraDe(
      relacionados.itens.length,
      acervoFixtures.length,
      base ? "acervo_interno" : "fixture",
      origem.kind === "captura" ? "datajud_captura" : "datajud_metadata"
    );

    return montarCasoLive(
      hit,
      base,
      juris,
      dissidiosDeRelatorio(dissidio),
      jurimetriaMista(amostra, dissidio, chance)
    );
  }

  private capaComparacao(hit: DataJudHit, base?: Caso): Processo {
    const live = processoDeHit(hit);
    live.chamberOrientation = orientacaoCapa(base);

    try {
      if (this.processService.numeroValido(hit.numeroProcesso)) {
        const fixture = this.processService.buscarCapa(hit.numeroProcesso);
        return {
          ...live,
          chamber: fixture.chamber || live.chamber,
          chamberOrientation: fixture.chamberOrientation,
          thesis: fixture.thesis,
        };
      }
    } catch {
      /* capa fixture só existe para o processo bancário da demo */
    }

    if (base?.chamber) {
      live.chamber = base.chamber;
    }
    return live;
  }

  private assuntosComparacao(hit: DataJudHit, base: Caso | undefined, capa: Processo): string[] {
    const juntos = [
      ...hit.assuntos,
      ...(capa.subjects || []),
      base?.tema,
      base?.subtema,
    ].filter((item): item is string => Boolean(item && item.trim()));

    return [...new Set(juntos)];
  }

  private acervoParaComparacao(
    base: Caso | undefined,
    assuntos: string[]
  ): JurisprudenciaFixture[] {
    return mesclarAcervo(
      base?.jurisprudencias || [],
      this.jurisprudenceService.buscarRelacionadas(assuntos)
    );
  }

  private async precedentesAoVivo(
    assuntos: string[],
    alias: string,
    capa: DataJudHit
  ): Promise<{ itens: JurisprudenciaFixture[]; origem: DataJudOrigem }> {
    const termo = assuntos[0] || capa.classe;
    if (!termo) {
      return { itens: [], origem: ORIGEM_LIVE };
    }

    try {
      const pesquisa = await this.client.buscar({
        assunto: termo,
        query: termo,
        tribunal: alias,
      });
      return {
        itens: precedentesDeHits(pesquisa.hits, capa.numeroProcesso),
        origem: pesquisa.origem,
      };
    } catch (erro) {
      this.logger.warn(
        `Busca de precedentes DataJud falhou após a capa: ${
          erro instanceof Error ? erro.message : String(erro)
        }`
      );
      return { itens: [], origem: ORIGEM_LIVE };
    }
  }
}
