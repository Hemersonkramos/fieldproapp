import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { Demanda } from "../App";
import {
  adicionarLevantamentoPendente,
  adicionarPontoCache,
  carregarAnexosCache,
  carregarPontosCache,
  salvarAnexosCache,
  salvarPontosCache,
  type CachedAttachment,
  type CachedPoint,
} from "../lib/offlineStorage";
import { API_BASE_URL, authFetch, authUrl } from "../lib/api";

type Anexo = CachedAttachment;
type PontoColetado = CachedPoint;

type Props = {
  demanda: Demanda;
  voltar: () => void;
  abrirGaleria: () => void;
};

type FotoPayload = {
  nome: string;
  tipo: string;
  conteudoBase64: string;
};

const FOTO_MAX_DIMENSAO = 1600;
const FOTO_QUALIDADE = 0.75;

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
    map.setView(posicao, 21);
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

export default function Atendimento({ demanda, voltar, abrirGaleria }: Props) {
  const inputFotosRef = useRef<HTMLInputElement | null>(null);

  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [pontosColetados, setPontosColetados] = useState<PontoColetado[]>([]);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [proximaOrdem, setProximaOrdem] = useState(1);
  const [coletaFotosAtiva, setColetaFotosAtiva] = useState(false);
  const [aguardandoConfirmacaoLocal, setAguardandoConfirmacaoLocal] =
    useState(false);
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let ativo = true;

    async function carregarDados() {
      try {
        const [anexosResposta, pontosResposta] = await Promise.all([
          authFetch(`${API_BASE_URL}/solicitacoes/${demanda.id}/anexos`),
          authFetch(`${API_BASE_URL}/solicitacoes/${demanda.id}/pontos`),
        ]);

        const anexosDados: Anexo[] = anexosResposta.ok
          ? await anexosResposta.json()
          : carregarAnexosCache(demanda.id);
        const pontosDados: PontoColetado[] = pontosResposta.ok
          ? await pontosResposta.json()
          : carregarPontosCache(demanda.id);

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
  }, [demanda.id]);

  function coletarPonto() {
    if (!navigator.geolocation) {
      setMensagem("GPS nao disponivel.");
      return;
    }

    setColetaFotosAtiva(false);
    setAguardandoConfirmacaoLocal(false);
    setFotos([]);
    setMensagem("Coletando localizacao do ponto...");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setAguardandoConfirmacaoLocal(true);
        setMensagem(
          "Confira o ponto no mapa. Toque para corrigir se necessario e confirme o local."
        );
      },
      () => {
        setMensagem("Erro ao obter localizacao.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
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
    setMensagem(
      "Ponto ajustado manualmente no mapa. Se estiver correto, confirme o local."
    );
  }

  function abrirCameraParaUmaFoto() {
    if (!coletaFotosAtiva) {
      setMensagem("Confirme o local do ponto antes de coletar fotos.");
      return;
    }

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

      if (navigator.onLine) {
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
      } else {
        adicionarLevantamentoPendente({
          local_id: idPonto,
          id_solicitacao: demanda.id,
          ordem_ponto: proximaOrdem,
          latitude,
          longitude,
          observacao,
          data_coleta: new Date().toISOString(),
          fotos: fotosPayload,
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
          data_url: foto.conteudoBase64,
        })),
      };

      setPontosColetados((prev) => [novoPonto, ...prev]);
      adicionarPontoCache(demanda.id, novoPonto);
      setMensagem(
        navigator.onLine
          ? `Ponto ${proximaOrdem} salvo com sucesso.`
          : `Ponto ${proximaOrdem} salvo no aparelho para sincronizar depois.`
      );
      setFotos([]);
      setLatitude(null);
      setLongitude(null);
      setObservacao("");
      setColetaFotosAtiva(false);
      setAguardandoConfirmacaoLocal(false);
      setProximaOrdem((prev) => prev + 1);
    } catch (error) {
      console.error(error);
      const localId = Number(`${Date.now()}${proximaOrdem}`);
      const fotosPayload = await montarFotosPayload(fotos);

      adicionarLevantamentoPendente({
        local_id: localId,
        id_solicitacao: demanda.id,
        ordem_ponto: proximaOrdem,
        latitude,
        longitude,
        observacao,
        data_coleta: new Date().toISOString(),
        fotos: fotosPayload,
      });

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
          data_url: foto.conteudoBase64,
        })),
      };

      setPontosColetados((prev) => [novoPonto, ...prev]);
      adicionarPontoCache(demanda.id, novoPonto);
      setFotos([]);
      setLatitude(null);
      setLongitude(null);
      setObservacao("");
      setColetaFotosAtiva(false);
      setAguardandoConfirmacaoLocal(false);
      setProximaOrdem((prev) => prev + 1);
      setMensagem("Sem conexao. O ponto e as fotos foram salvos no aparelho.");
    } finally {
      setCarregando(false);
    }
  }

  async function concluir() {
    await authFetch(`${API_BASE_URL}/solicitacoes/${demanda.id}/concluir`, {
      method: "PUT",
    });

    setMensagem("Levantamento concluido.");
    setTimeout(voltar, 800);
  }

  const posicaoPonto: [number, number] | null =
    latitude !== null && longitude !== null ? [latitude, longitude] : null;

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
              anexos.map((anexo) => (
                <a
                  key={anexo.id}
                  href={authUrl(anexo.caminho_arquivo)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {anexo.nome_arquivo}
                </a>
              ))
            )}
          </div>

          <button
            onClick={coletarPonto}
            style={{
              marginTop: 20,
              width: "100%",
              height: 50,
              borderRadius: 16,
              background: "#0A3A63",
              color: "white",
              fontWeight: "bold",
              border: "none",
            }}
          >
            Coletar ponto
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
              <strong style={{ color: "#0f172a" }}>
                Mapa dos pontos coletados
              </strong>
              <p style={{ margin: "6px 0 0 0", color: "#475569", fontSize: 14 }}>
                Enquanto voce coleta o ponto atual, o mapa mostra os pontos ja
                registrados da demanda.
              </p>
            </div>

            <div style={{ height: "min(52vh, 520px)", minHeight: 380 }}>
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
                zoom={21}
                maxZoom={22}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
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

                {pontosColetados.map((ponto, index) => {
                  const ordem = ponto.ordem_ponto || pontosColetados.length - index;

                  return (
                    <Marker
                      key={ponto.id}
                      position={[Number(ponto.latitude), Number(ponto.longitude)]}
                      icon={criarIconePonto("#16a34a", String(ordem))}
                    />
                  );
                })}

                {posicaoPonto && (
                  <Marker
                    position={posicaoPonto}
                    icon={criarIconePonto("#1a73e8", String(proximaOrdem))}
                  />
                )}
              </MapContainer>
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

          {coletaFotosAtiva && (
            <>
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
            </>
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

          {mensagem && <div style={{ marginTop: 10 }}>{mensagem}</div>}

          <button
            onClick={() => void salvarPonto()}
            style={{
              marginTop: 10,
              width: "100%",
              height: 50,
              background: "#16a34a",
              color: "white",
              border: "none",
              borderRadius: 16,
            }}
          >
            {carregando ? "Salvando..." : `Salvar Ponto ${proximaOrdem}`}
          </button>

          <button
            onClick={() => void concluir()}
            style={{
              marginTop: 10,
              width: "100%",
              height: 50,
              background: "#0A3A63",
              color: "white",
              border: "none",
              borderRadius: 16,
            }}
          >
            Concluir levantamento
          </button>

          <button
            onClick={abrirGaleria}
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
