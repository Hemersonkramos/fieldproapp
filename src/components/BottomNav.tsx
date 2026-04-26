type Tela = "inicio" | "demandas" | "mapa" | "sincronizacao";

type Props = {
  telaAtual: Tela;
  setTela: (tela: Tela) => void;
};

export default function BottomNav({ telaAtual, setTela }: Props) {
  const botaoBase = {
    border: "none",
    background: "transparent",
    borderRadius: 18,
    padding: "8px 4px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center" as const,
    gap: 4,
    fontSize: 11,
    cursor: "pointer",
    color: "#64748b",
  };

  const botaoAtivo = {
    background: "#f1f5f9",
    color: "#0A3A63",
    fontWeight: 700,
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        borderTop: "1px solid #e2e8f0",
        background: "white",
        padding: "8px 8px calc(8px + env(safe-area-inset-bottom, 0px))",
        position: "sticky" as const,
        bottom: 0,
        zIndex: 20,
      }}
    >
      <button
        onClick={() => setTela("inicio")}
        style={{
          ...botaoBase,
          ...(telaAtual === "inicio" ? botaoAtivo : {}),
        }}
      >
        <span>🏠</span>
        Início
      </button>

      <button
        onClick={() => setTela("demandas")}
        style={{
          ...botaoBase,
          ...(telaAtual === "demandas" ? botaoAtivo : {}),
        }}
      >
        <span>📄</span>
        Demandas
      </button>

      <button
        onClick={() => setTela("mapa")}
        style={{
          ...botaoBase,
          ...(telaAtual === "mapa" ? botaoAtivo : {}),
        }}
      >
        <span>🗺️</span>
        Mapa
      </button>

      <button
        onClick={() => setTela("sincronizacao")}
        style={{
          ...botaoBase,
          ...(telaAtual === "sincronizacao" ? botaoAtivo : {}),
        }}
      >
        <span>⬆️</span>
        Sync
      </button>
    </div>
  );
}
