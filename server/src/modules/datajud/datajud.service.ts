import { Caso } from "@models/caso.model";
import { Jurisprudencia, JurisprudenciaFixture } from "@models/jurisprudencia.model";
import { RelatorioChance, RelatorioDissidio } from "@models/pesquisa.model";
import { Processo } from "@models/processo.model";
import { CasosService } from "@modules/casos/casos.service";
import { cnjDigitos } from "@modules/casos/caso.assembler";
import { DissidioService } from "@modules/dissidio/dissidio.service";
import { JurisprudenceService } from "@modules/jurisprudence/jurisprudence.service";
import { ProcessService } from "@modules/process/process.service";
import { Injectable, Logger } from "@nestjs/common";
import { DataJudClient } from "./datajud.client";
import { erroInvalido, erroVazio } from "./datajud.errors";
import {
  amostraDe,
  carimbarFixture,
  casoJurisDeClassificada,
  dissidiosDeRelatorio,
  fixtureDeHit,
  jurimetriaMista,
  montarCasoLive,
  orientacaoCapa,
  processoDeHit,
} from "./datajud.mapper";
import { AmostraMista, DataJudHit } from "./datajud.types";

export type ComparacaoPublica = {
  processo: Processo;
  classificadas: Jurisprudencia[];
  amostra: AmostraMista;
  dissidio: RelatorioDissidio;
  chance: RelatorioChance;
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
    const hits = await this.client.buscarPorCnj(numero, alias);
    const hit = hits[0];
    if (!hit) {
      throw erroVazio(numero, alias);
    }

    const caso = await this.compararEMontar(hit, alias);
    this.casosService.guardarLive(caso);
    await this.casosService.tentarPersistirLive(hit);
    return caso;
  }

  async buscar(params: {
    query?: string;
    assunto?: string;
    classe?: string;
    tribunal?: string;
  }): Promise<{ tribunal: string; aoVivo: true; fonte: "datajud"; hits: DataJudHit[] }> {
    const alias = this.client.alias(params.tribunal);
    const hits = await this.client.buscar({ ...params, tribunal: alias });
    return {
      tribunal: alias,
      aoVivo: true,
      fonte: "datajud",
      hits,
    };
  }

  async capaPublica(numeroProcesso: string, tribunal?: string): Promise<Processo> {
    const numero = this.processService.normalizarNumero(numeroProcesso);
    if (!this.processService.numeroValido(numero)) {
      throw erroInvalido(
        "Número inválido. Use o padrão CNJ: 0000000-00.0000.0.00.0000."
      );
    }

    const alias = this.client.alias(tribunal);
    const hits = await this.client.buscarPorCnj(numero, alias);
    if (!hits[0]) {
      throw erroVazio(numero, alias);
    }

    return processoDeHit(hits[0]);
  }

  async precedentesAoVivoPublicos(params: {
    query?: string;
    assunto?: string;
    classe?: string;
    tribunal?: string;
  }): Promise<JurisprudenciaFixture[]> {
    const resultado = await this.buscar(params);
    return resultado.hits.map((hit, indice) => fixtureDeHit(hit, indice));
  }

  async comparacaoPublica(
    numeroProcesso: string,
    tribunal?: string
  ): Promise<ComparacaoPublica> {
    const numero = this.processService.normalizarNumero(numeroProcesso);
    if (!this.processService.numeroValido(numero)) {
      throw erroInvalido(
        "Número inválido. Use o padrão CNJ: 0000000-00.0000.0.00.0000."
      );
    }

    const alias = this.client.alias(tribunal);
    const hits = await this.client.buscarPorCnj(numero, alias);
    const hit = hits[0];
    if (!hit) {
      throw erroVazio(numero, alias);
    }

    const base = await this.casosService.obterDoAcervo(hit.numeroProcesso);
    const capa = this.capaComparacao(hit, base);
    capa.parties = [];
    const assuntos = this.assuntosComparacao(hit, base, capa);
    const liveFixtures = await this.precedentesAoVivo(assuntos, alias, hit);
    const acervoFixtures = this.jurisprudenceService
      .buscarRelacionadas(assuntos)
      .map(carimbarFixture);
    const classificadas = this.dissidioService.classificar(capa, [
      ...acervoFixtures,
      ...liveFixtures,
    ]);

    return {
      processo: capa,
      classificadas,
      amostra: amostraDe(
        liveFixtures.length,
        acervoFixtures.length,
        base ? "acervo_interno" : "fixture"
      ),
      dissidio: this.dissidioService.montarRelatorioDissidio(capa, classificadas),
      chance: this.dissidioService.montarRelatorioChance(capa, classificadas),
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

  private async compararEMontar(hit: DataJudHit, alias: string): Promise<Caso> {
    const base = await this.casosService.obterDoAcervo(hit.numeroProcesso);
    const capa = this.capaComparacao(hit, base);
    const assuntos = this.assuntosComparacao(hit, base, capa);

    const liveFixtures = await this.precedentesAoVivo(assuntos, alias, hit);
    const acervoFixtures = this.jurisprudenceService
      .buscarRelacionadas(assuntos)
      .map(carimbarFixture);

    const merged: JurisprudenciaFixture[] = [...acervoFixtures, ...liveFixtures];
    const classificadas = this.dissidioService.classificar(capa, merged);
    const dissidio = this.dissidioService.montarRelatorioDissidio(capa, classificadas);
    const chance = this.dissidioService.montarRelatorioChance(capa, classificadas);

    const juris = classificadas.map((item) =>
      casoJurisDeClassificada(
        item,
        item.fonte === "datajud" ? "datajud" : "acervo_interno"
      )
    );

    const amostra = amostraDe(
      liveFixtures.length,
      acervoFixtures.length,
      base ? "acervo_interno" : "fixture"
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

  private async precedentesAoVivo(
    assuntos: string[],
    alias: string,
    capa: DataJudHit
  ): Promise<JurisprudenciaFixture[]> {
    const termo = assuntos[0] || capa.classe;
    if (!termo) {
      return [fixtureDeHit(capa, 0)];
    }

    try {
      const hits = await this.client.buscar({
        assunto: termo,
        query: termo,
        tribunal: alias,
      });
      const vistos = new Set<string>();
      const fixtures: JurisprudenciaFixture[] = [];

      for (const [indice, item] of hits.entries()) {
        const chave = cnjDigitos(item.numeroProcesso) || `${indice}`;
        if (vistos.has(chave)) {
          continue;
        }
        if (chave && chave === cnjDigitos(capa.numeroProcesso)) {
          continue;
        }
        vistos.add(chave);
        fixtures.push(fixtureDeHit(item, indice));
      }

      if (!fixtures.length) {
        fixtures.push(fixtureDeHit(capa, 0));
      }

      return fixtures.slice(0, 8);
    } catch (erro) {
      this.logger.warn(
        `Busca de precedentes DataJud falhou após a capa ao vivo: ${
          erro instanceof Error ? erro.message : String(erro)
        }`
      );
      return [fixtureDeHit(capa, 0)];
    }
  }
}
