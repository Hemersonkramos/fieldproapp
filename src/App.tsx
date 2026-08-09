import { useEffect, useRef, useState } from "react";
import Splash from "./screens/Splash";
import SelecionarEquipe from "./screens/SelecionarEquipe";
import Login from "./screens/Login";
import Inicio from "./screens/Inicio";
import Demandas from "./screens/Demandas";
import Atendimento from "./screens/Atendimento";
import Mapa from "./screens/Mapa";
import Sincronizacao from "./screens/Sincronizacao";
import Fotos from "./screens/Fotos";
import {
  carregarDemandasCache,
  carregarPontosRotaPendentes,
  carregarPosicaoAtual,
  carregarRotaPlanejada,
  salvarDemandasCache,
  salvarPontosRotaPendentes,
  salvarPosicaoAtual,
  type OfflineRoutePoint,
} from "./lib/offlineStorage";
import { API_BASE_URL, authFetch, obterToken } from "./lib/api";

const INTERVALO_PONTO_ROTA_MS = 10 * 60 * 1000;

export type Tela =
  | "splash"
  | "selecionarEquipe"
  | "login"
  | "inicio"
  | "demandas"
  | "mapa"
  | "atendimento"
  | "fotos"
  | "sincronizacao";


export type UsuarioLogado = {
  id: number;
  nome_completo: string;
  user: string;
  perfil: string;
  id_equipe: number;
  numero_equipe: string;
  veiculo: string;
  placa: string;
  status: "Parado" | "Ativo";
  token: string;
};

export type Equipe = {
  id_equipe: number;
  numero_equipe: string;
  veiculo: string;
  placa: string;
  status: "Ativo" | "Parado";
};

export type Demanda = {
  id: number;
  solicitacao: string;
  nome: string;
  regional: string;
  municipio: string;
  prazo: string;
  id_equipe: number;
  detalhes: string;
  telefone: string;
  latitude: string;
  longitude: string;
  prioridade: "Normal" | "Emergencial";
  data_servico: string;
  status: "Andamento" | "Concluida" | "Devolvida" | "Finalizada";
};

const PREVIEWS_DISPONIVEIS: Record<string, Tela> = {
  splash: "splash",
  equipes: "selecionarEquipe",
  login: "login",
  inicio: "inicio",
  demandas: "demandas",
  mapa: "mapa",
  atendimento: "atendimento",
  fotos: "fotos",
  sincronizacao: "sincronizacao",
};

const PREVIEW_SOLICITADO = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("preview") || ""
  : "";
const TELA_PREVIEW = PREVIEWS_DISPONIVEIS[PREVIEW_SOLICITADO];
const MODO_PREVIEW = Boolean(TELA_PREVIEW);

const DEMANDA_PREVIEW: Demanda = {
  id: -1,
  solicitacao: "Levantamento de demonstração",
  nome: "Cliente local",
  regional: "Regional de teste",
  municipio: "São Paulo",
  prazo: new Date().toISOString(),
  id_equipe: -1,
  detalhes: "Tela local para testar a coleta e a aproximação do mapa.",
  telefone: "-",
  latitude: "-23.550520",
  longitude: "-46.633308",
  prioridade: "Normal",
  data_servico: new Date().toISOString(),
  status: "Andamento",
};

const DEMANDAS_PREVIEW: Demanda[] = [
  DEMANDA_PREVIEW,
  {
    ...DEMANDA_PREVIEW,
    id: -2,
    solicitacao: "Inspeção emergencial de demonstração",
    nome: "Segundo cliente local",
    latitude: "-23.550700",
    longitude: "-46.633500",
    prioridade: "Emergencial",
  },
];

const EQUIPE_PREVIEW: Equipe = {
  id_equipe: -1,
  numero_equipe: "DEMO-01",
  veiculo: "Veículo de demonstração",
  placa: "LOCAL",
  status: "Ativo",
};

const USUARIO_PREVIEW: UsuarioLogado = {
  id: -1,
  nome_completo: "Usuário de demonstração",
  user: "demo",
  perfil: "Campo",
  id_equipe: EQUIPE_PREVIEW.id_equipe,
  numero_equipe: EQUIPE_PREVIEW.numero_equipe,
  veiculo: EQUIPE_PREVIEW.veiculo,
  placa: EQUIPE_PREVIEW.placa,
  status: EQUIPE_PREVIEW.status,
  token: "",
};

export default function App() {
  const [tela, setTela] = useState<Tela>(
    TELA_PREVIEW || "splash"
  );
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(
    MODO_PREVIEW ? USUARIO_PREVIEW : null
  );
  const [demandas, setDemandas] = useState<Demanda[]>(
    MODO_PREVIEW ? DEMANDAS_PREVIEW : []
  );
  const [demandaSelecionada, setDemandaSelecionada] =
    useState<Demanda | null>(
      MODO_PREVIEW ? DEMANDA_PREVIEW : null
    );
  const [equipeSelecionada, setEquipeSelecionada] =
    useState<Equipe | null>(MODO_PREVIEW ? EQUIPE_PREVIEW : null);

  const [rotaSelecionada, setRotaSelecionada] = useState<Demanda[]>(
    MODO_PREVIEW ? DEMANDAS_PREVIEW : []
  );
  const [posicaoAtual, setPosicaoAtual] = useState<[number, number] | null>(
    carregarPosicaoAtual()
  );
  const [watchId, setWatchId] = useState<number | null>(null);
  const ultimoPontoRotaEmRef = useRef<number | null>(null);

  useEffect(() => {
    if (MODO_PREVIEW || !usuario?.id_equipe) {
      return;
    }

    const atualizarPresenca = () => {
      void authFetch(`${API_BASE_URL}/presenca/equipe`, {
        method: "POST",
      }).catch((error) => {
        console.error("Erro ao atualizar presenca da equipe:", error);
      });
    };

    const encerrarPresenca = () => {
      const token = obterToken();

      if (!token) {
        return;
      }

      void fetch(`${API_BASE_URL}/presenca/equipe`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        keepalive: true,
      }).catch(() => undefined);
    };

    atualizarPresenca();

    const intervalo = window.setInterval(atualizarPresenca, 60 * 1000);
    window.addEventListener("pagehide", encerrarPresenca);

    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("pagehide", encerrarPresenca);
      encerrarPresenca();
    };
  }, [usuario?.id_equipe]);

  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  function salvarPontoRotaOffline(ponto: OfflineRoutePoint) {
    const idEquipe = Number(ponto.id_equipe);
    const pontosSalvos = carregarPontosRotaPendentes(idEquipe);
    pontosSalvos.push(ponto);
    salvarPontosRotaPendentes(idEquipe, pontosSalvos);
  }

  async function enviarPontoRota(ponto: OfflineRoutePoint) {
    if (MODO_PREVIEW) {
      return;
    }

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
    if (!usuario?.id_equipe) {
      return "sem_usuario" as const;
    }

    if (!navigator.geolocation) {
      return "gps_indisponivel" as const;
    }

    if (watchId !== null) {
      return "ja_iniciado" as const;
    }

    const idEquipe = usuario.id_equipe;
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const agora = Date.now();
        const ponto: OfflineRoutePoint = {
          id_equipe: idEquipe,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          data_hora: new Date().toISOString(),
        };
        const novaPosicao: [number, number] = [ponto.latitude, ponto.longitude];

        setPosicaoAtual(novaPosicao);
        salvarPosicaoAtual(novaPosicao);

        if (
          ultimoPontoRotaEmRef.current !== null &&
          agora - ultimoPontoRotaEmRef.current < INTERVALO_PONTO_ROTA_MS
        ) {
          return;
        }

        ultimoPontoRotaEmRef.current = agora;

        if (navigator.onLine) {
          try {
            await enviarPontoRota(ponto);
          } catch (error) {
            console.error("Erro ao enviar ponto. Mantido offline:", error);
            salvarPontoRotaOffline(ponto);
          }
        } else {
          salvarPontoRotaOffline(ponto);
        }
      },
      (erro) => {
        console.error("Erro GPS:", erro);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );

    setWatchId(id);
    return "iniciado" as const;
  }

  function pararDeslocamento() {
    if (watchId === null) {
      return false;
    }

    navigator.geolocation.clearWatch(watchId);
    setWatchId(null);
    ultimoPontoRotaEmRef.current = null;
    return true;
  }

  useEffect(() => {
    const idEquipe = usuario?.id_equipe;

    if (MODO_PREVIEW || !idEquipe) {
      return;
    }

    const idEquipeAtual = idEquipe;
    let ativo = true;

    async function carregarDemandas() {
      try {
        const resposta = await authFetch(`${API_BASE_URL}/demandas/${idEquipeAtual}`);
        const dados: Demanda[] = await resposta.json();

        if (!resposta.ok) {
          console.error("Erro ao buscar demandas");
          return;
        }

        if (ativo) {
          setDemandas(dados);
          salvarDemandasCache(idEquipeAtual, dados);
        }
      } catch (error) {
        console.error(error);
        if (ativo) {
          setDemandas(carregarDemandasCache(idEquipeAtual));
        }
      }
    }

    void carregarDemandas();

    return () => {
      ativo = false;
    };
  }, [usuario?.id_equipe]);

  useEffect(() => {
    if (MODO_PREVIEW) {
      return;
    }

    if (!usuario?.id_equipe) {
      setRotaSelecionada([]);
      return;
    }

    const rotaSalva = carregarRotaPlanejada(usuario.id_equipe);
    setRotaSelecionada(rotaSalva.rotaSelecionada ?? []);
  }, [usuario?.id_equipe]);

  function atualizarDemanda(demandaAtualizada: Demanda) {
    setDemandas((prev) =>
      prev.map((demanda) =>
        demanda.id === demandaAtualizada.id ? demandaAtualizada : demanda
      )
    );

    setRotaSelecionada((prev) =>
      prev.map((demanda) =>
        demanda.id === demandaAtualizada.id ? demandaAtualizada : demanda
      )
    );

    setDemandaSelecionada((prev) =>
      prev?.id === demandaAtualizada.id ? demandaAtualizada : prev
    );
  }

  function abrirDemanda(demanda: Demanda) {
    setDemandaSelecionada(demanda);
    setTela("atendimento");
  }

  function verDemandaNoMapa(demanda: Demanda) {
    setRotaSelecionada([demanda]);
    setTela("mapa");
  }

  return (
    <>
      {tela === "splash" && (
        <Splash entrar={() => setTela("selecionarEquipe")} />
      )}

      {tela === "selecionarEquipe" && (
        <SelecionarEquipe
          equipesDemonstracao={MODO_PREVIEW ? [EQUIPE_PREVIEW] : undefined}
          selecionar={(equipe) => {
            setEquipeSelecionada(equipe);
            setTela("login");
          }}
          voltar={() => setTela("splash")}
        />
      )}

      {tela === "login" && (
        <Login
          equipe={equipeSelecionada}
          usuarioDemonstracao={MODO_PREVIEW ? USUARIO_PREVIEW : undefined}
          voltar={() => setTela("selecionarEquipe")}
          onLogin={(usuarioLogado) => {
            setUsuario(usuarioLogado);
            setTela("inicio");
          }}
        />
      )}

      {tela === "inicio" && usuario && (
        <Inicio
          usuario={usuario}
          demandas={demandas}
          posicaoAtual={posicaoAtual}
          setTela={setTela}
        />
      )}

      {tela === "demandas" && (
        <Demandas
          demandas={demandas}
          abrir={abrirDemanda}
          verNoMapa={verDemandaNoMapa}
          voltar={() => setTela("inicio")}
          setTela={setTela}
        />
      )}

      {tela === "mapa" && usuario && (
        <Mapa
          usuario={usuario}
          demandas={demandas}
          rotaSelecionada={rotaSelecionada}
          setRotaSelecionada={setRotaSelecionada}
          posicaoAtual={posicaoAtual}
          deslocamentoAtivo={watchId !== null}
          iniciarDeslocamento={iniciarDeslocamento}
          pararDeslocamento={pararDeslocamento}
          atualizarDemanda={atualizarDemanda}
          abrirDemanda={abrirDemanda}
          modoDemonstracao={MODO_PREVIEW}
          setTela={setTela}
        />
      )}

      {tela === "atendimento" && demandaSelecionada && (
        <Atendimento
          demanda={demandaSelecionada}
          modoDemonstracao={MODO_PREVIEW}
          voltar={() => setTela("demandas")}
          abrirGaleria={() => setTela("fotos")}
        />
      )}

      {tela === "fotos" && demandaSelecionada && (
      <Fotos
        demanda={demandaSelecionada}
        modoDemonstracao={MODO_PREVIEW}
        voltar={() => setTela("atendimento")}
      />
      )}

      {tela === "sincronizacao" && (
        <Sincronizacao
          usuario={usuario}
          modoDemonstracao={MODO_PREVIEW}
          setTela={setTela}
        />
      )}
    </>
  );
}
