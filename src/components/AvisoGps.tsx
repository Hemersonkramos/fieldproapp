import { useCallback, useEffect, useState } from "react";
import { salvarPosicaoAtual } from "../lib/offlineStorage";

type EstadoGps = "verificando" | "ok" | "desligado" | "negado" | "indisponivel";

const TEXTOS: Record<Exclude<EstadoGps, "verificando" | "ok">, { titulo: string; texto: string }> = {
  desligado: {
    titulo: "Ligue o GPS do aparelho",
    texto:
      "A localização do celular está desligada ou sem sinal. Ative o GPS (Localização) nas configurações rápidas do aparelho para coletar pontos e registrar o trajeto.",
  },
  negado: {
    titulo: "Permita a localização",
    texto:
      "O FieldPro não tem permissão para usar a localização. Toque no cadeado ao lado do endereço do navegador (ou em Configurações do app) e permita a Localização.",
  },
  indisponivel: {
    titulo: "GPS indisponível",
    texto: "Este aparelho ou navegador não oferece localização. A coleta de pontos precisará ser marcada no mapa.",
  },
};

/**
 * Ao entrar no app, confere se a localizacao esta disponivel e, se nao estiver,
 * pede para ligar o GPS. Confere de novo quando a pessoa volta para o app (por
 * exemplo, depois de ligar o GPS nas configuracoes). Nao mostra alfinete no mapa.
 */
export default function AvisoGps({ ativo }: { ativo: boolean }) {
  const [estado, setEstado] = useState<EstadoGps>("verificando");
  const [dispensado, setDispensado] = useState(false);

  const verificar = useCallback(() => {
    if (!navigator.geolocation) {
      setEstado("indisponivel");
      return;
    }

    setEstado("verificando");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Guarda como referencia (centralizar mapa / coleta manual); nao liga o rastreio.
        salvarPosicaoAtual([pos.coords.latitude, pos.coords.longitude]);
        setEstado("ok");
      },
      (erro) => {
        setEstado(erro.code === erro.PERMISSION_DENIED ? "negado" : "desligado");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  useEffect(() => {
    if (!ativo) return;
    // Primeira verificacao logo depois de entrar.
    const inicio = window.setTimeout(verificar, 600);

    const aoVoltar = () => {
      if (document.visibilityState === "visible") verificar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearTimeout(inicio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [ativo, verificar]);

  if (!ativo || dispensado || estado === "ok" || estado === "verificando") return null;

  const conteudo = TEXTOS[estado];

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="aviso-gps-titulo"
      className="fpfb-fundo"
      style={{ zIndex: 29000 }}
    >
      <div className="fpfb-dialogo" style={{ textAlign: "center" }}>
        <div
          aria-hidden="true"
          style={{
            width: 64,
            height: 64,
            margin: "0 auto 12px",
            borderRadius: 999,
            background: "#e0f2fe",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
          }}
        >
          📍
        </div>
        <h3 id="aviso-gps-titulo">{conteudo.titulo}</h3>
        <p>{conteudo.texto}</p>
        <div className="fpfb-acoes" style={{ flexDirection: "column" }}>
          {estado !== "indisponivel" && (
            <button type="button" className="fpfb-confirmar" onClick={verificar}>
              Já liguei, verificar de novo
            </button>
          )}
          <button type="button" className="fpfb-cancelar" onClick={() => setDispensado(true)}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
