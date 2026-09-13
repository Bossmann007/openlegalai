import { afterEach, describe, expect, it, vi } from "vitest";
import { aplicarPoliticaCaso } from "../src/common/security/caso-policy";
import { ementaCitavel, ementaParaCitacao } from "../src/common/security/cite-or-silent";
import { CHANCE_INDISPONIVEL } from "../src/common/security/fonte-fato";
import { Caso } from "../src/models/caso.model";
import { sigiloComparacaoDataJud } from "../src/modules/gateway/classification.service";
import { DlpService } from "../src/modules/gateway/dlp.service";
import { DeclassifyService } from "../src/modules/gateway/declassify.service";
import { PolicyService } from "../src/modules/gateway/policy.service";
import { DataJudClient } from "../src/modules/datajud/datajud.client";
import { DataJudException } from "../src/modules/datajud/datajud.errors";
import { DATAJUD_LIMITE } from "../src/modules/datajud/datajud.limites";
import {
  casoJurisDeClassificada,
  fixtureDeCasoJuris,
  fixtureDeHit,
  hitDeSource,
  mesclarAcervo,
  precedentesDeHits,
  processoDeHit,
  tribunalAlias,
} from "../src/modules/datajud/datajud.mapper";
import { ComparacaoComTaint, DataJudService } from "../src/modules/datajud/datajud.service";
import {
  arquivoCachePara,
  modoDataJud,
  normalizarTermoCache,
} from "../src/modules/datajud/datajud.cache";
import { ORIGEM_CAPTURA, ORIGEM_LIVE } from "../src/modules/datajud/datajud.types";
import { DissidioService } from "../src/modules/dissidio/dissidio.service";
import { JurisprudenceService } from "../src/modules/jurisprudence/jurisprudence.service";
import { CasosService } from "../src/modules/casos/casos.service";
import { ProcessService } from "../src/modules/process/process.service";
import { rotular } from "../src/models/classificacao.model";
import { z } from "zod";

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
    expect(hitDeSource({ ...SOURCE_COM_PII, dataAjuizamento: "20140312T100000" }, "tjpr")?.dataAjuizamento).toBe(
      "2014-03-12"
    );
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

  it("rejeita hit cujo CNJ não tem 20 dígitos", () => {
    expect(hitDeSource({ ...SOURCE_COM_PII, numeroProcesso: "123" }, "tjpr")).toBeNull();
    expect(hitDeSource({ ...SOURCE_COM_PII, numeroProcesso: "" }, "tjpr")).toBeNull();
    expect(
      hitDeSource({ ...SOURCE_COM_PII, numeroProcesso: "0000106-56.2014.8.16.019" }, "tjpr")
    ).toBeNull();
  });

  it("não substitui a capa como precedente quando a busca relacionada vem vazia", () => {
    const capa = hitDeSource(SOURCE_COM_PII, "tjpr")!;
    expect(precedentesDeHits([], capa.numeroProcesso)).toEqual([]);
    expect(precedentesDeHits([capa], capa.numeroProcesso)).toEqual([]);
  });
});

describe("DataJud client", () => {
  const envAnterior = {
    key: process.env.DATAJUD_API_KEY,
    mode: process.env.DATAJUD_MODE,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    if (envAnterior.key === undefined) {
      delete process.env.DATAJUD_API_KEY;
    } else {
      process.env.DATAJUD_API_KEY = envAnterior.key;
    }
    if (envAnterior.mode === undefined) {
      delete process.env.DATAJUD_MODE;
    } else {
      process.env.DATAJUD_MODE = envAnterior.mode;
    }
  });

  it("falha com honestidade quando DATAJUD_API_KEY falta em live", async () => {
    delete process.env.DATAJUD_API_KEY;
    process.env.DATAJUD_MODE = "live";
    const client = new DataJudClient();

    await expect(client.buscarPorCnj("0000106-56.2014.8.16.0193", "tjpr")).rejects.toBeInstanceOf(
      DataJudException
    );
    await expect(client.buscarPorCnj("0000106-56.2014.8.16.0193", "tjpr")).rejects.toThrow(
      /DATAJUD_API_KEY/
    );
  });

  it("cache devolve o CNJ da captura e nunca finge live", async () => {
    process.env.DATAJUD_MODE = "cache";
    const pesquisa = await new DataJudClient().buscarPorCnj(
      "0000887-91.2025.8.16.0161",
      "tjpr"
    );

    expect(pesquisa.origem).toEqual(ORIGEM_CAPTURA);
    expect(pesquisa.origem.fonte).toBe("datajud_captura");
    expect(pesquisa.origem.rotulo).toBe("captura oficial (replay)");
    expect(pesquisa.hits[0]?.numeroProcesso).toBe("0000887-91.2025.8.16.0161");
    expect(JSON.stringify(pesquisa.hits)).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(JSON.stringify(pesquisa.hits)).not.toMatch(/cpf/i);
  });

  it("cache da busca Alienação Fiduciária não inventa hits extras", async () => {
    process.env.DATAJUD_MODE = "cache";
    const pesquisa = await new DataJudClient().buscar({
      assunto: "Alienação Fiduciária",
      tribunal: "tjpr",
    });

    expect(pesquisa.origem.fonte).toBe("datajud_captura");
    expect(pesquisa.hits.map((hit) => hit.numeroProcesso)).toEqual([
      "0000887-91.2025.8.16.0161",
      "0000106-56.2014.8.16.0193",
    ]);
  });

  it("cache miss não inventa hit", async () => {
    process.env.DATAJUD_MODE = "cache";
    await expect(
      new DataJudClient().buscarPorCnj("0000106-56.2014.8.16.0193", "tjpr")
    ).rejects.toThrow(/Sem captura local/);
    await expect(
      new DataJudClient().buscar({ assunto: "Contratos bancários", tribunal: "tjpr" })
    ).rejects.toThrow(/Sem captura local/);
  });

  it("auto cai para captura em HTTP 429", async () => {
    process.env.DATAJUD_MODE = "auto";
    process.env.DATAJUD_API_KEY = "chave-demo";
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 429 }));

    const pesquisa = await new DataJudClient().buscarPorCnj(
      "0000887-91.2025.8.16.0161",
      "tjpr"
    );

    expect(pesquisa.origem.fonte).toBe("datajud_captura");
    expect(pesquisa.hits[0]?.numeroProcesso).toBe("0000887-91.2025.8.16.0161");
  });

  it("auto sem chave cai para captura do CNJ da demo", async () => {
    process.env.DATAJUD_MODE = "auto";
    delete process.env.DATAJUD_API_KEY;

    const pesquisa = await new DataJudClient().buscar({
      query: "Alienação Fiduciária",
      tribunal: "tjpr",
    });
    expect(pesquisa.origem.fonte).toBe("datajud_captura");
  });

  it("live não cai para captura em HTTP 429", async () => {
    process.env.DATAJUD_MODE = "live";
    process.env.DATAJUD_API_KEY = "chave-demo";
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 429 }));

    await expect(
      new DataJudClient().buscarPorCnj("0000887-91.2025.8.16.0161", "tjpr")
    ).rejects.toThrow(/HTTP 429/);
  });

  it("auto sem arquivo de captura relança o 429", async () => {
    process.env.DATAJUD_MODE = "auto";
    process.env.DATAJUD_API_KEY = "chave-demo";
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 429 }));

    await expect(
      new DataJudClient().buscarPorCnj("0000106-56.2014.8.16.0193", "tjpr")
    ).rejects.toThrow(/HTTP 429/);
  });
});

describe("DataJud cache keys", () => {
  it("só mapeia o CNJ e a busca da demo", () => {
    expect(modoDataJud(undefined)).toBe("auto");
    expect(modoDataJud("CACHE")).toBe("cache");
    expect(normalizarTermoCache("Alienação Fiduciária")).toBe("alienacao fiduciaria");
    expect(
      arquivoCachePara({ kind: "cnj", alias: "tjpr", digitos: "00008879120258160161" })
    ).toBe("tjpr-00008879120258160161.json");
    expect(
      arquivoCachePara({ kind: "busca", alias: "tjpr", termo: "Alienação Fiduciária" })
    ).toBe("tjpr-busca-alienacao.json");
    expect(
      arquivoCachePara({ kind: "cnj", alias: "tjpr", digitos: "00001065620148160193" })
    ).toBeNull();
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

  it("mescla jurisprudências do acervo e preserva fonte/citavel", () => {
    const acervoTjpr = {
      id: "juris-tjpr-acervo",
      processNumber: "0001234-56.2020.8.16.0001",
      acordao: "0001234-56.2020.8.16.0001",
      court: "TJPR",
      chamber: "12ª Câmara Cível",
      reporter: "Des. Exemplo",
      date: "2020-05-10",
      status: "ATIVO" as const,
      alignment: "unknown" as const,
      ementa: "Ementa oficial do acórdão publicado pelo TJPR sobre alienação fiduciária.",
      pontos: ["Alienação Fiduciária"],
      essencial: { resumo: "Ementa oficial", itens: ["Alienação Fiduciária"] },
      fortalecer: { resumo: "", itens: [] },
      blindar: { resumo: "", itens: [] },
      contrapor: { resumo: "", itens: [] },
      citavel: true,
      fonte: "tjpr" as const,
    };
    const fixture = fixtureDeCasoJuris(acervoTjpr);
    expect(fixture.fonte).toBe("tjpr");
    expect(fixture.citavel).toBe(true);
    expect(ementaCitavel(fixture)).toBe(true);

    const mesclado = mesclarAcervo(
      [acervoTjpr],
      new JurisprudenceService().buscarRelacionadas(["Contratos bancários"])
    );
    const doAcervo = mesclado.find((item) => item.id === "juris-tjpr-acervo");
    expect(doAcervo?.fonte).toBe("tjpr");
    expect(doAcervo?.citavel).toBe(true);
    expect(mesclado.length).toBeGreaterThan(1);

    const mapped = casoJurisDeClassificada({
      ...fixture,
      alignment: "unknown",
      citeStatus: "ok",
    });
    expect(mapped.fonte).toBe("tjpr");
    expect(mapped.citavel).toBe(true);
    expect(mapped.ementa).toContain("Ementa oficial");
  });

  it("falha da busca relacionada devolve set ao vivo vazio — zero hits falsos", async () => {
    const hit = hitDeSource(SOURCE_COM_PII, "tjpr")!;
    const servico = new DataJudService(
      {
        alias: () => "tjpr",
        buscarPorCnj: async () => ({ hits: [hit], origem: ORIGEM_LIVE }),
        buscar: async () => {
          throw new Error("related search down");
        },
      } as unknown as DataJudClient,
      {
        obterDoAcervo: async () => undefined,
      } as unknown as CasosService,
      {
        normalizarNumero: (numero: string) => numero,
        numeroValido: () => true,
        buscarCapa: () => {
          throw new Error("no fixture");
        },
      } as unknown as ProcessService,
      new JurisprudenceService(),
      new DissidioService()
    );

    const comparacao = await servico.comparacaoPublica(hit.numeroProcesso, "tjpr");
    expect(comparacao.amostra.aoVivo).toBe(0);
    expect(comparacao.classificadas.filter((item) => item.fonte === "datajud")).toEqual([]);
    expect(
      comparacao.classificadas.some(
        (item) => item.processNumber === hit.numeroProcesso && item.fonte === "datajud"
      )
    ).toBe(false);
  });
});

describe("SafeDTO DataJud", () => {
  const declassify = new DeclassifyService(new DlpService());

  it("jurimetria mista não vaza CPF, parte nem peça e não é oráculo", () => {
    const hit = hitDeSource(SOURCE_COM_PII, "tjpr")!;
    const caso = casoMinimo();
    const comparacao: ComparacaoComTaint = {
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
      origem: ORIGEM_LIVE,
      textoSensivel: [caso.resumo, caso.cliente, caso.peticoes[0].titulo],
      entidades: ["Maria Souza"],
    };

    const { textoSensivel, entidades, ...valor } = comparacao;
    const sigilo = sigiloComparacaoDataJud(textoSensivel, entidades);
    expect(sigilo).toBe("cliente");
    expect("textoSensivel" in valor).toBe(false);
    expect("entidades" in valor).toBe(false);

    const dto = declassify.jurimetriaMista(
      rotular(valor, sigilo, "datajud:comparacao"),
      textoSensivel,
      entidades
    );
    const corpo = JSON.stringify(dto);

    expect(dto.tipo).toBe("jurimetria_mista");
    expect(dto.declassificacao.sigiloOrigem).toBe("cliente");
    expect(dto.conteudo.amostra).toEqual({ total: 3, aoVivo: 1, acervo: 2 });
    expect(dto.conteudo.honestidade.ementaOracle).toBe(false);
    expect(dto.conteudo.honestidade.oraculo).toBe(false);
    expect(dto.conteudo.faixaDeRisco).toBe("indisponivel");
    expect(corpo).not.toContain("Maria Souza");
    expect(corpo).not.toContain("390.533.447-05");
    expect(corpo).not.toContain("petição inicial");
    expect(new DlpService().detectar(dto)).toEqual([]);
  });

  it("comparação sem taint de acervo permanece pública", () => {
    expect(sigiloComparacaoDataJud([], [])).toBe("publico");
    expect(sigiloComparacaoDataJud(["peça do cliente"], [])).toBe("cliente");
  });

  it("esquemas MCP espelham os tetos HTTP de CNJ, tribunal e busca", () => {
    const cnj = z.string().min(DATAJUD_LIMITE.cnjMin).max(DATAJUD_LIMITE.cnjMax);
    const tribunal = z.string().max(DATAJUD_LIMITE.tribunal);
    const busca = z.string().max(DATAJUD_LIMITE.busca);

    expect(DATAJUD_LIMITE).toEqual({ cnjMin: 15, cnjMax: 40, tribunal: 20, busca: 200 });
    expect(cnj.safeParse("0000106-56.2014.8.16.0193").success).toBe(true);
    expect(cnj.safeParse("123").success).toBe(false);
    expect(tribunal.safeParse("x".repeat(21)).success).toBe(false);
    expect(busca.safeParse("x".repeat(201)).success).toBe(false);
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

  it("conhecimento de captura declara datajud_captura e permanece não citável", () => {
    const fixture = fixtureDeHit(hitDeSource(SOURCE_COM_PII, "tjpr")!, 0);
    const dto = declassify.conhecimento(
      rotular([fixture], "publico", "datajud_captura:metadados"),
      ["Alienação Fiduciária"]
    );

    expect(dto.conteudo.itens[0].fonte).toBe("datajud_captura");
    expect(dto.conteudo.itens[0].citavel).toBe(false);
    expect(dto.conteudo.itens[0].ementa).toBeNull();
    expect(dto.declassificacao.fontes).toContain("datajud_captura:metadados");
  });

  it("jurimetria mista de captura não se apresenta como live", () => {
    const hit = hitDeSource(SOURCE_COM_PII, "tjpr")!;
    const dto = declassify.jurimetriaMista(
      rotular(
        {
          processo: { ...processoDeHit(hit), parties: [] },
          classificadas: [],
          amostra: {
            total: 2,
            aoVivo: 1,
            acervo: 1,
            honestidade: {
              live: "datajud_captura",
              acervo: "fixture",
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
          origem: ORIGEM_CAPTURA,
        },
        "publico",
        "datajud_captura:comparacao"
      )
    );

    expect(dto.conteudo.honestidade.live).toBe("datajud_captura");
    expect(dto.conteudo.sintese).toContain("captura oficial (replay)");
    expect(dto.conteudo.sintese).not.toMatch(/metadado\(s\) DataJud ao vivo/);
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
