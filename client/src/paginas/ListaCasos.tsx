import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  abrirProcessoDataJud,
  buscarDataJud,
  DataJudHit,
  listarCasos,
} from "../api";
import { CartaoCaso } from "../componentes/CartaoCaso";
import { Carregando } from "../componentes/Carregando";
import { IconeBusca } from "../componentes/Icones";
import { Caso, ROTULO_STATUS, STATUS_PROCESSO, StatusProcesso } from "../tipos";

type Props = {
  onAbrir: (id: string) => void;
};

export function ListaCasos({ onAbrir }: Props) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusProcesso | "todos">("todos");
  const [casos, setCasos] = useState<Caso[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [cnj, setCnj] = useState("");
  const [tribunal, setTribunal] = useState("tjpr");
  const [termoDataJud, setTermoDataJud] = useState("");
  const [hits, setHits] = useState<DataJudHit[]>([]);
  const [erroDataJud, setErroDataJud] = useState<string | null>(null);
  const [carregandoDataJud, setCarregandoDataJud] = useState<"abrir" | "buscar" | null>(
    null
  );

  useEffect(() => {
    let cancelado = false;

    listarCasos()
      .then((lista) => {
        if (!cancelado) {
          setCasos(lista);
          setErro(null);
        }
      })
      .catch((falha: unknown) => {
        if (!cancelado) {
          setCasos([]);
          setErro(falha instanceof Error ? falha.message : "Acervo indisponível.");
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCarregando(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return casos.filter((caso) => {
      const texto = [
        caso.titulo,
        caso.tema,
        caso.resumo,
        caso.tese,
        caso.cliente,
        caso.subtema,
        caso.processNumber,
        caso.status,
        ROTULO_STATUS[caso.status],
      ]
        .join(" ")
        .toLowerCase();

      const bateBusca = termo.length === 0 || texto.includes(termo);
      const bateStatus = status === "todos" || caso.status === status;
      return bateBusca && bateStatus;
    });
  }, [busca, casos, status]);

  async function abrirCnj(evento: FormEvent) {
    evento.preventDefault();
    setErroDataJud(null);
    setCarregandoDataJud("abrir");
    try {
      const caso = await abrirProcessoDataJud(cnj, tribunal.trim() || "tjpr");
      onAbrir(caso.id);
    } catch (falha: unknown) {
      setErroDataJud(
        falha instanceof Error ? falha.message : "DataJud indisponível."
      );
    } finally {
      setCarregandoDataJud(null);
    }
  }

  async function buscarAoVivo(evento: FormEvent) {
    evento.preventDefault();
    setErroDataJud(null);
    setHits([]);
    setCarregandoDataJud("buscar");
    try {
      const resultado = await buscarDataJud({
        query: termoDataJud,
        assunto: termoDataJud,
        tribunal: tribunal.trim() || "tjpr",
      });
      setHits(resultado.hits);
      if (!resultado.hits.length) {
        setErroDataJud(
          `Nenhum metadado ao vivo no ${resultado.tribunal.toUpperCase()} para esse recorte. Nada foi inventado.`
        );
      }
    } catch (falha: unknown) {
      setHits([]);
      setErroDataJud(
        falha instanceof Error ? falha.message : "DataJud indisponível."
      );
    } finally {
      setCarregandoDataJud(null);
    }
  }

  async function abrirHit(hit: DataJudHit) {
    setErroDataJud(null);
    setCarregandoDataJud("abrir");
    try {
      const caso = await abrirProcessoDataJud(
        hit.numeroProcesso,
        hit.tribunalAlias || tribunal
      );
      onAbrir(caso.id);
    } catch (falha: unknown) {
      setErroDataJud(
        falha instanceof Error ? falha.message : "DataJud indisponível."
      );
    } finally {
      setCarregandoDataJud(null);
    }
  }

  return (
    <section className="lista-casos">
      <div className="lista-intro">
        <p className="olho">Workspace do escritório · Direito bancário</p>
        <h2>Os casos, sem ruído.</h2>
        <p>
          Busque pelo tema. Filtre pelo andamento. Entre só no que importa.
        </p>
      </div>

      <section className="datajud-painel" aria-label="DataJud ao vivo">
        <div className="datajud-cabeca">
          <p className="olho">Fonte oficial CNJ</p>
          <div className="selos">
            <span className="selo fonte-datajud">Ao vivo</span>
            <span className="selo neutro">{tribunal.toUpperCase()}</span>
          </div>
        </div>
        <h3>Metadados DataJud ao vivo</h3>
        <p>
          Consulta a API pública do CNJ. Devolve classe, assuntos e movimentos —
          não ementa completa nem jurimetria oráculo.
        </p>

        <form className="datajud-formas" onSubmit={abrirCnj}>
          <label className="busca">
            <IconeBusca />
            <input
              value={cnj}
              onChange={(evento) => setCnj(evento.target.value)}
              placeholder="Número CNJ, ex. 0000106-56.2014.8.16.0193"
            />
          </label>
          <label className="filtro">
            Tribunal
            <input
              value={tribunal}
              onChange={(evento) => setTribunal(evento.target.value)}
              placeholder="tjpr"
            />
          </label>
          <button
            className="botao-datajud"
            type="submit"
            disabled={carregandoDataJud !== null || !cnj.trim()}
          >
            {carregandoDataJud === "abrir" ? "Consultando…" : "Abrir processo (DataJud)"}
          </button>
        </form>

        <form className="datajud-formas" onSubmit={buscarAoVivo}>
          <label className="busca">
            <IconeBusca />
            <input
              value={termoDataJud}
              onChange={(evento) => setTermoDataJud(evento.target.value)}
              placeholder="Assunto, classe ou texto, ex. Alienação Fiduciária"
            />
          </label>
          <button
            className="botao-datajud secundario"
            type="submit"
            disabled={carregandoDataJud !== null || !termoDataJud.trim()}
          >
            {carregandoDataJud === "buscar" ? "Buscando…" : "Buscar no DataJud"}
          </button>
        </form>

        {erroDataJud ? (
          <div className="vazio datajud-erro">
            <p>{erroDataJud}</p>
            <p>Confira DATAJUD_API_KEY, o alias do tribunal e a rede. Nada foi inventado.</p>
          </div>
        ) : null}

        {carregandoDataJud === "buscar" ? (
          <Carregando texto="Buscando metadados DataJud ao vivo." />
        ) : null}

        {hits.length > 0 ? (
          <ul className="lista-datajud">
            {hits.map((hit) => (
              <li key={`${hit.tribunalAlias}-${hit.numeroProcesso}`}>
                <button type="button" onClick={() => abrirHit(hit)}>
                  <div className="selos">
                    <span className="selo fonte-datajud">Ao vivo</span>
                    <span className="selo neutro">{hit.tribunal}</span>
                  </div>
                  <strong>{hit.numeroProcesso || "Sem número"}</strong>
                  <p>
                    {hit.classe || "Classe não informada"} · {hit.orgaoJulgador || hit.tribunal}
                  </p>
                  <p>
                    {hit.assuntos.length
                      ? hit.assuntos.join(", ")
                      : "Assuntos DataJud não informados"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="filtros">
        <label className="busca">
          <IconeBusca />
          <input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por tema, cliente, tese ou número"
          />
        </label>

        <label className="filtro">
          Andamento
          <select
            value={status}
            onChange={(evento) =>
              setStatus(evento.target.value as StatusProcesso | "todos")
            }
          >
            <option value="todos">Todos</option>
            {STATUS_PROCESSO.map((item) => (
              <option key={item} value={item}>
                {ROTULO_STATUS[item]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="contagem">
        {carregando
          ? "Lendo o acervo…"
          : `${filtrados.length} ${filtrados.length === 1 ? "caso" : "casos"}`}
      </p>

      {erro ? (
        <div className="vazio">
          <p>{erro}</p>
          <p>Suba o Nest com DB_* apontando para o TiDB.</p>
        </div>
      ) : carregando ? (
        <Carregando texto="Carregando casos do acervo interno." />
      ) : filtrados.length === 0 ? (
        <div className="vazio">
          <p>Nada com esse recorte.</p>
          <p>Tente outro tema ou limpe o filtro.</p>
        </div>
      ) : (
        <div className="grade-casos">
          {filtrados.map((caso) => (
            <CartaoCaso key={caso.id} caso={caso} onAbrir={onAbrir} />
          ))}
        </div>
      )}
    </section>
  );
}
