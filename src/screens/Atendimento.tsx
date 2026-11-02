import { useEffect, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import type { Demanda } from "../App";
import {
  adicionarLevantamentoPendente,
  adicionarPontoCache,
  carregarAnexosCache,
  adicionarConclusaoPendente,
  carregarLevantamentosPendentes,
  carregarPosicaoAtual,
  guardarFotosPendentes,
  salvarPosicaoAtual,
  mesclarPontosPendentes,
  referenciaFotoPendente,
  type FotoPendente,
  carregarPontosCache,
  salvarAnexosCache,
  salvarPontosCache,
  type CachedAttachment,
  type CachedPoint,
} from "../lib/offlineStorage";
import { API_BASE_URL, authFetch, authUrl } from "../lib/api";
import { confirmar, mensagemDeErro, notificar } from "../lib/feedback";
import { lerAnexoOffline } from "../lib/fotosOffline";

type Anexo = CachedAttachment;
type PontoColetado = CachedPoint;

type Props = {
  demanda: Demanda;
  /** Atualiza a demanda na lista do app (ex.: status Concluida). */
  atualizarDemanda?: (demanda: Demanda) => void;
  voltar: () => void;
  abrirGaleria: () => void;
  modoDemonstracao?: boolean;
};

type FotoPayload = {
  nome: string;
  tipo: string;
  conteudoBase64: string;
};

type RascunhoColeta = {
  latitude: number;
  longitude: number;
  precisaoGps: number | null;
  observacao: string;
  aguardandoConfirmacao: boolean;
  localConfirmado: boolean;
};

const FOTO_MAX_DIMENSAO = 1600;
const FOTO_QUALIDADE = 0.75;
const MAPA_ZOOM_INICIAL = 21;
const MAPA_ZOOM_MAXIMO = 24;
const SATELITE_ZOOM_NATIVO_MAXIMO = 19;
const MAPA_RUAS_ZOOM_NATIVO_MAXIMO = 19;
const DISTANCIA_PONTOS_PROXIMOS_METROS = 2;

function chaveRascunhoColeta(idDemanda: number) {
  return `fieldpro_rascunho_coleta_${idDemanda}`;
}

function carregarRascunhoColeta(idDemanda: number): RascunhoColeta | null {
  try {
    const valor = localStorage.getItem(chaveRascunhoColeta(idDemanda));
    return valor ? (JSON.parse(valor) as RascunhoColeta) : null;
  } catch {
    return null;
  }
}

function distanciaEmMetros(
  origem: [number, number],
  destino: [number, number]
) {
  return L.latLng(origem).distanceTo(L.latLng(destino));
}
const PONTOS_DEMONSTRACAO: PontoColetado[] = [
  {
    id: -101,
    id_solicitacao: -1,
    ordem_ponto: 1,
    latitude: "-23.550520",
    longitude: "-46.633308",
    data_coleta: new Date().toISOString(),
    observacao: "Ponto de demonstração 1",
    fotos: [],
  },
  {
    id: -102,
    id_solicitacao: -1,
    ordem_ponto: 2,
    latitude: "-23.550520",
    longitude: "-46.633298",
    data_coleta: new Date().toISOString(),
    observacao: "Ponto de demonstração 2, aproximadamente 1 metro do primeiro",
    fotos: [],
  },
];

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

function arquivoParaBase64(arquivo: File) {
  return new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();

    leitor.onload = () => {
      if (typeof leitor.result === "string") {
        resolve(leitor.result);
        return;
      }

      reject(new Error("Nao foi possivel ler a foto."));
    };

    leitor.onerror = () => {
      reject(new Error("Erro ao converter a foto."));
    };

    leitor.readAsDataURL(arquivo);
  });
}

function carregarImagem(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const imagem = new Image();
    imagem.onload = () => resolve(imagem);
    imagem.onerror = () => reject(new Error("Erro ao carregar a foto."));
    imagem.src = url;
  });
}

async function comprimirFotoParaBase64(arquivo: File) {
  if (!arquivo.type.startsWith("image/")) {
    return arquivoParaBase64(arquivo);
  }

  const url = URL.createObjectURL(arquivo);

  try {
    const imagem = await carregarImagem(url);
    const maiorLado = Math.max(imagem.naturalWidth, imagem.naturalHeight);
    const escala = maiorLado > FOTO_MAX_DIMENSAO ? FOTO_MAX_DIMENSAO / maiorLado : 1;
    const largura = Math.max(1, Math.round(imagem.naturalWidth * escala));
    const altura = Math.max(1, Math.round(imagem.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;

    const contexto = canvas.getContext("2d");

    if (!contexto) {
      return arquivoParaBase64(arquivo);
    }

    contexto.drawImage(imagem, 0, 0, largura, altura);

    return canvas.toDataURL("image/jpeg", FOTO_QUALIDADE);
  } catch (error) {
    console.error("Erro ao comprimir foto:", error);
    return arquivoParaBase64(arquivo);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function montarFotosPayload(fotos: File[]): Promise<FotoPayload[]> {
  return Promise.all(
    fotos.map(async (foto, index) => ({
      nome: foto.name || `foto-${Date.now()}-${index + 1}.jpg`,
      tipo: "image/jpeg",
      conteudoBase64: await comprimirFotoParaBase64(foto),
    }))
  );
}

function CentralizarMapa({ posicao }: { posicao: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(posicao, MAPA_ZOOM_INICIAL);
  }, [map, posicao]);

  return null;
}

function SelecionarPontoNoMapa({
  aoSelecionar,
}: {
  aoSelecionar: (posicao: [number, number]) => void;
}) {
  useMapEvents({
    click(event) {
      aoSelecionar([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

export default function Atendimento({
  demanda,
  atualizarDemanda,
  voltar,
  abrirGaleria,
  modoDemonstracao = false,
}: Props) {
  const inputFotosRef = useRef<HTMLInputElement | null>(null);
  const coletaLocalizacaoIdRef = useRef(0);
  // Anexos baixados no aparelho (IndexedDB): caminho -> endereco local do arquivo.
  const [anexosLocais, setAnexosLocais] = useState<Record<string, string>>({});
  const [rascunhoInicial] = useState(() =>
    carregarRascunhoColeta(demanda.id)
  );

  const [anexos, setAnexos] = useState<Anexo[]>([]);

  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);

  // Abre os anexos a partir do aparelho quando ja foram baixados (pre-carregamento).
  useEffect(() => {
    let ativo = true;
    const enderecos: string[] = [];

    void Promise.all(
      anexos.map(async (anexo) => {
        const arquivo = await lerAnexoOffline(anexo.caminho_arquivo);
        if (!arquivo) return null;
        const endereco = URL.createObjectURL(arquivo);
        enderecos.push(endereco);
        return [anexo.caminho_arquivo, endereco] as const;
      })
    ).then((pares) => {
      if (!ativo) return;
      const mapa: Record<string, string> = {};
      pares.forEach((par) => {
        if (par) mapa[par[0]] = par[1];
      });
      setAnexosLocais(mapa);
    });

    return () => {
      ativo = false;
      enderecos.forEach((endereco) => URL.revokeObjectURL(endereco));
    };
  }, [anexos]);
  const [pontosColetados, setPontosColetados] = useState<PontoColetado[]>([]);
  const [latitude, setLatitude] = useState<number | null>(
    rascunhoInicial?.latitude ?? null
  );
  const [longitude, setLongitude] = useState<number | null>(
    rascunhoInicial?.longitude ?? null
  );
  const [precisaoGps, setPrecisaoGps] = useState<number | null>(
    rascunhoInicial?.precisaoGps ?? null
  );
  const [observacao, setObservacao] = useState(
    rascunhoInicial?.observacao ?? ""
  );
  const [fotos, setFotos] = useState<File[]>([]);
  const [proximaOrdem, setProximaOrdem] = useState(1);
  const [concluindo, setConcluindo] = useState(false);
  const [coletaPontoIniciada, setColetaPontoIniciada] = useState(
    Boolean(rascunhoInicial)
  );
  const [coletaFotosAtiva, setColetaFotosAtiva] = useState(
    rascunhoInicial?.localConfirmado ?? false
  );
  const [aguardandoConfirmacaoLocal, setAguardandoConfirmacaoLocal] =
    useState(rascunhoInicial?.aguardandoConfirmacao ?? false);
  const [tipoMapaLevantamento, setTipoMapaLevantamento] = useState<"satelite" | "normal">(
    "satelite"
  );
  const [mapaTelaCheia, setMapaTelaCheia] = useState(false);
  const [painelMapaRecolhido, setPainelMapaRecolhido] = useState(false);
  const [layoutMapaCompacto, setLayoutMapaCompacto] = useState(
    () => window.innerWidth <= 700
  );
  const [mensagem, setMensagem] = useState(
    rascunhoInicial
      ? "Rascunho recuperado. Confira a posição e continue a coleta."
      : ""
  );
  const [carregando, setCarregando] = useState(false);
  const [revisaoConclusaoAberta, setRevisaoConclusaoAberta] = useState(false);

  useEffect(() => {
    function atualizarLayoutMapa() {
      setLayoutMapaCompacto(window.innerWidth <= 700);
    }

    window.addEventListener("resize", atualizarLayoutMapa);
    return () => window.removeEventListener("resize", atualizarLayoutMapa);
  }, []);

  useEffect(() => {
    if (!mapaTelaCheia) {
      return;
    }

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflowAnterior;
    };
  }, [mapaTelaCheia]);

  useEffect(() => {
    const chave = chaveRascunhoColeta(demanda.id);

    if (
      !coletaPontoIniciada ||
      latitude === null ||
      longitude === null
    ) {
      localStorage.removeItem(chave);
      return;
    }

    const rascunho: RascunhoColeta = {
      latitude,
      longitude,
      precisaoGps,
      observacao,
      aguardandoConfirmacao: aguardandoConfirmacaoLocal,
      localConfirmado: coletaFotosAtiva,
    };
    localStorage.setItem(chave, JSON.stringify(rascunho));
  }, [
    aguardandoConfirmacaoLocal,
    coletaFotosAtiva,
    coletaPontoIniciada,
    demanda.id,
    latitude,
    longitude,
    observacao,
    precisaoGps,
  ]);

  useEffect(() => {
    let ativo = true;

    async function carregarDados() {
      if (modoDemonstracao) {
        setAnexos([]);
        setPontosColetados(PONTOS_DEMONSTRACAO);
        setProximaOrdem(PONTOS_DEMONSTRACAO.length + 1);
        return;
      }

      try {
        const [anexosResposta, pontosResposta] = await Promise.all([
          authFetch(`${API_BASE_URL}/solicitacoes/${demanda.id}/anexos`),
          authFetch(`${API_BASE_URL}/solicitacoes/${demanda.id}/pontos`),
        ]);

        const anexosDados: Anexo[] = anexosResposta.ok
          ? await anexosResposta.json()
          : carregarAnexosCache(demanda.id);
        const pontosDados: PontoColetado[] = pontosResposta.ok
          ? mesclarPontosPendentes(demanda.id, (await pontosResposta.json()) as PontoColetado[])
          : carregarPontosCache(demanda.id);

        if (!pontosResposta.ok || !anexosResposta.ok) {
          notificar("Não foi possível atualizar tudo do servidor. Parte dos dados vem do aparelho.", "aviso");
        }

        if (!ativo) {
          return;
        }

        setAnexos(anexosDados);
        setPontosColetados(pontosDados);
        salvarAnexosCache(demanda.id, anexosDados);
        salvarPontosCache(demanda.id, pontosDados);

        const maiorOrdem = pontosDados.reduce((maior, ponto, index) => {
          const ordemAtual = ponto.ordem_ponto || pontosDados.length - index;
          return ordemAtual > maior ? ordemAtual : maior;
        }, 0);

        setProximaOrdem(maiorOrdem + 1);
      } catch (error) {
        console.error(error);
        if (!ativo) {
          return;
        }

        const anexosCache = carregarAnexosCache(demanda.id);
        const pontosCache = carregarPontosCache(demanda.id);
        setAnexos(anexosCache);
        setPontosColetados(pontosCache);
        notificar(
          navigator.onLine
            ? "Não foi possível atualizar o levantamento. Mostrando os dados salvos no aparelho."
            : "Sem internet. Mostrando os dados salvos no aparelho.",
          "aviso"
        );

        const maiorOrdem = pontosCache.reduce((maior, ponto, index) => {
          const ordemAtual = ponto.ordem_ponto || pontosCache.length - index;
          return ordemAtual > maior ? ordemAtual : maior;
        }, 0);

        setProximaOrdem(maiorOrdem + 1);
      }
    }

    void carregarDados();

    return () => {
      ativo = false;
    };
  }, [demanda.id, modoDemonstracao]);

  function coletarPonto() {
    if (!navigator.geolocation) {
      setColetaPontoIniciada(false);
      setMensagem("GPS não disponível neste aparelho.");
      notificar("GPS não disponível neste aparelho.", "erro");
      return;
    }

    setColetaPontoIniciada(true);
    setColetaFotosAtiva(false);
    setAguardandoConfirmacaoLocal(false);
    setFotos([]);
    setMensagem("Coletando localizacao do ponto...");
    coletaLocalizacaoIdRef.current += 1;
    const coletaAtualId = coletaLocalizacaoIdRef.current;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (coletaLocalizacaoIdRef.current !== coletaAtualId) {
          return;
        }

        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        // Guarda como ultima posicao conhecida (referencia se o GPS falhar depois).
        salvarPosicaoAtual([pos.coords.latitude, pos.coords.longitude]);
        setPrecisaoGps(
          Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null
        );
        setAguardandoConfirmacaoLocal(true);
        setMensagem(
          "Confira o ponto no mapa. Toque para corrigir se necessario e confirme o local."
        );
      },
      (erro) => {
        if (coletaLocalizacaoIdRef.current !== coletaAtualId) {
          return;
        }

        // Sem GPS a coleta continua: o ponto e marcado a mao no mapa, a partir da
        // ultima posicao conhecida (ou do local da demanda), e a equipe confirma.
        const ultimaPosicao = carregarPosicaoAtual();
        const referencia: [number, number] | null =
          ultimaPosicao ??
          (Number.isFinite(Number(demanda.latitude)) && Number.isFinite(Number(demanda.longitude))
            ? [Number(demanda.latitude), Number(demanda.longitude)]
            : null);

        const motivo =
          erro.code === erro.PERMISSION_DENIED
            ? "Localização não permitida para o FieldPro."
            : erro.code === erro.TIMEOUT
              ? "O GPS demorou para responder."
              : "Sem sinal de GPS no momento.";

        if (!referencia) {
          setColetaPontoIniciada(false);
          setMensagem(`${motivo} Verifique a localização do aparelho e tente de novo.`);
          notificar(`${motivo} Verifique a localização do aparelho e tente de novo.`, "erro");
          return;
        }

        setLatitude(referencia[0]);
        setLongitude(referencia[1]);
        setPrecisaoGps(null);
        setAguardandoConfirmacaoLocal(true);
        setMensagem(
          `${motivo} Toque no mapa ou arraste o alfinete azul até o local do ponto e depois confirme.`
        );
        notificar(`${motivo} Marque o ponto no mapa manualmente.`, "aviso");
      },
      {
        enableHighAccuracy: true,
        // Mais tempo para o GPS "pegar" sem internet; aceita leitura recente (ate 15s).
        timeout: 20000,
        maximumAge: 15000,
      }
    );
  }

  function cancelarColetaPonto() {
    coletaLocalizacaoIdRef.current += 1;
    setColetaPontoIniciada(false);
    setColetaFotosAtiva(false);
    setAguardandoConfirmacaoLocal(false);
    setLatitude(null);
    setLongitude(null);
    setPrecisaoGps(null);
    setObservacao("");
    setFotos([]);
    setMensagem("Coleta cancelada. Você pode iniciar um novo ponto.");
  }

  async function pedirCancelamentoColeta() {
    // So pergunta quando ha algo a perder (fotos ja tiradas neste ponto).
    if (fotos.length > 0) {
      const confirmado = await confirmar({
        titulo: "Cancelar a coleta deste ponto?",
        mensagem: `As ${fotos.length} foto(s) tiradas neste ponto serão descartadas.`,
        confirmarTexto: "Descartar ponto",
        cancelarTexto: "Continuar coletando",
        perigo: true,
      });
      if (!confirmado) return;
    }
    cancelarColetaPonto();
  }

  function confirmarLocalDoPonto() {
    setAguardandoConfirmacaoLocal(false);
    setColetaFotosAtiva(true);
    setMensagem(
      "Local confirmado. Use o botao Coletar foto para tirar uma foto por vez."
    );
  }

  function atualizarPosicaoManual(posicao: [number, number]) {
    setLatitude(posicao[0]);
    setLongitude(posicao[1]);
    setPrecisaoGps(null);
    setMensagem(
      "Ponto ajustado manualmente no mapa. Se estiver correto, confirme o local."
    );
  }

  function abrirCameraParaUmaFoto() {
    if (
      latitude === null ||
      longitude === null ||
      aguardandoConfirmacaoLocal
    ) {
      setMensagem("Confirme o local do ponto antes de coletar fotos.");
      return;
    }

    setColetaFotosAtiva(true);
    inputFotosRef.current?.click();
  }

  function selecionarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";

    if (!arquivo) {
      return;
    }

    setFotos((prev) => [...prev, arquivo]);
    setMensagem("Foto adicionada. Clique novamente em Coletar foto para tirar outra.");
  }

  function encerrarColetaDeFotos() {
    setColetaFotosAtiva(false);

    if (fotos.length === 0) {
      setMensagem("Coleta de fotos encerrada.");
      return;
    }

    setMensagem(`${fotos.length} foto(s) pronta(s) para salvar neste ponto.`);
  }

  async function salvarPonto() {
    if (latitude === null || longitude === null) {
      setMensagem("Colete o ponto primeiro.");
      return;
    }

    if (aguardandoConfirmacaoLocal) {
      setMensagem("Confirme o local do ponto no mapa antes de salvar.");
      return;
    }

    if (coletaFotosAtiva) {
      setMensagem("Encerre a coleta de fotos antes de salvar o ponto.");
      return;
    }

    if (fotos.length === 0) {
      setMensagem("Adicione pelo menos uma foto.");
      return;
    }

    let enviadoParaApi = false;

    try {
      setCarregando(true);
      setMensagem("Salvando...");

      const fotosPayload = await montarFotosPayload(fotos);

      const payload = {
        id_solicitacao: demanda.id,
        ordem_ponto: proximaOrdem,
        latitude,
        longitude,
        observacao,
        fotos: fotosPayload,
      };

      let idPonto = Number(`${Date.now()}${proximaOrdem}`);
      let fotosGuardadas: FotoPendente[] | null = null;

      if (modoDemonstracao) {
        idPonto = -Number(`${Date.now()}${proximaOrdem}`);
      } else if (navigator.onLine) {
        const resposta = await authFetch(`${API_BASE_URL}/pontos-coletados`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
          throw new Error(dados.erro || "Erro ao salvar ponto.");
        }

        idPonto = dados.id_ponto_coletado;
        enviadoParaApi = true;
      } else {
        // Sem internet: fotos vao para o IndexedDB e o ponto entra na fila.
        fotosGuardadas = await guardarFotosPendentes(idPonto, fotosPayload);
        adicionarLevantamentoPendente({
          local_id: idPonto,
          id_solicitacao: demanda.id,
          ordem_ponto: proximaOrdem,
          latitude,
          longitude,
          observacao,
          data_coleta: new Date().toISOString(),
          fotos: fotosGuardadas,
        });
      }

      const novoPonto: PontoColetado = {
        id: idPonto,
        id_solicitacao: demanda.id,
        ordem_ponto: proximaOrdem,
        latitude: String(latitude),
        longitude: String(longitude),
        data_coleta: new Date().toISOString(),
        observacao: observacao || null,
        fotos: fotosPayload.map((foto, index) => ({
          id: -(index + 1),
          id_ponto_coletado: idPonto,
          nome_arquivo: foto.nome,
          caminho_arquivo: "",
          data_foto: new Date().toISOString(),
          data_url: fotosGuardadas
            ? referenciaFotoPendente(fotosGuardadas[index])
            : foto.conteudoBase64,
        })),
      };

      setPontosColetados((prev) => [novoPonto, ...prev]);

      if (enviadoParaApi) {
        // Ja esta na API: o cache nao guarda as fotos em base64 (que enchiam o
        // armazenamento do aparelho) e a lista e recarregada com os caminhos reais.
        adicionarPontoCache(demanda.id, {
          ...novoPonto,
          fotos: novoPonto.fotos.map((foto) => ({ ...foto, data_url: undefined })),
        });
        void authFetch(`${API_BASE_URL}/solicitacoes/${demanda.id}/pontos`)
          .then(async (resposta) => {
            if (!resposta.ok) return;
            const pontosAtualizados = (await resposta.json()) as PontoColetado[];
            salvarPontosCache(demanda.id, mesclarPontosPendentes(demanda.id, pontosAtualizados));
          })
          .catch(() => undefined);
      } else {
        adicionarPontoCache(demanda.id, novoPonto);
      }

      setMensagem(
        navigator.onLine && !modoDemonstracao
          ? `Ponto ${proximaOrdem} salvo com sucesso.`
          : modoDemonstracao
            ? `Ponto ${proximaOrdem} salvo somente nesta demonstração local.`
            : `Ponto ${proximaOrdem} salvo no aparelho para sincronizar depois.`
      );
      setFotos([]);
      setLatitude(null);
      setLongitude(null);
      setPrecisaoGps(null);
      setObservacao("");
      setColetaFotosAtiva(false);
      setAguardandoConfirmacaoLocal(false);
      setColetaPontoIniciada(false);
      setProximaOrdem((prev) => prev + 1);
    } catch (error) {
      console.error(error);

      // O ponto ja foi gravado na API: nao enfileira de novo (evita duplicar).
      if (enviadoParaApi) {
        setMensagem("Ponto salvo, mas houve um erro ao atualizar a tela. Abra o levantamento novamente.");
        return;
      }

      // Armazenamento cheio: nao adianta tentar guardar no aparelho de novo.
      if (error instanceof Error && error.message.startsWith("Armazenamento do aparelho cheio")) {
        setMensagem(error.message);
        return;
      }

      const localId = Number(`${Date.now()}${proximaOrdem}`);
      const fotosPayload = await montarFotosPayload(fotos);

      let fotosPendentes: FotoPendente[];
      try {
        fotosPendentes = await guardarFotosPendentes(localId, fotosPayload);
        adicionarLevantamentoPendente({
          local_id: localId,
          id_solicitacao: demanda.id,
          ordem_ponto: proximaOrdem,
          latitude,
          longitude,
          observacao,
          data_coleta: new Date().toISOString(),
          fotos: fotosPendentes,
        });
      } catch (erroArmazenamento) {
        setMensagem(
          erroArmazenamento instanceof Error
            ? erroArmazenamento.message
            : "Nao foi possivel guardar o ponto no aparelho."
        );
        return;
      }

      const novoPonto: PontoColetado = {
        id: localId,
        id_solicitacao: demanda.id,
        ordem_ponto: proximaOrdem,
        latitude: String(latitude),
        longitude: String(longitude),
        data_coleta: new Date().toISOString(),
        observacao: observacao || null,
        fotos: fotosPayload.map((foto, index) => ({
          id: -(index + 1),
          id_ponto_coletado: localId,
          nome_arquivo: foto.nome,
          caminho_arquivo: "",
          data_foto: new Date().toISOString(),
          data_url: referenciaFotoPendente(fotosPendentes[index]),
        })),
      };

      setPontosColetados((prev) => [novoPonto, ...prev]);
      adicionarPontoCache(demanda.id, novoPonto);
      setFotos([]);
      setLatitude(null);
      setLongitude(null);
      setPrecisaoGps(null);
      setObservacao("");
      setColetaFotosAtiva(false);
      setAguardandoConfirmacaoLocal(false);
      setColetaPontoIniciada(false);
      setProximaOrdem((prev) => prev + 1);
      setMensagem("Sem conexao. O ponto e as fotos foram salvos no aparelho.");
    } finally {
      setCarregando(false);
    }
  }

  async function concluir() {
    if (modoDemonstracao) {
      setMensagem("Demonstração concluída. Nenhum dado foi enviado.");
      return;
    }

    if (coletaPontoIniciada) {
      notificar("Salve ou cancele o ponto em coleta antes de concluir.", "aviso");
      return;
    }

    const dataConclusao = new Date().toISOString();
    const pendentesDaDemanda = carregarLevantamentosPendentes().filter(
      (pendente) => pendente.id_solicitacao === demanda.id
    ).length;

    // Sem internet, ou com pontos desta demanda ainda no aparelho: a conclusao fica
    // guardada e e enviada na sincronizacao, DEPOIS dos pontos (o escritorio nunca
    // recebe a demanda concluida sem os pontos).
    const concluirNoAparelho = () => {
      adicionarConclusaoPendente({
        id_solicitacao: demanda.id,
        solicitacao: demanda.solicitacao,
        data_conclusao: dataConclusao,
      });
      atualizarDemanda?.({ ...demanda, status: "Concluida" });
      notificar(
        pendentesDaDemanda > 0
          ? `Levantamento concluído no aparelho. Será enviado junto com ${pendentesDaDemanda} ponto(s) na próxima sincronização.`
          : "Levantamento concluído no aparelho. Será enviado na próxima sincronização.",
        "sucesso"
      );
      setMensagem("Levantamento concluído. Aguardando sincronização.");
      setTimeout(voltar, 900);
    };

    try {
      setConcluindo(true);

      if (!navigator.onLine || pendentesDaDemanda > 0) {
        concluirNoAparelho();
        return;
      }

      let resposta: Response;
      try {
        resposta = await authFetch(`${API_BASE_URL}/solicitacoes/${demanda.id}/concluir`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data_conclusao: dataConclusao }),
        });
      } catch {
        // Caiu a conexao no meio: guarda no aparelho em vez de perder a conclusao.
        concluirNoAparelho();
        return;
      }

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        throw new Error(dados.erro || "Não foi possível concluir o levantamento.");
      }

      atualizarDemanda?.(dados.demanda ?? { ...demanda, status: "Concluida" });
      notificar("Levantamento concluído e enviado ao escritório.", "sucesso");
      setMensagem("Levantamento concluído.");
      setTimeout(voltar, 800);
    } catch (error) {
      console.error(error);
      notificar(mensagemDeErro(error, "Não foi possível concluir o levantamento."), "erro");
    } finally {
      setConcluindo(false);
    }
  }

  const posicaoPonto: [number, number] | null =
    latitude !== null && longitude !== null ? [latitude, longitude] : null;
  const localPontoConfirmado =
    coletaPontoIniciada &&
    posicaoPonto !== null &&
    !aguardandoConfirmacaoLocal;
  const podeSalvarPonto =
    localPontoConfirmado && fotos.length > 0 && !coletaFotosAtiva;
  const pontoExistenteMuitoProximo = posicaoPonto
    ? pontosColetados.find(
        (ponto) =>
          distanciaEmMetros(posicaoPonto, [
            Number(ponto.latitude),
            Number(ponto.longitude),
          ]) < DISTANCIA_PONTOS_PROXIMOS_METROS
      )
    : undefined;
  const totalFotosColetadas = pontosColetados.reduce(
    (total, ponto) => total + ponto.fotos.length,
    0
  );
  const pontosSemObservacao = pontosColetados.filter(
    (ponto) => !ponto.observacao?.trim()
  ).length;

  function renderizarMapa() {
    return (
      <MapContainer
        center={
          posicaoPonto ||
          (pontosColetados.length > 0
            ? [
                Number(pontosColetados[0].latitude),
                Number(pontosColetados[0].longitude),
              ]
            : [Number(demanda.latitude), Number(demanda.longitude)])
        }
        zoom={MAPA_ZOOM_INICIAL}
        maxZoom={MAPA_ZOOM_MAXIMO}
        style={{ height: "100%", width: "100%" }}
      >
        {tipoMapaLevantamento === "satelite" ? (
          <>
            <TileLayer
              attribution="Tiles &copy; Esri"
              maxNativeZoom={SATELITE_ZOOM_NATIVO_MAXIMO}
              maxZoom={MAPA_ZOOM_MAXIMO}
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <TileLayer
              maxNativeZoom={SATELITE_ZOOM_NATIVO_MAXIMO}
              maxZoom={MAPA_ZOOM_MAXIMO}
              url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            />
          </>
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxNativeZoom={MAPA_RUAS_ZOOM_NATIVO_MAXIMO}
            maxZoom={MAPA_ZOOM_MAXIMO}
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        {posicaoPonto ? (
          <CentralizarMapa posicao={posicaoPonto} />
        ) : pontosColetados.length > 0 ? (
          <CentralizarMapa
            posicao={[
              Number(pontosColetados[0].latitude),
              Number(pontosColetados[0].longitude),
            ]}
          />
        ) : null}
        {posicaoPonto && aguardandoConfirmacaoLocal && (
          <SelecionarPontoNoMapa aoSelecionar={atualizarPosicaoManual} />
        )}
        {posicaoPonto && precisaoGps !== null && (
          <Circle
            center={posicaoPonto}
            radius={precisaoGps}
            pathOptions={{
              color: "#1d4ed8",
              fillColor: "#60a5fa",
              fillOpacity: 0.16,
              weight: 2,
            }}
          />
        )}

        {pontosColetados.map((ponto, index) => {
          const ordem = ponto.ordem_ponto || pontosColetados.length - index;

          return (
            <Marker
              key={ponto.id}
              position={[Number(ponto.latitude), Number(ponto.longitude)]}
              icon={criarIconePonto("#16a34a", String(ordem))}
              riseOnHover
            >
              <Popup>
                <strong>Ponto {ordem}</strong>
                <br />
                {ponto.observacao || "Sem observação"}
                <br />
                {ponto.fotos.length} foto(s)
              </Popup>
            </Marker>
          );
        })}

        {posicaoPonto && (
          <Marker
            position={posicaoPonto}
            icon={criarIconePonto("#1a73e8", String(proximaOrdem))}
            draggable={aguardandoConfirmacaoLocal}
            eventHandlers={{
              dragend(event) {
                const marcador = event.target as L.Marker;
                const posicao = marcador.getLatLng();
                atualizarPosicaoManual([posicao.lat, posicao.lng]);
              },
            }}
          />
        )}
      </MapContainer>
    );
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <div
        style={{
          background: "linear-gradient(90deg, #021B33, #0A3A63, #0B5C7A)",
          color: "white",
          padding: 20,
        }}
      >
        <button
          onClick={voltar}
          style={{
            marginBottom: 10,
            background: "rgba(255,255,255,0.2)",
            border: "none",
            borderRadius: 999,
            width: 40,
            height: 40,
            color: "white",
            fontSize: 20,
          }}
        >
          ‹
        </button>

        <h2 style={{ margin: 0 }}>Atendimento</h2>
        <p>{demanda.solicitacao}</p>
      </div>

      <div style={{ padding: 16 }}>
        <div
          style={{
            background: "white",
            borderRadius: 20,
            padding: 16,
          }}
        >
          <Info label="Cliente" valor={demanda.nome} />
          <Info label="Telefone" valor={demanda.telefone || "-"} />
          <Info label="Municipio" valor={demanda.municipio} />
          <Info label="Descricao" valor={demanda.detalhes || "-"} />
          <Info label="Proximo ponto" valor={`Ponto ${proximaOrdem}`} />

          <div style={{ marginTop: 20 }}>
            <p>Anexos</p>

            {anexos.length === 0 ? (
              <div
                style={{
                  background: "#e2e8f0",
                  padding: 10,
                  borderRadius: 10,
                }}
              >
                Nenhum anexo disponivel.
              </div>
            ) : (
              anexos.map((anexo) => {
                // Preferencia pelo arquivo salvo no aparelho: abre mesmo sem internet.
                const local = anexosLocais[anexo.caminho_arquivo];
                const indisponivel = !local && !online;

                return (
                  <a
                    key={anexo.id}
                    href={indisponivel ? undefined : local ?? authUrl(anexo.caminho_arquivo)}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={indisponivel}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      marginTop: 6,
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: indisponivel ? "#f1f5f9" : "#eff6ff",
                      color: indisponivel ? "#94a3b8" : "#1d4ed8",
                      fontWeight: 600,
                      textDecoration: "none",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      📎 {anexo.nome_arquivo}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: local ? "#15803d" : "#94a3b8" }}>
                      {local ? "✓ no aparelho" : indisponivel ? "precisa de internet" : ""}
                    </span>
                  </a>
                );
              })
            )}
          </div>

          <button
            onClick={
              coletaPontoIniciada ? () => void pedirCancelamentoColeta() : coletarPonto
            }
            style={{
              marginTop: 20,
              width: "100%",
              height: 50,
              borderRadius: 16,
              background: coletaPontoIniciada ? "#dc2626" : "#0A3A63",
              color: "white",
              fontWeight: "bold",
              border: "none",
              cursor: "pointer",
            }}
          >
            {coletaPontoIniciada ? "Cancelar coleta" : "Coletar ponto"}
          </button>

          <input
            ref={inputFotosRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={selecionarFotos}
            style={{ display: "none" }}
          />

          <div
            style={{
              marginTop: 14,
              borderRadius: 20,
              overflow: "hidden",
              border: "1px solid #dbe4ee",
              background: "#f8fafc",
            }}
          >
            <div style={{ padding: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <strong style={{ color: "#0f172a" }}>
                  Mapa dos pontos coletados
                </strong>

                <button
                  type="button"
                  onClick={() => {
                    setPainelMapaRecolhido(false);
                    setMapaTelaCheia(true);
                  }}
                  style={{
                    marginLeft: "auto",
                    border: "1px solid #cbd5e1",
                    borderRadius: 12,
                    background: "white",
                    color: "#0A3A63",
                    padding: "8px 12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Abrir em tela cheia
                </button>

                <div
                  style={{
                    display: "inline-flex",
                    border: "1px solid #cbd5e1",
                    borderRadius: 999,
                    overflow: "hidden",
                    background: "white",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setTipoMapaLevantamento("satelite")}
                    style={{
                      border: "none",
                      padding: "8px 12px",
                      background:
                        tipoMapaLevantamento === "satelite" ? "#0A3A63" : "white",
                      color:
                        tipoMapaLevantamento === "satelite" ? "white" : "#334155",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Satelite
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoMapaLevantamento("normal")}
                    style={{
                      border: "none",
                      borderLeft: "1px solid #cbd5e1",
                      padding: "8px 12px",
                      background:
                        tipoMapaLevantamento === "normal" ? "#0A3A63" : "white",
                      color:
                        tipoMapaLevantamento === "normal" ? "white" : "#334155",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Mapa
                  </button>
                </div>
              </div>
              <p style={{ margin: "6px 0 0 0", color: "#475569", fontSize: 14 }}>
                Enquanto voce coleta o ponto atual, o mapa mostra os pontos ja
                registrados da demanda.
              </p>
            </div>

            <div style={{ height: "min(52vh, 520px)", minHeight: 380 }}>
              {renderizarMapa()}
            </div>

            {posicaoPonto && (
              <div
                style={{
                  padding: 14,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    flex: "1 1 220px",
                    fontSize: 13,
                    color: "#475569",
                    lineHeight: 1.5,
                  }}
                >
                  Lat: {latitude}
                  <br />
                  Lng: {longitude}
                  {precisaoGps !== null && (
                    <>
                      <br />
                      Precisão estimada: ±{Math.round(precisaoGps)} m
                    </>
                  )}
                  {pontoExistenteMuitoProximo && (
                    <div
                      style={{
                        marginTop: 8,
                        color: "#b45309",
                        fontWeight: 700,
                      }}
                    >
                      Atenção: este local está a menos de 2 metros do ponto{" "}
                      {pontoExistenteMuitoProximo.ordem_ponto}.
                    </div>
                  )}
                </div>

                {aguardandoConfirmacaoLocal && (
                  <button
                    onClick={confirmarLocalDoPonto}
                    style={{
                      flex: "1 1 220px",
                      height: 46,
                      borderRadius: 14,
                      border: "none",
                      background: "#16a34a",
                      color: "white",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Confirmar local do ponto
                  </button>
                )}
              </div>
            )}
          </div>

          {fotos.length > 0 && (
            <p style={{ marginTop: 12 }}>{fotos.length} foto(s) selecionada(s)</p>
          )}

          {localPontoConfirmado && (
            <button
              onClick={abrirCameraParaUmaFoto}
              style={{
                marginTop: 10,
                width: "100%",
                height: 50,
                borderRadius: 16,
                border: "none",
                background: "#2563eb",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Coletar foto
            </button>
          )}

          {coletaFotosAtiva && (
              <button
                onClick={encerrarColetaDeFotos}
                style={{
                  marginTop: 10,
                  width: "100%",
                  height: 46,
                  borderRadius: 16,
                  border: "1px solid #cbd5e1",
                  background: "#fff7ed",
                  color: "#9a3412",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Encerrar coleta de fotos
              </button>
          )}

          <textarea
            placeholder={`Observacao do Ponto ${proximaOrdem}`}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            style={{
              width: "100%",
              marginTop: 10,
              borderRadius: 12,
              padding: 10,
            }}
          />

          {mensagem && (
            <div
              key={mensagem}
              role="status"
              className="fp-tela"
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 12,
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                color: "#1e3a8a",
                fontSize: 14,
                fontWeight: 600,
                textAlign: "left",
              }}
            >
              {mensagem}
            </div>
          )}

          <button
            onClick={() => void salvarPonto()}
            disabled={!podeSalvarPonto || carregando}
            style={{
              marginTop: 10,
              width: "100%",
              height: 50,
              background: "#16a34a",
              color: "white",
              border: "none",
              borderRadius: 16,
              cursor: podeSalvarPonto && !carregando ? "pointer" : "not-allowed",
              opacity: podeSalvarPonto && !carregando ? 1 : 0.55,
            }}
          >
            {carregando
              ? <><span className="fp-spinner" aria-hidden="true" />Salvando...</>
              : fotos.length === 0
                ? "Adicione uma foto para salvar"
                : coletaFotosAtiva
                  ? "Encerre a coleta de fotos para salvar"
                  : `Salvar Ponto ${proximaOrdem}`}
          </button>

          {/* Durante a coleta de um ponto, concluir e abrir a galeria ficam bloqueados:
              sair da tela no meio da coleta perderia o ponto em andamento. */}
          {coletaPontoIniciada && (
            <div className="fp-dica-bloqueio" role="status">
              Ponto em coleta: salve ou cancele o ponto para concluir o
              levantamento ou ver a galeria.
            </div>
          )}

          <button
            type="button"
            onClick={() => setRevisaoConclusaoAberta(true)}
            disabled={coletaPontoIniciada || carregando || concluindo}
            aria-disabled={coletaPontoIniciada || carregando || concluindo}
            style={{
              marginTop: 10,
              width: "100%",
              height: 50,
              background: "#0A3A63",
              color: "white",
              border: "none",
              borderRadius: 16,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {concluindo ? (
              <>
                <span className="fp-spinner" aria-hidden="true" />
                Concluindo...
              </>
            ) : (
              "Concluir levantamento"
            )}
          </button>

          <button
            type="button"
            onClick={abrirGaleria}
            disabled={coletaPontoIniciada || carregando || concluindo}
            aria-disabled={coletaPontoIniciada || carregando || concluindo}
            style={{
              width: "100%",
              height: 52,
              borderRadius: 18,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#0A3A63",
              fontWeight: 800,
              fontSize: 16,
              cursor: "pointer",
              marginTop: 12,
            }}
          >
            Ver galeria da demanda
          </button>
        </div>
      </div>

      {revisaoConclusaoAberta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Revisão do levantamento"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 11000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(15, 23, 42, 0.72)",
          }}
        >
          <div
            style={{
              width: "min(460px, 100%)",
              borderRadius: 24,
              background: "white",
              padding: 22,
              boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
            }}
          >
            <h2 style={{ margin: 0, color: "#0f172a" }}>
              Revisar levantamento
            </h2>
            <p style={{ color: "#64748b", lineHeight: 1.5 }}>
              Confira o resumo antes de concluir. Depois da confirmação, a
              demanda será enviada como concluída.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                margin: "18px 0",
              }}
            >
              <ResumoRevisao
                titulo="Pontos"
                valor={pontosColetados.length}
              />
              <ResumoRevisao titulo="Fotos" valor={totalFotosColetadas} />
            </div>

            {pontosColetados.length === 0 && (
              <AvisoRevisao texto="Nenhum ponto foi coletado." />
            )}
            {pontosSemObservacao > 0 && (
              <AvisoRevisao
                texto={`${pontosSemObservacao} ponto(s) estão sem observação.`}
              />
            )}
            {coletaPontoIniciada && (
              <AvisoRevisao texto="Existe uma coleta em andamento. Salve ou cancele antes de concluir." />
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setRevisaoConclusaoAberta(false)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  border: "1px solid #cbd5e1",
                  background: "white",
                  color: "#334155",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={
                  pontosColetados.length === 0 || coletaPontoIniciada
                }
                onClick={() => {
                  setRevisaoConclusaoAberta(false);
                  void concluir();
                }}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  border: "none",
                  background: "#0A3A63",
                  color: "white",
                  fontWeight: 800,
                  cursor:
                    pontosColetados.length === 0 || coletaPontoIniciada
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    pontosColetados.length === 0 || coletaPontoIniciada
                      ? 0.5
                      : 1,
                }}
              >
                Confirmar conclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {mapaTelaCheia && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Coleta de pontos em tela cheia"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            background: "#0f172a",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
            {renderizarMapa()}

            <div
              style={{
                position: "absolute",
                top: 16,
                left: 56,
                zIndex: 1000,
                borderRadius: 14,
                padding: "10px 14px",
                background: "rgba(2, 27, 51, 0.9)",
                color: "white",
                boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              }}
            >
              <strong>Ponto {proximaOrdem}</strong>
              <div style={{ marginTop: 2, fontSize: 12, opacity: 0.85 }}>
                Aproxime e toque no mapa para ajustar a posição.
              </div>
            </div>

            {painelMapaRecolhido && (
              <button
                type="button"
                onClick={() => setPainelMapaRecolhido(false)}
                aria-label="Abrir controles da coleta"
                style={{
                  position: "absolute",
                  top: layoutMapaCompacto ? "auto" : "50%",
                  right: layoutMapaCompacto ? "50%" : 0,
                  bottom: layoutMapaCompacto ? 12 : "auto",
                  zIndex: 1000,
                  transform: layoutMapaCompacto
                    ? "translateX(50%)"
                    : "translateY(-50%)",
                  width: layoutMapaCompacto ? 72 : 48,
                  height: layoutMapaCompacto ? 48 : 72,
                  border: "none",
                  borderRadius: layoutMapaCompacto
                    ? "16px 16px 0 0"
                    : "16px 0 0 16px",
                  background: "#f8fafc",
                  color: "#0A3A63",
                  boxShadow: "-6px 0 18px rgba(15, 23, 42, 0.24)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {layoutMapaCompacto ? (
                  <ChevronUp size={28} strokeWidth={2.5} />
                ) : (
                  <ChevronLeft size={28} strokeWidth={2.5} />
                )}
              </button>
            )}
          </div>

          <aside
            style={{
              boxSizing: "border-box",
              position: layoutMapaCompacto ? "absolute" : "relative",
              left: layoutMapaCompacto ? 0 : "auto",
              right: layoutMapaCompacto ? 0 : "auto",
              bottom: layoutMapaCompacto ? 0 : "auto",
              zIndex: layoutMapaCompacto ? 1001 : "auto",
              width: layoutMapaCompacto
                ? "100%"
                : painelMapaRecolhido
                  ? 0
                  : "clamp(280px, 30vw, 380px)",
              maxHeight: layoutMapaCompacto ? "52dvh" : "none",
              background: "#f8fafc",
              padding: painelMapaRecolhido
                ? 0
                : layoutMapaCompacto
                  ? "14px 14px calc(14px + env(safe-area-inset-bottom))"
                  : 18,
              overflowY: painelMapaRecolhido ? "hidden" : "auto",
              overflowX: "hidden",
              borderRadius: layoutMapaCompacto ? "22px 22px 0 0" : 0,
              boxShadow: layoutMapaCompacto
                ? "0 -8px 28px rgba(15, 23, 42, 0.28)"
                : "-8px 0 24px rgba(15, 23, 42, 0.22)",
              transform:
                layoutMapaCompacto && painelMapaRecolhido
                  ? "translateY(100%)"
                  : "translateY(0)",
              transition:
                "width 220ms ease, padding 220ms ease, transform 220ms ease",
            }}
          >
            <div
              style={{
                display: painelMapaRecolhido ? "none" : "block",
                minWidth: layoutMapaCompacto ? 0 : 244,
              }}
            >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div>
                <strong style={{ color: "#0f172a", fontSize: 18 }}>
                  Coleta de pontos
                </strong>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 3 }}>
                  {pontosColetados.length} ponto(s) registrado(s)
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPainelMapaRecolhido(true)}
                  aria-label="Recolher controles"
                  title="Recolher controles"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    background: "white",
                    color: "#0A3A63",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {layoutMapaCompacto ? (
                    <ChevronDown size={24} strokeWidth={2.5} />
                  ) : (
                    <ChevronRight size={24} strokeWidth={2.5} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMapaTelaCheia(false)}
                  aria-label="Fechar tela cheia"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    background: "white",
                    color: "#0f172a",
                    fontSize: 22,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setTipoMapaLevantamento((atual) =>
                  atual === "satelite" ? "normal" : "satelite"
                )
              }
              style={{
                width: "100%",
                height: 46,
                borderRadius: 14,
                border: "1px solid #0A3A63",
                background: "white",
                color: "#0A3A63",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {tipoMapaLevantamento === "satelite"
                ? "Usar mapa"
                : "Usar satélite"}
            </button>

            <div
              style={{
                margin: "14px 0",
                padding: 12,
                borderRadius: 14,
                background: "#e2e8f0",
                color: "#334155",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {posicaoPonto ? (
                <>
                  Lat: {latitude}
                  <br />
                  Lng: {longitude}
                  {precisaoGps !== null && (
                    <>
                      <br />
                      Precisão estimada: ±{Math.round(precisaoGps)} m
                    </>
                  )}
                  {pontoExistenteMuitoProximo && (
                    <>
                      <br />
                      <strong style={{ color: "#b45309" }}>
                        Próximo do ponto{" "}
                        {pontoExistenteMuitoProximo.ordem_ponto} (&lt; 2 m)
                      </strong>
                    </>
                  )}
                </>
              ) : (
                "Clique em Coletar ponto para obter a posição atual."
              )}
            </div>

            <button
              type="button"
              onClick={
                coletaPontoIniciada ? () => void pedirCancelamentoColeta() : coletarPonto
              }
              style={{
                width: "100%",
                height: 50,
                borderRadius: 14,
                border: "none",
                background: coletaPontoIniciada ? "#dc2626" : "#0A3A63",
                color: "white",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {coletaPontoIniciada ? "Cancelar coleta" : "Coletar ponto"}
            </button>

            {aguardandoConfirmacaoLocal && (
              <button
                type="button"
                onClick={confirmarLocalDoPonto}
                style={{
                  marginTop: 10,
                  width: "100%",
                  height: 50,
                  borderRadius: 14,
                  border: "none",
                  background: "#16a34a",
                  color: "white",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Confirmar local do ponto
              </button>
            )}

            {localPontoConfirmado && (
                <button
                  type="button"
                  onClick={abrirCameraParaUmaFoto}
                  style={{
                    marginTop: 10,
                    width: "100%",
                    height: 50,
                    borderRadius: 14,
                    border: "none",
                    background: "#2563eb",
                    color: "white",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Coletar foto
                </button>
            )}

            {coletaFotosAtiva && (
                <button
                  type="button"
                  onClick={encerrarColetaDeFotos}
                  style={{
                    marginTop: 10,
                    width: "100%",
                    height: 46,
                    borderRadius: 14,
                    border: "1px solid #fed7aa",
                    background: "#fff7ed",
                    color: "#9a3412",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Encerrar coleta de fotos
                </button>
            )}

            {posicaoPonto && (
              <>
                <textarea
                  placeholder={`Observação do Ponto ${proximaOrdem}`}
                  value={observacao}
                  onChange={(event) => setObservacao(event.target.value)}
                  style={{
                    boxSizing: "border-box",
                    width: "100%",
                    minHeight: 84,
                    marginTop: 12,
                    borderRadius: 14,
                    border: "1px solid #cbd5e1",
                    padding: 12,
                    resize: "vertical",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void salvarPonto()}
                  disabled={!podeSalvarPonto || carregando}
                  style={{
                    marginTop: 10,
                    width: "100%",
                    height: 50,
                    borderRadius: 14,
                    border: "none",
                    background: "#16a34a",
                    color: "white",
                    fontWeight: 800,
                    cursor:
                      podeSalvarPonto && !carregando
                        ? "pointer"
                        : "not-allowed",
                    opacity: podeSalvarPonto && !carregando ? 1 : 0.55,
                  }}
                >
                  {carregando
                    ? "Salvando..."
                    : fotos.length === 0
                      ? "Adicione uma foto para salvar"
                      : coletaFotosAtiva
                        ? "Encerre as fotos para salvar"
                        : `Salvar Ponto ${proximaOrdem}`}
                </button>
              </>
            )}

            {fotos.length > 0 && (
              <div style={{ marginTop: 10, color: "#475569", fontSize: 13 }}>
                {fotos.length} foto(s) coletada(s)
              </div>
            )}

            {mensagem && (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 14,
                  padding: 12,
                  background: "#e0f2fe",
                  color: "#075985",
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                {mensagem}
              </div>
            )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <small>{label}</small>
      <div style={{ fontWeight: "bold" }}>{valor}</div>
    </div>
  );
}

function ResumoRevisao({
  titulo,
  valor,
}: {
  titulo: string;
  valor: number;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        background: "#f1f5f9",
        padding: 14,
        textAlign: "center",
      }}
    >
      <div style={{ color: "#64748b", fontSize: 13 }}>{titulo}</div>
      <strong style={{ color: "#0f172a", fontSize: 24 }}>{valor}</strong>
    </div>
  );
}

function AvisoRevisao({ texto }: { texto: string }) {
  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: 12,
        background: "#fff7ed",
        color: "#9a3412",
        padding: 11,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {texto}
    </div>
  );
}
