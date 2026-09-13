import { describe, expect, it } from "vitest";
import { aplicarPoliticaCaso } from "../src/common/security/caso-policy";
import { ementaCitavel, ementaParaCitacao } from "../src/common/security/cite-or-silent";
import { CHANCE_INDISPONIVEL } from "../src/common/security/fonte-fato";
import { Caso } from "../src/models/caso.model";
import { DlpService } from "../src/modules/gateway/dlp.service";
import { DeclassifyService } from "../src/modules/gateway/declassify.service";
import { PolicyService } from "../src/modules/gateway/policy.service";
import { DataJudClient } from "../src/modules/datajud/datajud.client";
import { DataJudException } from "../src/modules/datajud/datajud.errors";
import {
  fixtureDeHit,
  hitDeSource,
  processoDeHit,
  tribunalAlias,
} from "../src/modules/datajud/datajud.mapper";
import { ComparacaoPublica } from "../src/modules/datajud/datajud.service";
import { DissidioService } from "../src/modules/dissidio/dissidio.service";
import { JurisprudenceService } from "../src/modules/jurisprudence/jurisprudence.service";
import { rotular } from "../src/models/classificacao.model";

const SOURCE_COM_PII = {
  numeroProcesso: "00001065620148160193",
  tribunal: "TJPR",
  grau: "G1",
  classe: { codigo: 7, nome: "Procedimento Comum Cível" },
  assuntos: [{ codigo: 10433, nome: "Alienação Fiduciária" }],
  orgaoJulgador: { nome: "COLOMBO - 2ª VARA CÍVEL" },
  dataAjuizamento: "2014-03-12T00:00:00",
  movimentos: [{ dataHora: "2014-03-12T10:00:00", nome: "Distribuição" }],
  partes: [
    { nome: "Maria Souza", documento: "390.533.447-05" },
    { nome: "Banco Exemplo S.A." },
  ],
};

function casoMinimo(parcial: Partial<Caso> = {}): Caso {
  return {
    id: "caso-1",
    titulo: "Caso",
    tema: "Contratos bancários",
    subtema: "",
    processNumber: "0000106-56.2014.8.16.0193",
    court: "TJPR",
    chamber: "2ª Vara Cível",
    status: "ATIVO",
    cliente: "Maria Souza",
    partes: [{ papel: "Autor", nome: "Maria Souza" }],
    resumo: "Peça inicial com CPF 390.533.447-05.",
    tese: "",
    atualizacao: "",
    chance: 0,
    chanceRotulo: CHANCE_INDISPONIVEL,
    chanceTexto: CHANCE_INDISPONIVEL,
    votos: { for: 0, against: 0, diverge: 0 },
    peticoes: [
      {
        id: "p1",
        titulo: "Inicial com CPF 390.533.447-05",
        tipo: "Petição",
        data: "2014-03-12",
        origem: "Acervo",
        resumo: "Texto integral da petição inicial.",
      },
    ],
    contratos: [],
    documentos: [],
    decisoes: [],
    modelos: [],
    historico: [],
    prazos: [],
    teses: [],
    resultados: [],
    conversas: [],
    jurisprudencias: [],
    dissidios: [],
    jurimetria: { amostra: 0, padrao: "", interno: "", riscos: [] },
    fontes: undefined,
    ...parcial,
  };
}

describe("DataJud mapper", () => {
  it("lê metadados oficiais e ignora partes/CPF do _source", () => {
    const hit = hitDeSource(SOURCE_COM_PII, "tjpr");

    expect(hit?.numeroProcesso).toBe("0000106-56.2014.8.16.0193");
    expect(hit?.classe).toBe("Procedimento Comum Cível");
    expect(hit?.assuntos).toContain("Alienação Fiduciária");
    expect(JSON.stringify(hit)).not.toContain("Maria Souza");
    expect(JSON.stringify(hit)).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });

  it("marca hit DataJud como não citável e sem ementa", () => {
    const hit = hitDeSource(SOURCE_COM_PII, "tjpr");
    const fixture = fixtureDeHit(hit!, 0);

    expect(fixture.fonte).toBe("datajud");
    expect(fixture.citavel).toBe(false);
    expect(fixture.ementaSnippet).toBeNull();
    expect(ementaCitavel(fixture)).toBe(false);
    expect(ementaParaCitacao(fixture)).toBeNull();
  });

  it("capa ao vivo não carrega partes", () => {
    const processo = processoDeHit(hitDeSource(SOURCE_COM_PII, "tjpr")!);
    expect(processo.parties).toEqual([]);
    expect(processo.chamberOrientation).toBe("indeterminada");
  });

  it("normaliza alias de tribunal e cai no padrão se inválido", () => {
    expect(tribunalAlias("TJPR")).toBe("tjpr");
    expect(tribunalAlias("api_publica_tjpr")).toBe("tjpr");
    expect(tribunalAlias("***")).toBe("tjpr");
  });
});

describe("DataJud client", () => {
  it("falha com honestidade quando DATAJUD_API_KEY falta", async () => {
    const anterior = process.env.DATAJUD_API_KEY;
    delete process.env.DATAJUD_API_KEY;
    const client = new DataJudClient();

    await expect(client.buscarPorCnj("0000106-56.2014.8.16.0193", "tjpr")).rejects.toBeInstanceOf(
      DataJudException
    );
    await expect(client.buscarPorCnj("0000106-56.2014.8.16.0193", "tjpr")).rejects.toThrow(
      /DATAJUD_API_KEY/
    );

    if (anterior !== undefined) {
      process.env.DATAJUD_API_KEY = anterior;
    }
  });
});

describe("comparação mista e cite-or-silent", () => {
  it("hit DataJud fica unknown e não vira diverge", () => {
    const hit = hitDeSource(SOURCE_COM_PII, "tjpr")!;
    const live = fixtureDeHit(hit, 0);
    const acervo = new JurisprudenceService()
      .buscarRelacionadas(["Contratos bancários"])
      .map((item) => ({ ...item, fonte: "acervo_interno" as const }));
    const classificadas = new DissidioService().classificar(processoDeHit(hit), [
      ...acervo,
      live,
    ]);
    const datajud = classificadas.find((item) => item.fonte === "datajud");

    expect(datajud?.alignment).toBe("unknown");
    expect(datajud?.citeStatus).toBe("nao_citavel");
    expect(datajud?.alignment).not.toBe("diverge");
    expect(classificadas.some((item) => item.fonte === "acervo_interno")).toBe(true);
  });

  it("política do caso preserva fonte datajud e blanka ementa", () => {
    const hit = hitDeSource(SOURCE_COM_PII, "tjpr")!;
    const fixture = fixtureDeHit(hit, 0);
    const limpo = aplicarPoliticaCaso(
      casoMinimo({
        jurisprudencias: [
          {
            id: fixture.id,
            processNumber: fixture.processNumber,
            acordao: fixture.processNumber,
            court: fixture.court,
            chamber: fixture.chamber,
            reporter: "",
            date: fixture.judgmentDate || "",
            status: "ATIVO",
            alignment: "unknown",
            ementa: "ementa inventada pelo modelo",
            pontos: [],
            essencial: { resumo: "", itens: [] },
            fortalecer: { resumo: "", itens: [] },
            blindar: { resumo: "", itens: [] },
            contrapor: { resumo: "", itens: [] },
            citavel: false,
            fonte: "datajud",
          },
        ],
        jurimetria: {
          amostra: 2,
          amostraAoVivo: 1,
          amostraAcervo: 1,
          padrao: "comparação descritiva",
          interno: "metadados",
          riscos: [],
          honestidade: {
            live: "datajud_metadata",
            acervo: "fixture",
            ementaOracle: false,
          },
        },
      })
    );

    expect(limpo.jurisprudencias[0].fonte).toBe("datajud");
    expect(limpo.jurisprudencias[0].citavel).toBe(false);
    expect(limpo.jurisprudencias[0].ementa).toBe("");
    expect(limpo.fontes.jurimetria).toBe("datajud");
  });
});

describe("SafeDTO DataJud", () => {
  const declassify = new DeclassifyService(new DlpService());

  it("jurimetria mista não vaza CPF, parte nem peça e não é oráculo", () => {
    const hit = hitDeSource(SOURCE_COM_PII, "tjpr")!;
    const caso = casoMinimo();
    const comparacao: ComparacaoPublica = {
      processo: { ...processoDeHit(hit), parties: [] },
      classificadas: [
        {
          ...fixtureDeHit(hit, 0),
          alignment: "unknown",
          citeStatus: "nao_citavel",
        },
      ],
      amostra: {
        total: 3,
        aoVivo: 1,
        acervo: 2,
        honestidade: {
          live: "datajud_metadata",
          acervo: "acervo_interno",
          ementaOracle: false,
        },
      },
      dissidio: { narrative: "comparação descritiva", conflicts: [] },
      chance: {
        score: 0,
        label: CHANCE_INDISPONIVEL,
        rationale: CHANCE_INDISPONIVEL,
        blindagem: [],
        fonte: "indisponivel",
      },
      textoSensivel: [caso.resumo, caso.cliente, caso.peticoes[0].titulo],
      entidades: ["Maria Souza"],
    };

    const dto = declassify.jurimetriaMista(
      rotular(comparacao, "publico", "datajud:comparacao"),
      comparacao.textoSensivel,
      comparacao.entidades
    );
    const corpo = JSON.stringify(dto);

    expect(dto.tipo).toBe("jurimetria_mista");
    expect(dto.conteudo.amostra).toEqual({ total: 3, aoVivo: 1, acervo: 2 });
    expect(dto.conteudo.honestidade.ementaOracle).toBe(false);
    expect(dto.conteudo.honestidade.oraculo).toBe(false);
    expect(dto.conteudo.faixaDeRisco).toBe("indisponivel");
    expect(corpo).not.toContain("Maria Souza");
    expect(corpo).not.toContain("390.533.447-05");
    expect(corpo).not.toContain("petição inicial");
    expect(new DlpService().detectar(dto)).toEqual([]);
  });

  it("conhecimento DataJud sai sem ementa", () => {
    const fixture = fixtureDeHit(hitDeSource(SOURCE_COM_PII, "tjpr")!, 0);
    const dto = declassify.conhecimento(
      rotular([fixture], "publico", "datajud:metadados"),
      ["Alienação Fiduciária"]
    );

    expect(dto.conteudo.itens[0].fonte).toBe("datajud");
    expect(dto.conteudo.itens[0].citavel).toBe(false);
    expect(dto.conteudo.itens[0].ementa).toBeNull();
  });

  it("RBAC libera tools DataJud no papel certo e nega o resto", () => {
    const politica = new PolicyService();
    const advogado = {
      id: "u-002",
      nome: "Dr. Rafael Nunes",
      papel: "advogado" as const,
      escritorio: "prado-advogados",
    };

    expect(politica.avaliar(advogado, "abrir_datajud").decisao).toBe("permitido");
    expect(politica.avaliar(advogado, "buscar_datajud").decisao).toBe("permitido");
    expect(politica.avaliar(advogado, "comparar_datajud").decisao).toBe("permitido");
    expect(politica.avaliar(null, "abrir_datajud").decisao).toBe("negado");
    expect(
      politica.avaliar({ ...advogado, papel: "estagiario" }, "abrir_datajud").decisao
    ).toBe("negado");
    expect(
      politica.avaliar({ ...advogado, papel: "gestor" }, "buscar_datajud").decisao
    ).toBe("negado");
  });
});
