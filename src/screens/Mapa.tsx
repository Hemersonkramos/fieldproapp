import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet-routing-machine";
import type { Demanda, UsuarioLogado } from "../App";
import BottomNav from "../components/BottomNav";
import {
  carregarPosicaoAtual,
  carregarPontosRotaPendentes,
  limparRotaPlanejada,
  salvarPosicaoAtual,
  salvarPontosRotaPendentes,
  salvarRotaPlanejada,
  type OfflineRoutePoint,
} from "../lib/offlineStorage";
import { API_BASE_URL, authFetch } from "../lib/api";

type LeafletDefaultIconPrototype = typeof L.Icon.Default.prototype & {
  _getIconUrl?: string;
};

type Props = {
  usuario: UsuarioLogado;
  demandas: Demanda[];
  rotaSelecionada: Demanda[];
  setRotaSelecionada: Dispatch<SetStateAction<Demanda[]>>;
  posicaoAtual: [number, number] | null;
  deslocamentoAtivo: boolean;
  iniciarDeslocamento: () => "iniciado" | "ja_iniciado" | "gps_indisponivel" | "sem_usuario";
  pararDeslocamento: () => boolean;
  atualizarDemanda: (demanda: Demanda) => void;
  abrirDemanda: (demanda: Demanda) => void;
  setTela: (tela: "inicio" | "demandas" | "mapa" | "sincronizacao") => void;
};

type PontoRotaReal = OfflineRoutePoint;

type RoutingProps = {
  origem: [number, number] | null;
  rotaSelecionada: Demanda[];
  acompanhar: boolean;
};

type RoutingControlOptionsWithExtras = L.Routing.RoutingControlOptions & {
  draggableWaypoints: boolean;
  createMarker: () => null;
};

type LeafletRoutingNamespace = typeof L & {
  Routing: {
    control: (options: RoutingControlOptionsWithExtras) => L.Routing.Control;
  };
};

const CENTRO_PADRAO: [number, number] = [-5.0892, -42.8016];

delete (L.Icon.Default.prototype as LeafletDefaultIconPrototype)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const routeLineOptions: L.Routing.LineOptions = {
  extendToWaypoints: true,
  missingRouteTolerance: 0,
  styles: [
    {
      color: "#0A3A63",
      weight: 5,
      opacity: 0.9,
    },
  ],
};

// Ícone personalizado estilo Google Maps - círculo azul com ponto
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

function RotaPorRuas({ origem, rotaSelecionada, acompanhar }: RoutingProps) {
  const map = useMap();

  useEffect(() => {
    if (!origem || rotaSelecionada.length === 0) {
      return;
    }

    const waypoints = [
      L.latLng(origem[0], origem[1]),
      ...rotaSelecionada.map((d) =>
        L.latLng(Number(d.latitude), Number(d.longitude))
      ),
    ];

    const routing = L as LeafletRoutingNamespace;
    const routingControl = routing.Routing.control({
      waypoints,
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: !acompanhar,
      show: false,
      createMarker: () => null,
      lineOptions: routeLineOptions,
    }).addTo(map);

    return () => {
      map.removeControl(routingControl);
    };
  }, [acompanhar, map, origem, rotaSelecionada]);

  return null;
}

function CentralizarMapa({
  centro,
  acompanhar,
}: {
  centro: [number, number];
  acompanhar: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (acompanhar) {
      map.setView(centro, Math.max(map.getZoom(), 18), { animate: true });
      return;
    }

    map.setView(centro);
  }, [acompanhar, centro, map]);

  return null;
}

export default function Mapa({
  usuario,
  demandas,
  rotaSelecionada,
  setRotaSelecionada,
  posicaoAtual,
  deslocamentoAtivo,
  iniciarDeslocamento: iniciarDeslocamentoGlobal,
  pararDeslocamento: pararDeslocamentoGlobal,
  atualizarDemanda,
  abrirDemanda,
  setTela,
}: Props) {
  const posicaoInicial = carregarPosicaoAtual();
  const [posicao, setPosicao] = useState<[number, number] | null>(
    posicaoInicial
  );
  const [carregandoPosicao, setCarregandoPosicao] = useState(posicao === null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [mensagem, setMensagem] = useState("");
  const [mostrarRota, setMostrarRota] = useState(false);

  function adicionarNaRota(demanda: Demanda) {
    setRotaSelecionada((prev) => {
      if (prev.some((item) => item.id === demanda.id)) {
        return prev;
      }

      return [...prev, demanda];
    });
  }

  useEffect(() => {
    if (posicaoAtual) {
      setPosicao(posicaoAtual);
      setCarregandoPosicao(false);
    }
  }, [posicaoAtual]);

  useEffect(() => {
    function atualizarStatus() {
      setOnline(navigator.onLine);
    }

    window.addEventListener("online", atualizarStatus);
    window.addEventListener("offline", atualizarStatus);

    return () => {
      window.removeEventListener("online", atualizarStatus);
      window.removeEventListener("offline", atualizarStatus);
    };
  }, []);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const novaPosicao: [number, number] = [
          pos.coords.latitude,
          pos.coords.longitude,
        ];
        setPosicao(novaPosicao);
        salvarPosicaoAtual(novaPosicao);
        setCarregandoPosicao(false);
      },
      (erro) => {
        console.error("Erro ao obter localização:", erro);
        setCarregandoPosicao(false);
      }
    );
  }, []);

  useEffect(() => {
    salvarRotaPlanejada(usuario.id_equipe, {
      origem: posicao,
      rotaSelecionada,
    });
  }, [posicao, rotaSelecionada, usuario.id_equipe]);

  async function concluirDemanda(demanda: Demanda) {
    if (!["Andamento", "Devolvida"].includes(demanda.status)) {
      return;
    }

    const confirmar = window.confirm("Tem certeza que deseja concluir?");

    if (!confirmar) {
      return;
    }

    try {
      const resposta = await authFetch(
        `${API_BASE_URL}/solicitacoes/${demanda.id}/concluir`,
        {
          method: "PUT",
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        setMensagem(dados.erro || "Não foi possível atualizar a demanda.");
        return;
      }

      atualizarDemanda(dados.demanda);
      setMensagem(`Demanda atualizada para ${dados.demanda.status}.`);
    } catch (error) {
      console.error(error);
      setMensagem("Erro ao atualizar status da demanda.");
    }
  }

  function removerDaRota(id: number) {
    setRotaSelecionada((prev) => prev.filter((d) => d.id !== id));
  }

  function limparRota() {
    setRotaSelecionada([]);
    limparRotaPlanejada(usuario.id_equipe);
  }

  function salvarPontoOffline(ponto: PontoRotaReal) {
    const pontosSalvos = carregarPontosRotaPendentes(usuario.id_equipe);
    pontosSalvos.push(ponto);
    salvarPontosRotaPendentes(usuario.id_equipe, pontosSalvos);
  }

  async function enviarPontoParaApi(ponto: OfflineRoutePoint) {
    const resposta = await authFetch(`${API_BASE_URL}/rota`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ponto),
    });

    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => ({}));
      throw new Error(dados.erro || "Erro ao enviar ponto da rota.");
    }
  }

  function iniciarDeslocamento() {
    if (!navigator.geolocation) {
      setMensagem("GPS não disponível neste aparelho.");
      return;
    }

    if (watchId !== null) {
      setMensagem("Deslocamento já iniciado.");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const ponto: PontoRotaReal = {
          id_equipe: usuario.id_equipe,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          data_hora: new Date().toISOString(),
        };

        const novaPosicao: [number, number] = [ponto.latitude, ponto.longitude];
        setPosicao(novaPosicao);
        salvarPosicaoAtual(novaPosicao);

        if (navigator.onLine) {
          try {
            await enviarPontoParaApi(ponto);
          } catch (error) {
            console.error("Erro ao enviar ponto. Mantido offline:", error);
            salvarPontoOffline(ponto);
          }
        } else {
          salvarPontoOffline(ponto);
        }
      },
      (erro) => {
        console.error("Erro GPS:", erro);
        setMensagem("Não foi possível acessar a localização.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );

    setWatchId(id);
    setMensagem("Deslocamento iniciado.");
  }

  function pararDeslocamento() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setMensagem("Deslocamento finalizado.");
    }
  }

  function iniciarDeslocamentoPersistente() {
    const resultado = iniciarDeslocamentoGlobal();

    if (resultado === "gps_indisponivel") {
      setMensagem("GPS nÃ£o disponÃ­vel neste aparelho.");
      return;
    }

    if (resultado === "sem_usuario") {
      setMensagem("Equipe nÃ£o identificada. FaÃ§a login novamente.");
      return;
    }

    if (resultado === "ja_iniciado") {
      setMensagem("Deslocamento jÃ¡ iniciado.");
      return;
    }

    setMensagem("Deslocamento iniciado.");
    setMostrarRota(false);
  }

  function pararDeslocamentoPersistente() {
    if (pararDeslocamentoGlobal()) {
      setMensagem("Deslocamento finalizado.");
    }
  }

  void iniciarDeslocamento;
  void pararDeslocamento;

  async function sincronizarPontos() {
    const pontosSalvos = carregarPontosRotaPendentes(usuario.id_equipe);

    if (pontosSalvos.length === 0) {
      setMensagem("Não existem pontos pendentes para sincronizar.");
      return;
    }

    if (!navigator.onLine) {
      setMensagem("Sem internet. A sincronização será feita depois.");
      return;
    }

    try {
      for (const ponto of pontosSalvos) {
        await enviarPontoParaApi(ponto);
      }

      salvarPontosRotaPendentes(usuario.id_equipe, []);
      setMensagem("Pontos sincronizados com sucesso.");
    } catch (error) {
      console.error("Erro ao sincronizar:", error);
      setMensagem("Erro ao sincronizar. Os pontos continuam salvos.");
    }
  }

  function abrirRotaNoGoogleMaps() {
    if (!posicao) {
      setMensagem("A localização atual ainda não está disponível.");
      return;
    }

    if (rotaVisivel.length === 0) {
      setMensagem("Selecione pelo menos um ponto para abrir a rota no Google Maps.");
      return;
    }

    const origem = `${posicao[0]},${posicao[1]}`;
    const destinoFinal = rotaVisivel[rotaVisivel.length - 1];
    const destino = `${Number(destinoFinal.latitude)},${Number(destinoFinal.longitude)}`;
    const pontosIntermediarios = rotaVisivel
      .slice(0, -1)
      .map((demanda) => `${Number(demanda.latitude)},${Number(demanda.longitude)}`)
      .join("|");

    const params = new URLSearchParams({
      api: "1",
      origin: origem,
      destination: destino,
      travelmode: "driving",
    });

    if (pontosIntermediarios) {
      params.set("waypoints", pontosIntermediarios);
    }

    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank");
  }

  const pontosPendentes = carregarPontosRotaPendentes(usuario.id_equipe);
  const demandasVisiveis = demandas.filter((d) => d.status !== "Finalizada");
  const rotaVisivel = rotaSelecionada.filter((d) => d.status !== "Finalizada");
  const centroMapa: [number, number] = posicao
    ? posicao
    : rotaVisivel.length > 0
      ? [Number(rotaVisivel[0].latitude), Number(rotaVisivel[0].longitude)]
      : demandasVisiveis.length > 0
        ? [
            Number(demandasVisiveis[0].latitude),
            Number(demandasVisiveis[0].longitude),
          ]
        : CENTRO_PADRAO;

  return (
    <div style={{ height: "100vh", position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          zIndex: 1000,
          background: "rgba(2, 27, 51, 0.88)",
          color: "white",
          padding: "10px 14px",
          borderRadius: 16,
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Mapa da equipe</h2>
            <p style={{ margin: "2px 0 0 0", fontSize: 12, opacity: 0.9 }}>
              Toque nos clientes para montar a rota
            </p>
          </div>

          <button
            onClick={() => setMostrarRota((prev) => !prev)}
            style={{
              border: "none",
              borderRadius: 999,
              background: "rgba(255,255,255,0.14)",
              color: "white",
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {mostrarRota ? "Fechar rota" : `Rota (${rotaVisivel.length})`}
          </button>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 94,
          left: 12,
          right: 12,
          zIndex: 1000,
          padding: "8px 12px",
          background: online ? "rgba(220, 252, 231, 0.94)" : "rgba(254, 226, 226, 0.94)",
          color: online ? "#166534" : "#991b1b",
          fontSize: 13,
          fontWeight: 700,
          borderRadius: 14,
          backdropFilter: "blur(8px)",
        }}
      >
        {online ? "Online" : "Offline"} • {rotaSelecionada.length} ponto(s) na
        rota • {pontosPendentes.length} ponto(s) pendente(s)
      </div>

      {mensagem && (
        <div
          style={{
            position: "absolute",
            top: 152,
            left: 12,
            right: 12,
            zIndex: 1000,
            padding: "8px 10px",
            background: "rgba(248, 250, 252, 0.94)",
            color: "#334155",
            fontSize: 13,
            borderRadius: 14,
            backdropFilter: "blur(8px)",
          }}
        >
          {mensagem}
        </div>
      )}

      <div style={{ position: "absolute", inset: 0 }}>
        {carregandoPosicao ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#475569",
            }}
          >
            Carregando localização...
          </div>
        ) : (
          <MapContainer
            zoom={deslocamentoAtivo ? 18 : 14}
            center={centroMapa}
            style={{ height: "100%", width: "100%" }}
          >
            <CentralizarMapa centro={centroMapa} acompanhar={deslocamentoAtivo} />
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />

            {posicao ? <Marker position={posicao} icon={iconeUsuario}>
              <Popup>Você está aqui</Popup>
            </Marker> : null}

            {demandasVisiveis.map((d) => {
              const ordem =
                rotaVisivel.findIndex((item) => item.id === d.id) + 1;

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
                    <br />
                    Ordem: {ordem > 0 ? ordem : "-"}
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      <button
                        onClick={() => adicionarNaRota(d)}
                        disabled={ordem > 0}
                        style={{
                          border: "none",
                          borderRadius: 10,
                          background: ordem > 0 ? "#dcfce7" : "#16a34a",
                          color: ordem > 0 ? "#166534" : "white",
                          padding: "8px 12px",
                          cursor: ordem > 0 ? "default" : "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {ordem > 0 ? "Na rota" : "Adicionar rota"}
                      </button>
                      <button
                        onClick={() => abrirDemanda(d)}
                        style={{
                          border: "none",
                          borderRadius: 10,
                          background: "#0A3A63",
                          color: "white",
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Atender
                      </button>
                      <button
                        onClick={() => void concluirDemanda(d)}
                        disabled={!["Andamento", "Devolvida"].includes(d.status)}
                        style={{
                          border: "1px solid #cbd5e1",
                          borderRadius: 10,
                          background: "white",
                          color: "#0f172a",
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontWeight: 600,
                          opacity: ["Andamento", "Devolvida"].includes(d.status)
                            ? 1
                            : 0.5,
                        }}
                      >
                        Concluir
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {online && (
              <RotaPorRuas
                origem={posicao}
                rotaSelecionada={rotaVisivel}
                acompanhar={deslocamentoAtivo}
              />
            )}
          </MapContainer>
        )}
      </div>

      {!carregandoPosicao && !posicao ? (
        <div
          style={{
            position: "absolute",
            top: mensagem ? 190 : 152,
            left: 12,
            right: 12,
            zIndex: 1000,
            padding: "8px 10px",
            background: "rgba(254, 242, 242, 0.94)",
            color: "#b91c1c",
            fontSize: 13,
            borderRadius: 14,
            backdropFilter: "blur(8px)",
          }}
        >
          Não foi possível obter a localização da equipe. O mapa foi aberto com
          a melhor referência disponível.
        </div>
      ) : null}

      {mostrarRota && (
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 118,
            zIndex: 1000,
            maxHeight: 190,
            overflowY: "auto",
          }}
        >
        {rotaVisivel.length === 0 ? (
          <div
            style={{
              fontSize: 14,
              color: "#64748b",
              background: "rgba(248, 250, 252, 0.94)",
              borderRadius: 16,
              padding: 12,
              backdropFilter: "blur(8px)",
            }}
          >
            Toque nos alfinetes do mapa para montar a rota.
          </div>
        ) : (
          rotaVisivel.map((item, index) => (
            <div
              key={item.id}
              style={{
                background: "rgba(255,255,255,0.96)",
                borderRadius: 14,
                padding: "10px 12px",
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                backdropFilter: "blur(8px)",
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Ponto {index + 1}
                </div>
                <strong>{item.nome}</strong>
              </div>

              <button
                onClick={() => removerDaRota(item.id)}
                style={{
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                  color: "#dc2626",
                  borderRadius: 10,
                  height: 34,
                  padding: "0 10px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Remover
              </button>
            </div>
          ))
        )}
        </div>
      )}

      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 72,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: 168,
        }}
      >
        <button
          onClick={limparRota}
          style={{
            height: 42,
            borderRadius: 12,
            border: "1px solid #cbd5e1",
            background: "rgba(248, 250, 252, 0.96)",
            cursor: "pointer",
            fontWeight: 600,
            backdropFilter: "blur(8px)",
          }}
        >
          Limpar rota
        </button>

        {deslocamentoAtivo ? (
          <button
            onClick={pararDeslocamentoPersistente}
            style={{
              height: 42,
              borderRadius: 12,
              border: "none",
              background: "rgba(220, 38, 38, 0.96)",
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
              backdropFilter: "blur(8px)",
            }}
          >
            Parar
          </button>
        ) : (
          <button
            onClick={iniciarDeslocamentoPersistente}
            style={{
              height: 42,
              borderRadius: 12,
              border: "none",
              background: "rgba(10, 58, 99, 0.96)",
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
              backdropFilter: "blur(8px)",
            }}
          >
            Iniciar
          </button>
        )}

        <button
          onClick={sincronizarPontos}
          style={{
            height: 42,
            borderRadius: 12,
            border: "1px solid #cbd5e1",
            background: "rgba(248, 250, 252, 0.96)",
            cursor: "pointer",
            fontWeight: 600,
            backdropFilter: "blur(8px)",
          }}
        >
          Sincronizar pontos pendentes
        </button>

        <button
          onClick={abrirRotaNoGoogleMaps}
          style={{
            height: 42,
            borderRadius: 12,
            border: "none",
            background: "rgba(22, 163, 74, 0.96)",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
            backdropFilter: "blur(8px)",
          }}
        >
          Abrir no Google Maps
        </button>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
        }}
      >
        <BottomNav telaAtual="mapa" setTela={setTela} />
      </div>
    </div>
  );
}
