import { useEffect, useState } from "react";
import { contarLevantamentosPendentes } from "../lib/offlineStorage";

type Tela = "inicio" | "demandas" | "mapa" | "sincronizacao";

type Props = {
  telaAtual: Tela;
  setTela: (tela: Tela) => void;
};

const ABAS: Array<{ tela: Tela; icone: string; rotulo: string }> = [
  { tela: "inicio", icone: "🏠", rotulo: "Início" },
  { tela: "demandas", icone: "📄", rotulo: "Demandas" },
  { tela: "mapa", icone: "🗺️", rotulo: "Mapa" },
  { tela: "sincronizacao", icone: "⬆️", rotulo: "Sync" },
];

function contarPendentes() {
  try {
    return contarLevantamentosPendentes();
  } catch {
    return 0;
  }
}

export default function BottomNav({ telaAtual, setTela }: Props) {
  // Selo na aba Sync com os levantamentos que ainda nao subiram.
  const [pendentes, setPendentes] = useState(contarPendentes);

  useEffect(() => {
    const atualizar = () => setPendentes(contarPendentes());
    window.addEventListener("focus", atualizar);
    window.addEventListener("storage", atualizar);
    const intervalo = window.setInterval(atualizar, 15000);
    return () => {
      window.removeEventListener("focus", atualizar);
      window.removeEventListener("storage", atualizar);
      window.clearInterval(intervalo);
    };
  }, []);

  return (
    <nav
      className="fp-bottom-nav"
      aria-label="Navegação principal"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        borderTop: "1px solid #e2e8f0",
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(8px)",
        padding: "8px 8px calc(8px + env(safe-area-inset-bottom, 0px))",
        position: "sticky",
        bottom: 0,
        zIndex: 20,
        boxShadow: "0 -6px 18px rgba(15, 23, 42, 0.06)",
      }}
    >
      {ABAS.map((aba) => {
        const ativa = telaAtual === aba.tela;

        return (
          <button
            key={aba.tela}
            type="button"
            className={ativa ? "is-active" : undefined}
            aria-current={ativa ? "page" : undefined}
            onClick={() => {
              if (!ativa) setTela(aba.tela);
            }}
            style={{
              border: "none",
              background: ativa ? "#eef4fa" : "transparent",
              borderRadius: 18,
              padding: "10px 4px 8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              cursor: "pointer",
              color: ativa ? "#0A3A63" : "#64748b",
              fontWeight: ativa ? 800 : 600,
            }}
          >
            <span className="fp-nav-icone" aria-hidden="true">{aba.icone}</span>
            {aba.rotulo}
            {aba.tela === "sincronizacao" && pendentes > 0 && (
              <span className="fp-badge" aria-label={`${pendentes} pendente(s)`}>
                {pendentes}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
