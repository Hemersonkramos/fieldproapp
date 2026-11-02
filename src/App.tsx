import { useCallback, useEffect, useRef, useState } from "react";
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
  contarLevantamentosPendentes,
  carregarPontosRotaPendentes,
  carregarPosicaoAtual,
  carregarRotaPlanejada,
  salvarDemandasCache,
  salvarPontosRotaPendentes,
  salvarPosicaoAtual,
  type OfflineRoutePoint,
} from "./lib/offlineStorage";
import {
  API_BASE_URL,
  authFetch,
  carregarSessao,
  limparSessao,
  obterToken,
  salvarSessao,
} from "./lib/api";
import { useSessaoInatividade } from "./lib/useSessaoInatividade";
import { FeedbackHost } from "./components/Feedback";
import { mensagemDeErro, notificar } from "./lib/feedback";

const INTERVALO_PONTO_ROTA_MS = 3 * 60 * 1000;

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

const TELA_KEY = "fieldpro_app_tela";
const TELAS_RESTAURAVEIS: Tela[] = ["inicio", "demandas", "mapa", "atendimento", "fotos", "sincronizacao"];

function chaveDeslocamentoAtivo(idEquipe: number) {
  return `fieldpro_deslocamento_ativo_${idEquipe}`;
}

function lerLocal(chave: string) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarLocal(chave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    // ignorado
  }
}

function equipeDoUsuario(usuario: UsuarioLogado): Equipe {
  return {
    id_equipe: usuario.id_equipe,
    numero_equipe: usuario.numero_equipe,
    veiculo: usuario.veiculo,
    placa: usuario.placa,
    status: usuario.status,
  };
}

type EstadoInicial = {
  tela: Tela;
  usuario: UsuarioLogado | null;
  demandas: Demanda[];
  demandaSelecionada: Demanda | null;
  equipe: Equipe | null;
};

// Ao recarregar a pagina, restaura a sessao (ate 1h sem uso), a tela em que a
// equipe estava e as demandas do cache local, sem passar de novo pelo login.
function montarEstadoInicial(): EstadoInicial {
  if (MODO_PREVIEW) {
    return {
      tela: TELA_PREVIEW ?? "splash",
      usuario: USUARIO_PREVIEW,
      demandas: DEMANDAS_PREVIEW,
      demandaSelecionada: DEMANDA_PREVIEW,
      equipe: EQUIPE_PREVIEW,
    };
  }

  const usuario = carregarSessao<UsuarioLogado>();

  if (!usuario) {
    return { tela: "splash", usuario: null, demandas: [], demandaSelecionada: null, equipe: null };
  }

  const demandas = usuario.id_equipe ? carregarDemandasCache(usuario.id_equipe) : [];
  let tela: Tela = "inicio";
  let demandaSelecionada: Demanda | null = null;

  try {
    const salvo = JSON.parse(lerLocal(TELA_KEY) || "null") as { tela?: Tela; idDemanda?: number } | null;

    if (salvo?.tela && TELAS_RESTAURAVEIS.includes(salvo.tela)) {
      demandaSelecionada = demandas.find((demanda) => demanda.id === salvo.idDemanda) ?? null;
      const precisaDemanda = salvo.tela === "atendimento" || salvo.tela === "fotos";
      tela = precisaDemanda && !demandaSelecionada ? "demandas" : salvo.tela;
    }
  } catch {
    tela = "inicio";
  }

  return { tela, usuario, demandas, demandaSelecionada, equipe: equipeDoUsuario(usuario) };
}

export default function App() {
  const [estadoInicial] = useState(montarEstadoInicial);
  const [tela, setTela] = useState<Tela>(estadoInicial.tela);
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(estadoInicial.usuario);
  const [demandas, setDemandas] = useState<Demanda[]>(estadoInicial.demandas);
  const [demandaSelecionada, setDemandaSelecionada] =
    useState<Demanda | null>(estadoInicial.demandaSelecionada);
  const [equipeSelecionada, setEquipeSelecionada] =
    useState<Equipe | null>(estadoInicial.equipe);

  const [rotaSelecionada, setRotaSelecionada] = useState<Demanda[]>(
    MODO_PREVIEW ? DEMANDAS_PREVIEW : []
  );
  const [posicaoAtual, setPosicaoAtual] = useState<[number, number] | null>(
    carregarPosicaoAtual()
  );
  const [watchId, setWatchId] = useState<number | null>(null);
  // Posicao lida pelo GPS nesta sessao. Fica nula com o GPS desligado: o alfinete
  // "voce esta aqui" so aparece depois que a equipe liga o GPS.
  const [posicaoGps, setPosicaoGps] = useState<[number, number] | null>(null);
  // Espelho de watchId para leituras fora do ciclo de render (inatividade, restauracao).
  const watchIdRef = useRef<number | null>(null);
  const ultimoPontoRotaEmRef = useRef<number | null>(null);
  const ultimaPosicaoGravadaEmRef = useRef(0);

  // Avisa quando a internet cai e quando volta com levantamentos esperando envio.
  useEffect(() => {
    if (MODO_PREVIEW) return;

    const aoFicarOffline = () => {
      notificar("Sem internet. Pode continuar coletando: os pontos ficam salvos no aparelho.", "aviso");
    };
    const aoFicarOnline = () => {
      const pendentes = contarLevantamentosPendentes();
      notificar(
        pendentes > 0
          ? `Internet de volta. ${pendentes} ponto(s) aguardando envio: abra a aba Sync para sincronizar.`
          : "Internet de volta.",
        pendentes > 0 ? "info" : "sucesso"
      );
    };

    window.addEventListener("offline", aoFicarOffline);
    window.addEventListener("online", aoFicarOnline);
    return () => {
      window.removeEventListener("offline", aoFicarOffline);
      window.removeEventListener("online", aoFicarOnline);
    };
  }, []);

  // Guarda a tela atual para restaurar apos recarregar a pagina.
  useEffect(() => {
    if (MODO_PREVIEW || !usuario) return;
    if (!TELAS_RESTAURAVEIS.includes(tela)) return;
    gravarLocal(TELA_KEY, JSON.stringify({ tela, idDemanda: demandaSelecionada?.id }));
  }, [tela, demandaSelecionada?.id, usuario]);

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

    if (watchIdRef.current !== null) {
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
        setPosicaoGps(novaPosicao);

        // O GPS pode responder varias vezes por segundo; gravar no armazenamento
        // local a cada 10s basta para reabrir o mapa na ultima posicao.
        if (agora - ultimaPosicaoGravadaEmRef.current > 10 * 1000) {
          ultimaPosicaoGravadaEmRef.current = agora;
          salvarPosicaoAtual(novaPosicao);
        }

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

        if (erro.code === erro.PERMISSION_DENIED) {
          // Sem permissao o rastreio nunca vai funcionar: desliga e explica o que fazer.
          navigator.geolocation.clearWatch(id);
          if (watchIdRef.current === id) {
            watchIdRef.current = null;
            setWatchId(null);
            setPosicaoGps(null);
            gravarLocal(chaveDeslocamentoAtivo(idEquipe), null);
          }
          notificar(
            "Permissão de localização negada. Libere a localização do FieldPro nas configurações do navegador e ligue o GPS de novo.",
            "erro"
          );
          return;
        }

        if (erro.code === erro.POSITION_UNAVAILABLE) {
          notificar("GPS sem sinal no momento. Verifique se a localização do aparelho está ligada.", "aviso");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );

    watchIdRef.current = id;
    setWatchId(id);
    // Lembra que o deslocamento estava ligado: se a pagina recarregar, o rastreio volta sozinho.
    gravarLocal(chaveDeslocamentoAtivo(idEquipe), "1");
    return "iniciado" as const;
  }

  function pararDeslocamento() {
    const idAtual = watchIdRef.current;

    if (idAtual === null) {
      return false;
    }

    navigator.geolocation.clearWatch(idAtual);
    watchIdRef.current = null;
    setWatchId(null);
    setPosicaoGps(null);
    ultimoPontoRotaEmRef.current = null;
    if (usuario?.id_equipe) gravarLocal(chaveDeslocamentoAtivo(usuario.id_equipe), null);
    return true;
  }

  // Retoma o rastreio do deslocamento que estava ativo antes de recarregar.
  const deslocamentoRetomadoRef = useRef(false);
  useEffect(() => {
    if (MODO_PREVIEW || !usuario?.id_equipe || deslocamentoRetomadoRef.current) return;
    deslocamentoRetomadoRef.current = true;
    if (lerLocal(chaveDeslocamentoAtivo(usuario.id_equipe)) === "1") {
      iniciarDeslocamento();
    }
    // iniciarDeslocamento le o usuario atual; so precisa rodar quando a equipe e definida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id_equipe]);

  const sair = useCallback(() => {
    const token = obterToken();

    if (token && usuario?.perfil === "equipe") {
      void fetch(`${API_BASE_URL}/presenca/equipe`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => undefined);
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setWatchId(null);
      setPosicaoGps(null);
    }

    limparSessao();
    gravarLocal(TELA_KEY, null);
    deslocamentoRetomadoRef.current = false;
    if (usuario) setEquipeSelecionada(equipeDoUsuario(usuario));
    setUsuario(null);
    setDemandaSelecionada(null);
    // Os levantamentos pendentes continuam guardados e sobem no proximo login.
    setTela(usuario ? "login" : "splash");
  }, [usuario]);

  // 1h sem uso encerra a sessao. Com o deslocamento ligado o app conta como em uso,
  // para nao interromper o rastreio da rota no meio do trajeto.
  useSessaoInatividade(
    !MODO_PREVIEW && Boolean(usuario),
    () => {
      notificar("Sua sessão expirou. Entre novamente para continuar.", "info");
      sair();
    },
    () => watchIdRef.current !== null
  );

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
        const dados = await resposta.json().catch(() => null);

        if (!resposta.ok || !Array.isArray(dados)) {
          console.error("Erro ao buscar demandas");
          if (ativo && resposta.status !== 401) {
            setDemandas(carregarDemandasCache(idEquipeAtual));
            notificar(
              (dados && typeof dados.erro === "string" ? dados.erro : "Não foi possível atualizar as demandas.") +
                " Mostrando as salvas no aparelho.",
              "aviso"
            );
          }
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
          notificar(
            navigator.onLine
              ? `${mensagemDeErro(error)} Mostrando as demandas salvas no aparelho.`
              : "Sem internet. Mostrando as demandas salvas no aparelho.",
            "aviso"
          );
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
      <FeedbackHost />
      {/* key={tela}: cada troca de tela entra com uma animacao curta */}
      <div key={tela} className="fp-tela" style={{ flex: 1, width: "100%" }}>
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
            if (!MODO_PREVIEW) salvarSessao(usuarioLogado);
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
          posicaoGps={posicaoGps}
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
          posicaoGps={posicaoGps}
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
      </div>
    </>
  );
}
