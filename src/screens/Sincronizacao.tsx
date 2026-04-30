import { useState } from "react";
import BottomNav from "../components/BottomNav";
import {
  carregarLevantamentosPendentes,
  carregarPontosRotaPendentes,
  contarFotosPendentes,
  removerLevantamentoPendente,
  salvarPontosRotaPendentes,
} from "../lib/offlineStorage";
import { API_BASE_URL, authFetch } from "../lib/api";
import type { UsuarioLogado } from "../App";

type Props = {
  usuario: UsuarioLogado | null;
  setTela: (tela: "inicio" | "demandas" | "mapa" | "sincronizacao") => void;
};

type PontoPendente = ReturnType<typeof carregarPontosRotaPendentes>[number];

const FOTO_MAX_DIMENSAO = 1600;
const FOTO_QUALIDADE = 0.75;

function carregarImagem(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const imagem = new Image();
    imagem.onload = () => resolve(imagem);
    imagem.onerror = () => reject(new Error("Erro ao carregar foto pendente."));
    imagem.src = src;
  });
}

async function recomprimirBase64Imagem(conteudoBase64: string) {
  if (!conteudoBase64.startsWith("data:image/")) {
    return conteudoBase64;
  }

  try {
    const imagem = await carregarImagem(conteudoBase64);
    const maiorLado = Math.max(imagem.naturalWidth, imagem.naturalHeight);
    const escala = maiorLado > FOTO_MAX_DIMENSAO ? FOTO_MAX_DIMENSAO / maiorLado : 1;
    const largura = Math.max(1, Math.round(imagem.naturalWidth * escala));
    const altura = Math.max(1, Math.round(imagem.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;

    const contexto = canvas.getContext("2d");

    if (!contexto) {
      return conteudoBase64;
    }

    contexto.drawImage(imagem, 0, 0, largura, altura);
    return canvas.toDataURL("image/jpeg", FOTO_QUALIDADE);
  } catch (error) {
    console.error("Erro ao recomprimir foto pendente:", error);
    return conteudoBase64;
  }
}

export default function Sincronizacao({ usuario, setTela }: Props) {
  const idEquipe = usuario?.id_equipe ?? 0;
  const [pontosPendentes, setPontosPendentes] = useState<PontoPendente[]>(
    () => (idEquipe ? carregarPontosRotaPendentes(idEquipe) : [])
  );
  const [levantamentosPendentes, setLevantamentosPendentes] = useState(
    () => carregarLevantamentosPendentes().length
  );
  const [fotosPendentes, setFotosPendentes] = useState(contarFotosPendentes);
  const [mensagem, setMensagem] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [ultimaSync, setUltimaSync] = useState<string>(
    () => localStorage.getItem("fieldpro_ultima_sync") || "Ainda nao sincronizado"
  );

  function carregarPendencias() {
    setPontosPendentes(idEquipe ? carregarPontosRotaPendentes(idEquipe) : []);
    setLevantamentosPendentes(carregarLevantamentosPendentes().length);
    setFotosPendentes(contarFotosPendentes());
  }

  async function sincronizarAgora() {
    if (!idEquipe) {
      setMensagem("Equipe nao identificada. Faca login novamente.");
      return;
    }

    if (!navigator.onLine) {
      setMensagem("Sem internet. Tente sincronizar quando estiver online.");
      return;
    }

    const pontosRotaAtuais = carregarPontosRotaPendentes(idEquipe);
    const levantamentosAtuais = carregarLevantamentosPendentes();
    setPontosPendentes(pontosRotaAtuais);
    setLevantamentosPendentes(levantamentosAtuais.length);
    setFotosPendentes(
      levantamentosAtuais.reduce((total, levantamento) => total + levantamento.fotos.length, 0)
    );

    if (
      pontosRotaAtuais.length === 0 &&
      levantamentosAtuais.length === 0
    ) {
      setMensagem("Nao existem dados pendentes para sincronizar.");
      return;
    }

    try {
      setSincronizando(true);
      setProgresso(0);
      setMensagem("Sincronizando dados...");

      const totalEtapas = pontosRotaAtuais.length + levantamentosAtuais.length;
      let etapasConcluidas = 0;
      const atualizarProgresso = () => {
        etapasConcluidas += 1;
        setProgresso(totalEtapas === 0 ? 100 : Math.round((etapasConcluidas / totalEtapas) * 100));
      };

      for (let index = 0; index < pontosRotaAtuais.length; index += 10) {
        const lote = pontosRotaAtuais.slice(index, index + 10);

        await Promise.all(
          lote.map(async (ponto) => {
            const resposta = await authFetch(`${API_BASE_URL}/rota`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(ponto),
            });

            if (!resposta.ok) {
              const dados = await resposta.json().catch(() => ({}));
              throw new Error(dados.erro || "Erro ao sincronizar ponto de rota.");
            }

            atualizarProgresso();
          })
        );
      }

      for (const levantamento of levantamentosAtuais) {
        setMensagem(
          `Enviando levantamento ${etapasConcluidas - pontosRotaAtuais.length + 1} de ${levantamentosAtuais.length}...`
        );

        const resposta = await authFetch(`${API_BASE_URL}/pontos-coletados`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id_solicitacao: levantamento.id_solicitacao,
            ordem_ponto: levantamento.ordem_ponto,
            latitude: levantamento.latitude,
            longitude: levantamento.longitude,
            observacao: levantamento.observacao,
            fotos: await Promise.all(
              levantamento.fotos.map(async (foto, index) => ({
                nome: foto.nome || `foto-pendente-${levantamento.local_id}-${index + 1}.jpg`,
                tipo: "image/jpeg",
                conteudoBase64: await recomprimirBase64Imagem(foto.conteudoBase64),
              }))
            ),
          }),
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
          throw new Error(dados.erro || "Erro ao sincronizar levantamento.");
        }

        removerLevantamentoPendente(levantamento.local_id);
        atualizarProgresso();
      }

      salvarPontosRotaPendentes(idEquipe, []);

      const agora = new Date().toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      localStorage.setItem("fieldpro_ultima_sync", agora);
      setUltimaSync(agora);
      setProgresso(100);
      carregarPendencias();
      setMensagem("Sincronizacao concluida com sucesso.");
    } catch (error) {
      console.error(error);
      setMensagem("Erro ao sincronizar. Os dados continuam salvos no aparelho.");
    } finally {
      setSincronizando(false);
    }
  }

  const totalPendencias =
    pontosPendentes.length + levantamentosPendentes + fotosPendentes;
  const progressoAtual = totalPendencias === 0 ? 100 : progresso;

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      <div
        style={{
          background: "linear-gradient(90deg, #021B33, #0A3A63, #0B5C7A)",
          color: "white",
          padding: "20px 20px 28px",
        }}
      >
        <h1 style={{ margin: 0, color: "white", fontSize: 28 }}>
          Sincronizacao
        </h1>
        <p style={{ marginTop: 8, marginBottom: 0 }}>
          Status de envio dos dados
        </p>
      </div>

      <div style={{ padding: 16 }}>
        <div
          style={{
            background: "white",
            borderRadius: 28,
            padding: 20,
            boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 22,
            }}
          >
            <div>
              <div style={{ fontSize: 14, color: "#64748b" }}>
                Ultima sincronizacao
              </div>
              <strong style={{ fontSize: 16 }}>{ultimaSync}</strong>
            </div>

            <span
              style={{
                background: navigator.onLine ? "#dcfce7" : "#fee2e2",
                color: navigator.onLine ? "#15803d" : "#b91c1c",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {navigator.onLine ? "OK" : "Offline"}
            </span>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>
              Progresso de upload
            </div>

            <div
              style={{
                height: 12,
                background: "#e2e8f0",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progressoAtual}%`,
                  background: "#0f172a",
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                background: "#f1f5f9",
                borderRadius: 20,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Fotos pendentes
              </div>
              <strong style={{ fontSize: 28 }}>{fotosPendentes}</strong>
            </div>

            <div
              style={{
                background: "#f1f5f9",
                borderRadius: 20,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Pontos de rota pendentes
              </div>
              <strong style={{ fontSize: 28 }}>{pontosPendentes.length}</strong>
            </div>

            <div
              style={{
                background: "#f1f5f9",
                borderRadius: 20,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Levantamentos pendentes
              </div>
              <strong style={{ fontSize: 28 }}>{levantamentosPendentes}</strong>
            </div>
          </div>

          <button
            onClick={() => void sincronizarAgora()}
            disabled={sincronizando}
            style={{
              width: "100%",
              height: 52,
              borderRadius: 18,
              border: "none",
              background: "#0A3A63",
              color: "white",
              fontWeight: 800,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {sincronizando ? "Sincronizando..." : "↑ Sincronizar agora"}
          </button>

          {mensagem && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 14,
                background: "#dbeafe",
                color: "#1d4ed8",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {mensagem}
            </div>
          )}

          <div
            style={{
              marginTop: 18,
              border: "1px dashed #cbd5e1",
              borderRadius: 18,
              padding: 16,
              color: "#334155",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Em locais sem internet, o app salva rota, demandas e levantamentos no
            aparelho e envia depois pela sincronizacao.
          </div>
        </div>
      </div>

      <BottomNav telaAtual="sincronizacao" setTela={setTela} />
    </div>
  );
}
