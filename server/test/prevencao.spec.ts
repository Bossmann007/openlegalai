import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CHANCE_INDISPONIVEL } from "../src/common/security/fonte-fato";
import { Contrato } from "../src/models/contrato.model";
import { DlpService } from "../src/modules/gateway/dlp.service";
import { DeclassifyService } from "../src/modules/gateway/declassify.service";
import { PolicyService } from "../src/modules/gateway/policy.service";
import { DissidioService } from "../src/modules/dissidio/dissidio.service";
import { JurisprudenceService } from "../src/modules/jurisprudence/jurisprudence.service";
import { ProcessService } from "../src/modules/process/process.service";
import { assuntosDoContrato } from "../src/modules/prevencao/prevencao.assuntos";
import { medidasPreProcessuais } from "../src/modules/prevencao/prevencao.medidas";
import { PrevencaoService } from "../src/modules/prevencao/prevencao.service";
import { CONTRATOS_INICIAIS } from "../src/fixtures/contratos";
import { PROCESSO_BANCARIO } from "../src/fixtures/processos";

function contratoPorId(id: string): Contrato {
  const achado = CONTRATOS_INICIAIS.find((item) => item.id === id);
  if (!achado) {
    throw new NotFoundException("Contrato não encontrado.");
  }
  return achado;
}

function servicoPrevencao() {
  return new PrevencaoService(
    {
      obter: async (id: string) => contratoPorId(id),
      listar: async (filtro: { casoId?: string }) =>
        CONTRATOS_INICIAIS.filter(
          (item) => !filtro.casoId || item.casoId === filtro.casoId
        ),
    } as never,
    {
      obter: async () => {
        throw new NotFoundException("Caso não encontrado.");
      },
    } as never,
    new ProcessService(),
    new JurisprudenceService(),
    new DissidioService()
  );
}

describe("prevencao", () => {
  it("deriva assuntos bancários da fixture sem texto livre de tribunal", () => {
    const contrato = contratoPorId("tarifas-c1");
    const assuntos = assuntosDoContrato(contrato);

    expect(assuntos).toContain("Contratos bancários");
    expect(assuntos).toContain("Tarifa de cadastro");
  });

  it("monta medidas pré-processuais por posição", () => {
    expect(medidasPreProcessuais("consumidor")[0]).toMatch(/Notificar/);
    expect(medidasPreProcessuais("instituicao_financeira")[0]).toMatch(
      /pactuação expressa/
    );
  });

  it("analisa contrato fixture com Dissidio e rótulo honesto", async () => {
    const servico = servicoPrevencao();
    const relatorio = await servico.analisar("tarifas-c1", "consumidor");

    expect(relatorio.posicaoCliente).toBe("consumidor");
    expect(relatorio.amostra.fonte).toBe("fixture");
    expect(relatorio.amostra.total).toBeGreaterThan(0);
    expect(relatorio.honestidade.rotulo).toBe("fixture/heuristica");
    expect(relatorio.honestidade.jurimetriaAoVivo).toBe(false);
    expect(relatorio.honestidade.oraculo).toBe(false);
    expect(relatorio.chanceReport.label).toBe(CHANCE_INDISPONIVEL);
    expect(relatorio.dissidioReport.narrative).toMatch(/câmara/i);
    expect(relatorio.medidasPreProcessuais.length).toBeGreaterThan(0);
    expect(servico.listar("tarifas")).toHaveLength(1);
  });

  it("recusa contrato inexistente", async () => {
    const servico = servicoPrevencao();
    await expect(servico.analisar("nao-existe", "consumidor")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("declassifica prevenção sem PII nem título do contrato", async () => {
    const servico = servicoPrevencao();
    const relatorio = await servico.analisar("tarifas-c1", "consumidor");
    const dto = new DeclassifyService(new DlpService()).prevencao(
      relatorio,
      servico.textoSensivel(relatorio),
      [PROCESSO_BANCARIO.parties[0].nome]
    );

    const corpo = JSON.stringify(dto);
    expect(dto.tipo).toBe("prevencao_summary");
    expect(dto.conteudo.amostra.fonte).toBe("fixture");
    expect(dto.conteudo.honestidade.oraculo).toBe(false);
    expect(corpo).not.toContain("Oliveira");
    expect(corpo).not.toContain("88.421");
    expect(corpo).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(new DlpService().detectar(dto)).toEqual([]);
  });

  it("libera as tools MCP de prevenção no papel certo", () => {
    const politica = new PolicyService();
    const advogado = {
      id: "u-002",
      nome: "Dr. Rafael Nunes",
      papel: "advogado" as const,
      escritorio: "prado-advogados",
    };

    expect(politica.avaliar(advogado, "analisar_prevencao").decisao).toBe(
      "permitido"
    );
    expect(
      politica.avaliar(advogado, "buscar_jurisprudencia_prevencao").decisao
    ).toBe("permitido");
    expect(politica.avaliar(null, "analisar_prevencao").decisao).toBe("negado");
    expect(
      politica.avaliar(
        { ...advogado, papel: "estagiario" },
        "analisar_prevencao"
      ).decisao
    ).toBe("negado");
  });
});
