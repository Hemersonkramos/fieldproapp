import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Demanda, UsuarioLogado } from "../App";
import BottomNav from "../components/BottomNav";
import {
  carregarLevantamentosPendentes,
  carregarPontosRotaPendentes,
  carregarPosicaoAtual,
  salvarPosicaoAtual,
} from "../lib/offlineStorage";

type LeafletDefaultIconPrototype = typeof L.Icon.Default.prototype & {
  _getIconUrl?: string;
};

type Props = {
  usuario: UsuarioLogado;
  demandas: Demanda[];
  posicaoAtual: [number, number] | null;
  setTela: (tela: "inicio" | "demandas" | "mapa" | "sincronizacao") => void;
};

delete (L.Icon.Default.prototype as LeafletDefaultIconPrototype)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const iconeUsuario = L.divIcon({
  className: "custom-user-marker",
  html: `
    <div style="
      position: relative;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        position: absolute;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(26, 115, 232, 0.22);
        border: 1px solid rgba(26, 115, 232, 0.35);
      "></div>
      <div style="
        position: relative;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #1a73e8;
        border: 3px solid #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      "></div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function criarIconeDemanda(cor: string) {
  return L.divIcon({
    className: "custom-demand-marker",
    html: `
      <div style="
        position: relative;
        width: 28px;
        height: 40px;
        display: flex;
        align-items: flex-start;
        justify-content: center;
      ">
        <div style="
          position: relative;
          width: 26px;
          height: 26px;
          background: ${cor};
          border: 2px solid rgba(255,255,255,0.98);
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 3px 10px rgba(0,0,0,0.32);
        ">
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            width: 10px;
            height: 10px;
            background: rgba(255,255,255,0.98);
            border-radius: 50%;
            transform: translate(-50%, -50%) rotate(45deg);
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.55);
          "></div>
          <div style="
            position: absolute;
            top: 4px;
            left: 5px;
            width: 12px;
            height: 8px;
            border-radius: 999px;
            background: rgba(255,255,255,0.2);
            transform: rotate(45deg);
          "></div>
        </div>
      </div>
    `,
    iconSize: [28, 40],
    iconAnchor: [14, 36],
    popupAnchor: [0, -34],
  });
}

function estaForaDoPrazo(demanda: Demanda) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const prazo = new Date(demanda.prazo);
  prazo.setHours(0, 0, 0, 0);

  return prazo < hoje;
}

function corDoAlfinete(demanda: Demanda) {
  if (["Concluida", "Finalizada"].includes(demanda.status)) {
    return "#16a34a";
  }

  if (
    demanda.prioridade === "Emergencial" &&
    ["Andamento", "Devolvida"].includes(demanda.status)
  ) {
    return "#dc2626";
  }

  if (
    demanda.prioridade === "Normal" &&
    ["Andamento", "Devolvida"].includes(demanda.status)
  ) {
    return estaForaDoPrazo(demanda) ? "#dc2626" : "#eab308";
  }

  return "#eab308";
}

function AjustarMapaDemandas({
  posicao,
  demandas,
}: {
  posicao: [number, number];
  demandas: Demanda[];
}) {
  const map = useMap();

  useEffect(() => {
    const coordenadas: [number, number][] = [
      posicao,
      ...demandas.map(
        (demanda) =>
          [Number(demanda.latitude), Number(demanda.longitude)] as [
            number,
            number,
          ]
      ),
    ].filter(
      ([latitude, longitude]) =>
        Number.isFinite(latitude) && Number.isFinite(longitude)
    );

    if (coordenadas.length > 1) {
      map.fitBounds(coordenadas, { padding: [36, 36], maxZoom: 14 });
    } else {
      map.setView(posicao, 14);
    }
  }, [demandas, map, posicao]);

  return null;
}

export default function Inicio({
  usuario,
  demandas,
  posicaoAtual,
  setTela,
}: Props) {
  const [posicao, setPosicao] = useState<[number, number] | null>(
    posicaoAtual ?? carregarPosicaoAtual()
  );
  const [isCompact, setIsCompact] = useState(() => window.innerWidth <= 520);
  const [pendenciasSincronizacao, setPendenciasSincronizacao] = useState(
    () =>
      carregarPontosRotaPendentes(usuario.id_equipe).length +
      carregarLevantamentosPendentes().length
  );

  const andamento = demandas.filter((d) =>
    ["Andamento", "Devolvida"].includes(d.status)
  ).length;

  const emergenciais = demandas.filter(
    (d) =>
      d.prioridade === "Emergencial" &&
      ["Andamento", "Devolvida"].includes(d.status)
  ).length;

  const foraPrazo = demandas.filter((d) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const prazo = new Date(d.prazo);
    prazo.setHours(0, 0, 0, 0);

    return prazo < hoje && d.status !== "Finalizada";
  }).length;

  useEffect(() => {
    function atualizarPendencias() {
      setPendenciasSincronizacao(
        carregarPontosRotaPendentes(usuario.id_equipe).length +
          carregarLevantamentosPendentes().length
      );
    }

    window.addEventListener("focus", atualizarPendencias);
    window.addEventListener("storage", atualizarPendencias);
    document.addEventListener("visibilitychange", atualizarPendencias);

    return () => {
      window.removeEventListener("focus", atualizarPendencias);
      window.removeEventListener("storage", atualizarPendencias);
      document.removeEventListener("visibilitychange", atualizarPendencias);
    };
  }, [usuario.id_equipe]);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const novaPosicao: [number, number] = [
          pos.coords.latitude,
          pos.coords.longitude,
        ];
        setPosicao(novaPosicao);
        salvarPosicaoAtual(novaPosicao);
      },
      (erro) => {
        console.error("Erro GPS:", erro);
      }
    );
  }, []);

  useEffect(() => {
    function atualizarViewport() {
      setIsCompact(window.innerWidth <= 520);
    }

    window.addEventListener("resize", atualizarViewport);

    return () => {
      window.removeEventListener("resize", atualizarViewport);
    };
  }, []);

  function cardDashboard(
    titulo: string,
    valor: string | number,
    corFundoIcone: string,
    corValor: string,
    icone: React.ReactNode
  ) {
    return (
      <div
        style={{
          background: "white",
          borderRadius: 20,
          padding: 16,
          boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: corFundoIcone,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icone}
        </div>

        <div>
          <div
            style={{
              fontSize: 13,
              color: "#64748b",
            }}
          >
            {titulo}
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: corValor,
              lineHeight: 1.1,
            }}
          >
            {valor}
          </div>
        </div>
      </div>
    );
  }

  const demandasVisiveis = demandas.filter((d) => d.status !== "Finalizada");

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      <div
        style={{
          background: "linear-gradient(90deg, #021B33, #0A3A63, #0B5C7A)",
          color: "white",
          padding: "20px 20px 24px",
        }}
      >
        <h2 style={{ margin: 0 }}>Visão geral operacional</h2>

        <p
          style={{
            marginTop: 6,
            marginBottom: 0,
            color: "rgba(255,255,255,0.82)",
            fontSize: 14,
          }}
        >
          Equipe {usuario.numero_equipe} · Acompanhamento de demandas e indicadores
        </p>
      </div>

      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {cardDashboard(
            "Em andamento",
            andamento,
            "#dbeafe",
            "#0A3A63",
            <CheckCircle2 size={22} color="#0369a1" />
          )}

          {cardDashboard(
            "Emergenciais",
            emergenciais,
            "#fee2e2",
            "#b91c1c",
            <AlertTriangle size={22} color="#dc2626" />
          )}

          {cardDashboard(
            "Fora do prazo",
            foraPrazo,
            "#fef3c7",
            "#b45309",
            <AlertTriangle size={22} color="#d97706" />
          )}

          {cardDashboard(
            "Sincronização",
            pendenciasSincronizacao === 0
              ? "Em dia"
              : `${pendenciasSincronizacao} pendente${
                  pendenciasSincronizacao === 1 ? "" : "s"
                }`,
            pendenciasSincronizacao === 0 ? "#dcfce7" : "#ffedd5",
            pendenciasSincronizacao === 0 ? "#16a34a" : "#c2410c",
            <RefreshCw
              size={22}
              color={pendenciasSincronizacao === 0 ? "#16a34a" : "#ea580c"}
            />
          )}
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 20,
            padding: 16,
            marginBottom: 20,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: isCompact ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isCompact ? "stretch" : "center",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Mapa da equipe</h3>
              <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#64748b" }}>
                Visualização rápida das demandas no mapa
              </p>
            </div>

            <button
              onClick={() => setTela("mapa")}
              style={{
                height: 40,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                background: "white",
                cursor: "pointer",
                fontWeight: 600,
                padding: "0 12px",
                whiteSpace: isCompact ? "normal" : "nowrap",
                width: isCompact ? "100%" : "auto",
              }}
            >
              Abrir o mapa em tela cheia
            </button>
          </div>

          <div
            style={{
              height: isCompact ? 300 : 420,
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {posicao ? (
              <MapContainer
                center={posicao}
                zoom={14}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
                <AjustarMapaDemandas
                  posicao={posicao}
                  demandas={demandasVisiveis}
                />

                <Marker position={posicao} icon={iconeUsuario}>
                  <Popup>Você está aqui</Popup>
                </Marker>

                {demandasVisiveis.map((d) => {
                  return (
                    <Marker
                      key={d.id}
                      position={[Number(d.latitude), Number(d.longitude)]}
                      icon={criarIconeDemanda(corDoAlfinete(d))}
                    >
                      <Popup>
                        <strong>{d.nome}</strong>
                        <br />
                        Solicitação: {d.solicitacao}
                        <br />
                        {d.municipio}
                        <br />
                        Prioridade: {d.prioridade}
                      </Popup>
                    </Marker>
                  );
                })}

              </MapContainer>
            ) : (
              <div
                style={{
                  height: "100%",
                  background: "#e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  color: "#475569",
                }}
              >
                Carregando mapa...
              </div>
            )}
          </div>
        </div>

      </div>

      <BottomNav telaAtual="inicio" setTela={setTela} />
    </div>
  );
}
