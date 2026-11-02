import { useEffect, useState } from "react";
import { ChevronLeft, Smartphone } from "lucide-react";
import type { Equipe } from "../App";
import { API_BASE_URL } from "../lib/api";
import { mensagemDeErro } from "../lib/feedback";

type Props = {
  selecionar: (equipe: Equipe) => void;
  voltar: () => void;
  equipesDemonstracao?: Equipe[];
};

export default function SelecionarEquipe({
  selecionar,
  voltar,
  equipesDemonstracao,
}: Props) {
  const [equipes, setEquipes] = useState<Equipe[]>(equipesDemonstracao ?? []);
  const [busca, setBusca] = useState("");
  const [isCompact, setIsCompact] = useState(() => window.innerWidth <= 520);
  const [status, setStatus] = useState<"carregando" | "lento" | "erro" | "ok">(
    equipesDemonstracao ? "ok" : "carregando"
  );
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (equipesDemonstracao) {
      return;
    }

    function atualizarViewport() {
      setIsCompact(window.innerWidth <= 520);
    }

    window.addEventListener("resize", atualizarViewport);

    return () => {
      window.removeEventListener("resize", atualizarViewport);
    };
  }, [equipesDemonstracao]);

  useEffect(() => {
    if (equipesDemonstracao) {
      return;
    }

    let ativo = true;
    const controlador = new AbortController();
    // O servidor gratuito pode levar alguns segundos para "acordar": avisa a equipe.
    const avisoLento = window.setTimeout(() => {
      if (ativo) setStatus((atual) => (atual === "carregando" ? "lento" : atual));
    }, 5000);
    const limite = window.setTimeout(() => controlador.abort(), 45000);

    async function carregarEquipes() {
      try {
        const res = await fetch(`${API_BASE_URL}/equipes`, { signal: controlador.signal });
        const data = await res.json().catch(() => null);

        if (!res.ok || !Array.isArray(data)) {
          throw new Error(
            data && typeof data.erro === "string" ? data.erro : "Não foi possível carregar as equipes."
          );
        }

        if (ativo) {
          setEquipes(data as Equipe[]);
          setStatus("ok");
        }
      } catch (error) {
        // Tela desmontada (ou remontada pelo modo de desenvolvimento): pedido cancelado de proposito.
        if (!ativo) return;
        console.error(error);
        if (ativo) {
          setErro(
            !navigator.onLine
              ? "Sem internet. Conecte-se para carregar as equipes."
              : mensagemDeErro(error, "Não foi possível carregar as equipes.")
          );
          setStatus("erro");
        }
      } finally {
        window.clearTimeout(avisoLento);
        window.clearTimeout(limite);
      }
    }

    void carregarEquipes();

    return () => {
      ativo = false;
      controlador.abort();
      window.clearTimeout(avisoLento);
      window.clearTimeout(limite);
    };
  }, [equipesDemonstracao, tentativa]);

  function tentarNovamente() {
    setErro("");
    setStatus("carregando");
    setTentativa((atual) => atual + 1);
  }

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
            aria-label="Voltar"
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.09)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 8px 20px rgba(2, 27, 51, 0.2)",
              backdropFilter: "blur(8px)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <ChevronLeft size={24} strokeWidth={2.25} />
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
      {(status === "carregando" || status === "lento") && (
        <div style={{ padding: "0 16px 16px" }} role="status" aria-live="polite">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr",
              gap: 12,
            }}
          >
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="fp-esqueleto" style={{ height: 92, borderRadius: 16 }} />
            ))}
          </div>
          <p style={{ marginTop: 14, color: "#475569", fontSize: 14 }}>
            <span className="fp-spinner" aria-hidden="true" />
            {status === "lento"
              ? "Conectando ao servidor… isso pode levar alguns segundos na primeira abertura."
              : "Carregando equipes…"}
          </p>
        </div>
      )}

      {status === "erro" && (
        <div style={{ padding: "0 16px 16px" }}>
          <div
            role="alert"
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              borderRadius: 16,
              padding: 16,
              textAlign: "left",
            }}
          >
            <strong style={{ display: "block", marginBottom: 4 }}>Não deu para carregar as equipes</strong>
            <span style={{ fontSize: 14 }}>{erro}</span>
            <button
              type="button"
              onClick={tentarNovamente}
              style={{
                display: "block",
                marginTop: 12,
                height: 42,
                padding: "0 16px",
                borderRadius: 12,
                border: "none",
                background: "#0A3A63",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {status === "ok" && filtradas.length === 0 && (
        <p style={{ padding: "0 16px", color: "#64748b", fontSize: 14 }}>
          {equipes.length === 0
            ? "Nenhuma equipe cadastrada. Fale com o escritório."
            : `Nenhuma equipe encontrada para "${busca}".`}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr",
          gap: 12,
          padding: 16,
        }}
      >
        {status === "ok" && filtradas.map((equipe, indice) => (
          <button
            type="button"
            key={equipe.id_equipe}
            className="fp-cartao-toque"
            onClick={() => selecionar(equipe)}
            style={{
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              cursor: "pointer",
              textAlign: "left",
              animationDelay: `${Math.min(indice, 8) * 40}ms`,
            }}
          >
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Equipe</p>

            <h2 style={{ margin: "4px 0", color: "#0f172a" }}>
              {equipe.numero_equipe}
            </h2>

            <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              Toque para continuar →
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
