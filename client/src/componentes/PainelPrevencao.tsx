import { FormEvent, useEffect, useState } from "react";
import { analisarPrevencao, listarAba, listarPrevencao } from "../api";
import {
  Documento,
  POSICOES_CLIENTE,
  PosicaoCliente,
  ROTULO_ALINHAMENTO,
  ROTULO_POSICAO_CLIENTE,
  RelatorioPrevencao,
} from "../tipos";
import { Carregando } from "./Carregando";
import { SeloFonte } from "./SelosPolitica";

type Props = {
  casoId: string;
  processNumber: string;
};

export function PainelPrevencao({ casoId, processNumber }: Props) {
  const [contratos, setContratos] = useState<Documento[] | null>(null);
  const [relatorios, setRelatorios] = useState<RelatorioPrevencao[]>([]);
  const [contratoId, setContratoId] = useState("");
  const [posicaoCliente, setPosicaoCliente] =
    useState<PosicaoCliente>("consumidor");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    Promise.all([
      listarAba("contratos", { casoId, processNumber }),
      listarPrevencao(casoId).catch(() => [] as RelatorioPrevencao[]),
    ])
      .then(([lista, existentes]) => {
        if (cancelado) {
          return;
        }
        setContratos(lista);
        setRelatorios(existentes);
        setContratoId((atual) => atual || lista[0]?.id || "");
      })
      .catch((falha: unknown) => {
        if (!cancelado) {
          setContratos([]);
          setErro(falha instanceof Error ? falha.message : "Acervo indisponível.");
        }
      });

    return () => {
      cancelado = true;
    };
  }, [casoId, processNumber]);

  async function analisar(evento: FormEvent) {
    evento.preventDefault();
    if (!contratoId) {
      setErro("Escolha um contrato do caso.");
      return;
    }

    setEnviando(true);
    setErro(null);

    try {
      const relatorio = await analisarPrevencao(contratoId, posicaoCliente, casoId);
      setRelatorios((atuais) => [relatorio, ...atuais.filter((item) => item.id !== relatorio.id)]);
    } catch (falha: unknown) {
      setErro(falha instanceof Error ? falha.message : "Falha ao analisar o contrato.");
    } finally {
      setEnviando(false);
    }
  }

  if (!contratos) {
    return <Carregando texto="Lendo os contratos do caso." />;
  }

  const atual = relatorios[0];

  return (
    <section className="painel">
      <header className="painel-cabeca">
        <h3>Prevenção</h3>
        <p>Cruzamento do contrato com a amostra fixture de câmaras — o mesmo motor do dissídio.</p>
      </header>

      <p className="aviso-honestidade" role="status">
        Leitura fixture/heurística. Não é jurimetria ao vivo nem oráculo de resultado.
      </p>

      {contratos.length === 0 ? (
        <div className="vazio">
          <p>Nenhum contrato neste caso para analisar.</p>
        </div>
      ) : (
        <form className="form-prevencao" onSubmit={analisar}>
          <label className="filtro">
            Contrato
            <select
              value={contratoId}
              onChange={(evento) => setContratoId(evento.target.value)}
            >
              {contratos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.titulo}
                </option>
              ))}
            </select>
          </label>
          <label className="filtro">
            Posição do cliente
            <select
              value={posicaoCliente}
              onChange={(evento) =>
                setPosicaoCliente(evento.target.value as PosicaoCliente)
              }
            >
              {POSICOES_CLIENTE.map((posicao) => (
                <option key={posicao} value={posicao}>
                  {ROTULO_POSICAO_CLIENTE[posicao]}
                </option>
              ))}
            </select>
          </label>
          <button className="botao-enviar" type="submit" disabled={enviando}>
            {enviando ? "Analisando…" : "Analisar contrato"}
          </button>
        </form>
      )}

      {erro ? <p className="aviso-tema">{erro}</p> : null}

      {atual ? <RelatorioPainel relatorio={atual} /> : null}

      {relatorios.length > 1 ? (
        <p className="contagem">
          {relatorios.length} análises neste caso nesta sessão.
        </p>
      ) : null}
    </section>
  );
}

function RelatorioPainel({ relatorio }: { relatorio: RelatorioPrevencao }) {
  return (
    <div className="prevencao-relatorio">
      <article className="cartao-suave">
        <div className="selos">
          <span className="selo fonte-inferencia">fixture/heurística</span>
          <SeloFonte fonte={relatorio.chanceReport.fonte} />
          <span className="selo neutro">
            {ROTULO_POSICAO_CLIENTE[relatorio.posicaoCliente]}
          </span>
        </div>
        <p className="olho">Amostra</p>
        <p>
          {relatorio.amostra.total} precedentes · fonte {relatorio.amostra.fonte}
        </p>
        <p>{relatorio.honestidade.aviso}</p>
      </article>

      <article className="cartao-suave">
        <p className="olho">Chance / blindagem</p>
        <p>{relatorio.chanceReport.label}</p>
        <p>{relatorio.chanceReport.rationale}</p>
        <ul className="lista-limpa">
          {relatorio.chanceReport.blindagem.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>

      <article className="cartao-suave">
        <p className="olho">Medidas pré-processuais</p>
        <ul className="lista-limpa">
          {relatorio.medidasPreProcessuais.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>

      <article className="cartao-suave">
        <p className="olho">Dissídio de câmaras</p>
        <p>{relatorio.dissidioReport.narrative}</p>
      </article>

      <div className="dissidios">
        {relatorio.dissidioReport.conflicts.map((item) => (
          <article key={`${item.court}-${item.chamber}`} className="cartao-suave">
            <div className="selos">
              <span className={`selo alinhamento-${item.vsProcessChamber}`}>
                {ROTULO_ALINHAMENTO[item.vsProcessChamber]}
              </span>
            </div>
            <strong>
              {item.court} · {item.chamber}
            </strong>
            <p>{item.orientationLabel}</p>
            <p>{item.note}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
