import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import type { Equipe } from "../App";
import { API_BASE_URL } from "../lib/api";

type Props = {
  selecionar: (equipe: Equipe) => void;
  voltar: () => void;
};

export default function SelecionarEquipe({ selecionar, voltar }: Props) {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [busca, setBusca] = useState("");
  const [isCompact, setIsCompact] = useState(() => window.innerWidth <= 520);

  useEffect(() => {
    function atualizarViewport() {
      setIsCompact(window.innerWidth <= 520);
    }

    window.addEventListener("resize", atualizarViewport);

    return () => {
      window.removeEventListener("resize", atualizarViewport);
    };
  }, []);

  useEffect(() => {
    let ativo = true;

    async function carregarEquipes() {
      try {
        const res = await fetch(`${API_BASE_URL}/equipes`);
        const data: Equipe[] = await res.json();

        if (ativo) {
          setEquipes(data);
        }
      } catch (error) {
        console.error(error);
      }
    }

    void carregarEquipes();

    return () => {
      ativo = false;
    };
  }, []);

  const filtradas = equipes.filter((e) =>
    e.numero_equipe.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div
      style={{
        background: "#f1f5f9",
        minHeight: "100vh",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          background:
            "linear-gradient(90deg, #021B33 0%, #0A3A63 50%, #0B5C7A 100%)",
          color: "#ffffff",
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
          <button
            type="button"
            onClick={voltar}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "none",
              background: "rgba(255,255,255,0.12)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
              <span style={{ fontSize: 22 }}>←</span>
            </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              borderRadius: 999,
              background: "rgba(255,255,255,0.12)",
              padding: "6px 12px",
              fontSize: 12,
            }}
          >
            <Smartphone size={14} />
            APP Campo
          </div>
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 800,
            color: "#ffffff",
          }}
        >
          Selecionar equipe
        </h1>

        <p
          style={{
            marginTop: 6,
            marginBottom: 0,
            color: "rgba(255,255,255,0.85)",
            fontSize: 14,
          }}
        >
          Escolha a equipe antes do login
        </p>
      </div>

      {/* BUSCA */}
      <div style={{ padding: 16 }}>
        <input
          placeholder="Buscar equipe"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{
            width: "100%",
            height: 45,
            borderRadius: 12,
            border: "1px solid #cbd5e1",
            padding: "0 12px",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* LISTA */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr",
          gap: 12,
          padding: 16,
        }}
      >
        {filtradas.map((equipe) => (
          <div
            key={equipe.id_equipe}
            onClick={() => selecionar(equipe)}
            style={{
              background: "white",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              cursor: "pointer",
            }}
          >
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Equipe</p>

            <h2 style={{ margin: "4px 0", color: "#0f172a" }}>
              {equipe.numero_equipe}
            </h2>

            <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              Toque para continuar
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
