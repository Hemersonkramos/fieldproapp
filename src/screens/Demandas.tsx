import { useMemo, useState } from "react";
import type { Demanda } from "../App";
import BottomNav from "../components/BottomNav";

type Props = {
  demandas: Demanda[];
  abrir: (demanda: Demanda) => void;
  verNoMapa: (demanda: Demanda) => void;
  voltar: () => void;
  setTela: (tela: "inicio" | "demandas" | "mapa" | "sincronizacao") => void;
};

export default function Demandas({ demandas, abrir, verNoMapa, setTela }: Props) {
  const [busca, setBusca] = useState("");

  const demandasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const demandasVisiveis = demandas.filter(
      (demanda) => demanda.status !== "Finalizada"
    );

    const demandasBase = termo
      ? demandasVisiveis.filter((demanda) => {
          return (
            demanda.solicitacao.toLowerCase().includes(termo) ||
            demanda.nome.toLowerCase().includes(termo) ||
            demanda.municipio.toLowerCase().includes(termo)
          );
        })
      : demandasVisiveis;

    function prazoNormalizado(prazo: string) {
      const dataPrazo = new Date(prazo);
      return new Date(
        dataPrazo.getFullYear(),
        dataPrazo.getMonth(),
        dataPrazo.getDate()
      );
    }

    function hojeNormalizado() {
      const hoje = new Date();
      return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    }

    function prioridadeOrdenacao(demanda: Demanda) {
      const prazo = prazoNormalizado(demanda.prazo);
      const hoje = hojeNormalizado();
      const foraDoPrazo = prazo.getTime() < hoje.getTime();

      if (demanda.prioridade === "Emergencial" && foraDoPrazo) {
        return 0;
      }

      if (foraDoPrazo) {
        return 1;
      }

      return 2;
    }

    return [...demandasBase].sort((a, b) => {
      const prioridadeA = prioridadeOrdenacao(a);
      const prioridadeB = prioridadeOrdenacao(b);

      if (prioridadeA !== prioridadeB) {
        return prioridadeA - prioridadeB;
      }

      const prazoA = prazoNormalizado(a.prazo).getTime();
      const prazoB = prazoNormalizado(b.prazo).getTime();

      if (prazoA !== prazoB) {
        return prazoA - prazoB;
      }

      return a.id - b.id;
    });
  }, [busca, demandas]);

  function corStatus(status: Demanda["status"]) {
    if (status === "Andamento") {
      return {
        background: "#dbeafe",
        color: "#1d4ed8",
        border: "1px solid #bfdbfe",
      };
    }

    if (status === "Devolvida") {
      return {
        background: "#fef3c7",
        color: "#b45309",
        border: "1px solid #fde68a",
      };
    }

    if (status === "Concluida") {
      return {
        background: "#dcfce7",
        color: "#15803d",
        border: "1px solid #bbf7d0",
      };
    }

    return {
      background: "#f1f5f9",
      color: "#475569",
      border: "1px solid #cbd5e1",
    };
  }

  function corPrioridade(prioridade: Demanda["prioridade"]) {
    if (prioridade === "Emergencial") {
      return {
        background: "#fee2e2",
        color: "#dc2626",
        border: "1px solid #fecaca",
      };
    }

    return {
      background: "#f1f5f9",
      color: "#475569",
      border: "1px solid #cbd5e1",
    };
  }

  function formatarPrazo(prazo: string) {
    const dataPrazo = new Date(prazo);
    const hoje = new Date();

    const hojeZerado = new Date(
      hoje.getFullYear(),
      hoje.getMonth(),
      hoje.getDate()
    );
    const prazoZerado = new Date(
      dataPrazo.getFullYear(),
      dataPrazo.getMonth(),
      dataPrazo.getDate()
    );

    const diffMs = prazoZerado.getTime() - hojeZerado.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias === 0) return "Hoje";
    if (diffDias === 1) return "Amanhã";

    return dataPrazo.toLocaleDateString("pt-BR");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      {/* HEADER */}
      <div
        style={{
          background: "linear-gradient(90deg, #021B33, #0A3A63, #0B5C7A)",
          color: "white",
          padding: "20px 20px 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 800,
            color: "#ffffff",
          }}
        >
          Minhas demandas
        </h1>

        <p
          style={{
            marginTop: 6,
            marginBottom: 0,
            color: "rgba(255,255,255,0.85)",
            fontSize: 14,
          }}
        >
          Apenas solicitações da equipe
        </p>
      </div>

      {/* CONTEÚDO */}
      <div style={{ padding: 16 }}>
        {/* BUSCA */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <input
            placeholder="Buscar solicitação"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 16,
              border: "1px solid #cbd5e1",
              padding: "0 14px",
              background: "white",
              outline: "none",
            }}
          />

          <button
            style={{
              width: 48,
              height: 44,
              borderRadius: 16,
              border: "1px solid #cbd5e1",
              background: "white",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            🔍
          </button>
        </div>

        {/* LISTA */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {demandasFiltradas.length === 0 ? (
            <div
              style={{
                background: "white",
                borderRadius: 22,
                padding: 20,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                color: "#64748b",
                textAlign: "center",
              }}
            >
              Nenhuma demanda encontrada.
            </div>
          ) : (
            demandasFiltradas.map((demanda) => (
              <div
                key={demanda.id}
                style={{
                  background: "white",
                  borderRadius: 24,
                  padding: 16,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 800,
                      color: "#0f172a",
                      fontSize: 15,
                    }}
                  >
                    {demanda.solicitacao}
                  </span>

                  <span
                    style={{
                      ...corPrioridade(demanda.prioridade),
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {demanda.prioridade}
                  </span>

                  <span
                    style={{
                      ...corStatus(demanda.status),
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {demanda.status}
                  </span>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#0f172a",
                      marginBottom: 4,
                    }}
                  >
                    {demanda.nome}
                  </div>

                  <div
                    style={{
                      fontSize: 14,
                      color: "#64748b",
                    }}
                  >
                    {demanda.municipio} • Prazo: {formatarPrazo(demanda.prazo)}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                  }}
                >
                  <button
                    onClick={() => verNoMapa(demanda)}
                    style={{
                      flex: 1,
                      height: 42,
                      borderRadius: 16,
                      border: "1px solid #cbd5e1",
                      background: "white",
                      color: "#0f172a",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Ver mapa
                  </button>

                  <button
                    onClick={() => abrir(demanda)}
                    style={{
                      flex: 1,
                      height: 42,
                      borderRadius: 16,
                      border: "none",
                      background: "#0A3A63",
                      color: "white",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Atender
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      <BottomNav telaAtual="demandas" setTela={setTela} />
    </div>
  );
}
