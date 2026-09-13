import { ReactNode, useState } from "react";
import { compararProcessoDataJud } from "../api";
import { GavetaJuris } from "../componentes/GavetaJuris";
import {
  IconeContrato,
  IconeConversa,
  IconeEscudo,
  IconeGrafico,
  IconeHistorico,
  IconeJuris,
  IconeMartelo,
  IconeModelo,
  IconePeca,
  IconePessoa,
  IconePrazo,
  IconeRelatorio,
  IconeResultado,
  IconeTese,
  IconeVisao,
  IconeVoltar,
} from "../componentes/Icones";
import { ChatCaso } from "../componentes/ChatCaso";
import {
  PainelHistorico,
  PainelJurisprudencia,
  PainelJurimetria,
  PainelResultados,
  PainelTeses,
  PainelVisao,
} from "../componentes/PaineisCaso";
import { PainelAcervo } from "../componentes/PainelAcervo";
import { PainelModelos } from "../componentes/PainelModelos";
import { PainelPrazos } from "../componentes/PainelPrazos";
import { PainelPrevencao } from "../componentes/PainelPrevencao";
import { PainelRelatorios } from "../componentes/PainelRelatorios";
import { AbaCaso, Caso, Jurisprudencia, ROTULO_STATUS } from "../tipos";

type Props = {
  caso: Caso;
  onVoltar: () => void;
  onCasoAtualizado?: (caso: Caso) => void;
};

type ItemMenu = {
  id: AbaCaso;
  rotulo: string;
  grupo: string;
  icone: ReactNode;
};

const MENU: ItemMenu[] = [
  { id: "visao", rotulo: "Visão", grupo: "Caso", icone: <IconeVisao /> },
  { id: "historico", rotulo: "Histórico", grupo: "Caso", icone: <IconeHistorico /> },
  { id: "prazos", rotulo: "Prazos", grupo: "Caso", icone: <IconePrazo /> },
  { id: "conversas", rotulo: "Conversas", grupo: "Caso", icone: <IconeConversa /> },
  { id: "peticoes", rotulo: "Petições", grupo: "Acervo", icone: <IconePeca /> },
  { id: "contratos", rotulo: "Contratos", grupo: "Acervo", icone: <IconeContrato /> },
  { id: "documentos", rotulo: "Clientes", grupo: "Acervo", icone: <IconePessoa /> },
  { id: "decisoes", rotulo: "Decisões", grupo: "Acervo", icone: <IconeMartelo /> },
  { id: "modelos", rotulo: "Modelos", grupo: "Acervo", icone: <IconeModelo /> },
  { id: "teses", rotulo: "Teses", grupo: "Estratégia", icone: <IconeTese /> },
  { id: "resultados", rotulo: "Resultados", grupo: "Estratégia", icone: <IconeResultado /> },
  { id: "jurisprudencia", rotulo: "Jurisprudência", grupo: "Estratégia", icone: <IconeJuris /> },
  { id: "jurimetria", rotulo: "Jurimetria", grupo: "Estratégia", icone: <IconeGrafico /> },
  { id: "prevencao", rotulo: "Prevenção", grupo: "Estratégia", icone: <IconeEscudo /> },
  { id: "relatorios", rotulo: "Relatórios", grupo: "Estratégia", icone: <IconeRelatorio /> },
];

export function DetalheCaso({ caso, onVoltar, onCasoAtualizado }: Props) {
  const [aba, setAba] = useState<AbaCaso>("visao");
  const [juris, setJuris] = useState<Jurisprudencia | null>(null);
  const [gerandoJurimetria, setGerandoJurimetria] = useState(false);
  const [erroJurimetria, setErroJurimetria] = useState<string | null>(null);

  const grupos = ["Caso", "Acervo", "Estratégia"];

  async function gerarJurimetria() {
    if (!caso.processNumber.trim()) {
      return;
    }
    setErroJurimetria(null);
    setGerandoJurimetria(true);
    try {
      const atualizado = await compararProcessoDataJud(
        caso.processNumber,
        caso.court || "tjpr"
      );
      onCasoAtualizado?.(atualizado);
      setAba("jurimetria");
    } catch (falha: unknown) {
      setErroJurimetria(
        falha instanceof Error ? falha.message : "Não foi possível atualizar a jurimetria."
      );
    } finally {
      setGerandoJurimetria(false);
    }
  }

  return (
    <section className="detalhe">
      <header className="detalhe-topo">
        <button className="voltar" type="button" onClick={onVoltar}>
          <IconeVoltar />
          Casos
        </button>
        <div>
          <div className="selos">
            <span className={`selo status-${caso.status}`}>
              {ROTULO_STATUS[caso.status]}
            </span>
            <span className="selo neutro">{caso.subtema}</span>
            {caso.fontes?.jurimetria === "datajud" ? (
              <span className="selo fonte-datajud">DataJud ao vivo</span>
            ) : null}
          </div>
          <h2>{caso.titulo}</h2>
          <p>
            {caso.processNumber} · {caso.chamber}
          </p>
          {caso.processNumber ? (
            <div className="detalhe-acoes">
              <button
                className="botao-datajud secundario"
                type="button"
                disabled={gerandoJurimetria}
                onClick={() => {
                  void gerarJurimetria();
                }}
              >
                {gerandoJurimetria
                  ? "Atualizando jurimetria…"
                  : "Gerar/atualizar jurimetria"}
              </button>
            </div>
          ) : null}
          {erroJurimetria ? <p className="detalhe-erro">{erroJurimetria}</p> : null}
        </div>
      </header>

      <div className="detalhe-corpo">
        <nav className="menu-caso" aria-label="OpenLegalAI do caso">
          {grupos.map((grupo) => (
            <div key={grupo} className="menu-grupo">
              <p>{grupo}</p>
              {MENU.filter((item) => item.grupo === grupo).map((item) => (
                <button
                  key={item.id}
                  className={aba === item.id ? "ativa" : undefined}
                  type="button"
                  onClick={() => {
                    setAba(item.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  {item.icone}
                  {item.rotulo}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="detalhe-conteudo">
          {aba === "visao" && (
            <PainelVisao
              caso={caso}
              onAbrirJuris={setJuris}
              onVerTodas={() => setAba("jurisprudencia")}
            />
          )}
          {aba === "peticoes" && (
            <PainelAcervo
              titulo="Petições e peças"
              texto="O que já foi protocolado neste caso."
              casoId={caso.id}
              processNumber={caso.processNumber}
              recurso="peticoes"
            />
          )}
          {aba === "contratos" && (
            <PainelAcervo
              titulo="Contratos"
              texto="Instrumentos que sustentam o pedido."
              casoId={caso.id}
              processNumber={caso.processNumber}
              recurso="contratos"
            />
          )}
          {aba === "documentos" && (
            <PainelAcervo
              titulo="Clientes do caso"
              texto="Partes ligadas a este processo no acervo."
              casoId={caso.id}
              processNumber={caso.processNumber}
              recurso="clientes"
            />
          )}
          {aba === "decisoes" && (
            <PainelAcervo
              titulo="Decisões e acórdãos"
              texto="O que o juízo já disse aqui."
              casoId={caso.id}
              processNumber={caso.processNumber}
              recurso="decisoes"
            />
          )}
          {aba === "modelos" && (
            <PainelModelos casoId={caso.id} processNumber={caso.processNumber} />
          )}
          {aba === "historico" && <PainelHistorico caso={caso} />}
          {aba === "prazos" && <PainelPrazos caso={caso} />}
          {aba === "teses" && <PainelTeses caso={caso} />}
          {aba === "resultados" && <PainelResultados caso={caso} />}
          {aba === "conversas" && <ChatCaso processoId={caso.processoId} />}
          {aba === "jurisprudencia" && (
            <PainelJurisprudencia caso={caso} onAbrir={setJuris} />
          )}
          {aba === "jurimetria" && <PainelJurimetria caso={caso} />}
          {aba === "prevencao" && (
            <PainelPrevencao
              casoId={caso.id}
              processNumber={caso.processNumber}
            />
          )}
          {aba === "relatorios" && <PainelRelatorios caso={caso} />}
        </div>
      </div>

      {juris && <GavetaJuris item={juris} onFechar={() => setJuris(null)} />}
    </section>
  );
}
