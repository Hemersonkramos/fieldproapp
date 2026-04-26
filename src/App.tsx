import { useEffect, useState } from "react";
import Splash from "./screens/Splash";
import SelecionarEquipe from "./screens/SelecionarEquipe";
import Login from "./screens/Login";
import Inicio from "./screens/Inicio";
import Demandas from "./screens/Demandas";
import Atendimento from "./screens/Atendimento";
import Mapa from "./screens/Mapa";
import Sincronizacao from "./screens/Sincronizacao";
import Fotos from "./screens/Fotos";
import { carregarDemandasCache, salvarDemandasCache } from "./lib/offlineStorage";
import { API_BASE_URL, authFetch } from "./lib/api";

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

type RotaPlanejada = {
  rotaSelecionada?: Demanda[];
};

function carregarRotaPlanejadaInicial(): Demanda[] {
  const rotaSalva = localStorage.getItem("fieldpro_rota_planejada");

  if (!rotaSalva) {
    return [];
  }

  try {
    const dados = JSON.parse(rotaSalva) as RotaPlanejada;
    return Array.isArray(dados.rotaSelecionada) ? dados.rotaSelecionada : [];
  } catch (error) {
    console.error("Erro ao carregar rota planejada:", error);
    return [];
  }
}

export default function App() {
  const [tela, setTela] = useState<Tela>("splash");
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [demandaSelecionada, setDemandaSelecionada] =
    useState<Demanda | null>(null);
  const [equipeSelecionada, setEquipeSelecionada] =
    useState<Equipe | null>(null);

  const [rotaSelecionada, setRotaSelecionada] = useState<Demanda[]>(
    carregarRotaPlanejadaInicial
  );

  useEffect(() => {
    const idEquipe = usuario?.id_equipe;

    if (!idEquipe) {
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
          rotaSelecionada={rotaSelecionada}
          setRotaSelecionada={setRotaSelecionada}
          abrirDemanda={abrirDemanda}
          irParaDemandas={() => setTela("demandas")}
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
          atualizarDemanda={atualizarDemanda}
          abrirDemanda={abrirDemanda}
          setTela={setTela}
        />
      )}

      {tela === "atendimento" && demandaSelecionada && (
        <Atendimento
          demanda={demandaSelecionada}
          voltar={() => setTela("demandas")}
          abrirGaleria={() => setTela("fotos")}
        />
      )}

      {tela === "fotos" && demandaSelecionada && (
      <Fotos
        demanda={demandaSelecionada}
        voltar={() => setTela("atendimento")}
      />
      )}

      {tela === "sincronizacao" && (
        <Sincronizacao setTela={setTela} />
      )}
    </>
  );
}
