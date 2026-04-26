import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import type { Demanda } from "../App";
import {
  carregarPontosCache,
  salvarPontosCache,
  atualizarPontosCache,
  type CachedPhoto,
  type CachedPoint,
} from "../lib/offlineStorage";
import { API_BASE_URL, authFetch, authUrl } from "../lib/api";

type Foto = CachedPhoto;
type PontoColetado = CachedPoint;

type Props = {
  demanda: Demanda;
  voltar: () => void;
};

function criarIconePonto(cor: string, texto: string) {
  return L.divIcon({
    className: "custom-point-marker",
    html: `
      <div style="
        position: relative;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: ${cor};
          border: 3px solid #ffffff;
          box-shadow: 0 3px 10px rgba(0,0,0,0.28);
        "></div>
        <div style="
          position: relative;
          color: #ffffff;
          font-size: 12px;
          font-weight: 800;
          font-family: Arial, sans-serif;
        ">${texto}</div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function Fotos({ demanda, voltar }: Props) {
  const [pontos, setPontos] = useState<PontoColetado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;

    async function carregarGaleria() {
      try {
        if (ativo) {
          setCarregando(true);
          setErro("");
        }

        const resposta = await authFetch(`${API_BASE_URL}/solicitacoes/${demanda.id}/pontos`);

        const dados = await resposta.json();

        if (!resposta.ok) {
          if (ativo) {
            setErro(dados.erro || "Erro ao carregar galeria.");
          }
          return;
        }

        if (ativo) {
          setPontos(dados);
          salvarPontosCache(demanda.id, dados);
        }
      } catch (error) {
        console.error(error);
        if (ativo) {
          setPontos(carregarPontosCache(demanda.id));
          setErro("");
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    void carregarGaleria();

    return () => {
      ativo = false;
    };
  }, [demanda.id]);

  function formatarData(data: string) {
    if (!data) return "-";

    return new Date(data).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function excluirFoto(foto: Foto) {
    const confirmar = window.confirm("Tem certeza que deseja excluir esta foto?");

    if (!confirmar) {
      return;
    }

    try {
      setProcessandoId(foto.id);
      setErro("");

      const resposta = await authFetch(`${API_BASE_URL}/fotos/${foto.id}`, {
        method: "DELETE",
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setErro(dados.erro || "Erro ao excluir foto.");
        return;
      }

      setPontos((prev) =>
        prev.map((ponto) =>
          ponto.id !== foto.id_ponto_coletado
            ? ponto
            : {
                ...ponto,
                fotos: ponto.fotos.filter((item) => item.id !== foto.id),
              }
        )
      );
      atualizarPontosCache(demanda.id, (pontosCache) =>
        pontosCache.map((ponto) =>
          ponto.id !== foto.id_ponto_coletado
            ? ponto
            : {
                ...ponto,
                fotos: ponto.fotos.filter((item) => item.id !== foto.id),
              }
        )
      );
    } catch (error) {
      console.error(error);
      setErro("Erro ao conectar com a API.");
    } finally {
      setProcessandoId(null);
    }
  }

  async function excluirPonto(ponto: PontoColetado) {
    const confirmar = window.confirm(
      "Tem certeza que deseja excluir este ponto e todas as fotos dele?"
    );

    if (!confirmar) {
      return;
    }

    try {
      setProcessandoId(ponto.id);
      setErro("");

      const resposta = await authFetch(
        `${API_BASE_URL}/pontos-coletados/${ponto.id}`,
        {
          method: "DELETE",
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        setErro(dados.erro || "Erro ao excluir ponto.");
        return;
      }

      setPontos((prev) => prev.filter((item) => item.id !== ponto.id));
      atualizarPontosCache(demanda.id, (pontosCache) =>
        pontosCache.filter((item) => item.id !== ponto.id)
      );
    } catch (error) {
      console.error(error);
      setErro("Erro ao conectar com a API.");
    } finally {
      setProcessandoId(null);
    }
  }

  const centroMapa: [number, number] =
    pontos.length > 0
      ? [Number(pontos[0].latitude), Number(pontos[0].longitude)]
      : [Number(demanda.latitude), Number(demanda.longitude)];

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      <div
        style={{
          background: "linear-gradient(90deg, #021B33, #0A3A63, #0B5C7A)",
          color: "white",
          padding: "20px 20px 28px",
        }}
      >
        <button
          onClick={voltar}
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            border: "none",
            background: "rgba(255,255,255,0.12)",
            color: "white",
            fontSize: 24,
            cursor: "pointer",
            marginBottom: 18,
          }}
        >
          ‹
        </button>

        <h1 style={{ margin: 0, fontSize: 28, color: "white" }}>
          Galeria da demanda
        </h1>

        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 15 }}>
          {demanda.solicitacao}
        </p>
      </div>

      <div style={{ padding: 16 }}>
        <div
          style={{
            background: "white",
            borderRadius: 24,
            padding: 16,
            marginBottom: 16,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: 14, color: "#64748b" }}>Cliente</div>
          <strong style={{ fontSize: 18 }}>{demanda.nome}</strong>

          <div style={{ marginTop: 8, fontSize: 14, color: "#64748b" }}>
            {demanda.municipio} • {pontos.length} ponto(s) coletado(s)
          </div>
        </div>

        {!carregando && pontos.length > 0 && (
          <div
            style={{
              background: "white",
              borderRadius: 24,
              padding: 14,
              marginBottom: 16,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          >
            <strong style={{ color: "#0f172a" }}>Mapa final do levantamento</strong>
            <p style={{ margin: "6px 0 12px 0", color: "#64748b", fontSize: 14 }}>
              Aqui voce consegue ver todos os pontos coletados da demanda no mesmo mapa.
            </p>

            <div
              style={{
                height: 260,
                borderRadius: 18,
                overflow: "hidden",
              }}
            >
              <MapContainer
                center={centroMapa}
                zoom={18}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
                {pontos.map((ponto, index) => (
                  <Marker
                    key={ponto.id}
                    position={[Number(ponto.latitude), Number(ponto.longitude)]}
                    icon={criarIconePonto(
                      "#16a34a",
                      String(ponto.ordem_ponto || pontos.length - index)
                    )}
                  />
                ))}
              </MapContainer>
            </div>
          </div>
        )}

        {carregando && (
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: 20,
              textAlign: "center",
              color: "#64748b",
            }}
          >
            Carregando galeria...
          </div>
        )}

        {erro && (
          <div
            style={{
              background: "#fee2e2",
              color: "#b91c1c",
              borderRadius: 20,
              padding: 16,
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            {erro}
          </div>
        )}

        {!carregando && !erro && pontos.length === 0 && (
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: 20,
              textAlign: "center",
              color: "#64748b",
            }}
          >
            Nenhum ponto coletado para esta demanda.
          </div>
        )}

        {!carregando &&
          pontos.map((ponto, index) => (
            <div
              key={ponto.id}
              style={{
                background: "white",
                borderRadius: 24,
                padding: 16,
                marginBottom: 16,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <h3 style={{ margin: 0, color: "#0f172a" }}>
                    Ponto {ponto.ordem_ponto || index + 1}
                  </h3>

                  <p
                    style={{
                      margin: "4px 0 0 0",
                      color: "#64748b",
                      fontSize: 13,
                    }}
                  >
                    {formatarData(ponto.data_coleta)}
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      background: "#dbeafe",
                      color: "#1d4ed8",
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {ponto.fotos.length} foto(s)
                  </span>

                  <button
                    onClick={() => void excluirPonto(ponto)}
                    disabled={processandoId === ponto.id}
                    style={{
                      border: "1px solid #fecaca",
                      borderRadius: 12,
                      background: "#fff1f2",
                      color: "#dc2626",
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontWeight: 700,
                      opacity: processandoId === ponto.id ? 0.6 : 1,
                    }}
                  >
                    {processandoId === ponto.id ? "Excluindo..." : "Excluir ponto"}
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: 16,
                  padding: 12,
                  marginBottom: 12,
                  fontSize: 14,
                  color: "#334155",
                }}
              >
                <strong>Coordenada</strong>
                <br />
                Lat: {ponto.latitude}
                <br />
                Lng: {ponto.longitude}

                {ponto.observacao && (
                  <>
                    <br />
                    <br />
                    <strong>Observacao</strong>
                    <br />
                    {ponto.observacao}
                  </>
                )}
              </div>

              {ponto.fotos.length === 0 ? (
                <div
                  style={{
                    background: "#f1f5f9",
                    borderRadius: 16,
                    padding: 14,
                    color: "#64748b",
                    textAlign: "center",
                    fontSize: 14,
                  }}
                >
                  Nenhuma foto neste ponto.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  {ponto.fotos.map((foto) => (
                    <div
                      key={foto.id}
                      style={{
                        borderRadius: 16,
                        overflow: "hidden",
                        background: "#e2e8f0",
                      }}
                    >
                      <a
                        href={foto.data_url || authUrl(foto.caminho_arquivo)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "block",
                          height: 130,
                        }}
                      >
                        <img
                          src={foto.data_url || authUrl(foto.caminho_arquivo)}
                          alt={foto.nome_arquivo}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      </a>

                      <button
                        onClick={() => void excluirFoto(foto)}
                        disabled={processandoId === foto.id}
                        style={{
                          width: "100%",
                          border: "none",
                          background: "#fff1f2",
                          color: "#dc2626",
                          padding: "10px 12px",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        {processandoId === foto.id ? "Excluindo..." : "Excluir foto"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
