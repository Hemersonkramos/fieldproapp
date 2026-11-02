import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import BottomNav from "../components/BottomNav";
import {
  carregarConclusoesPendentes,
  carregarDemandasCache,
  carregarLevantamentosPendentes,
  carregarPontosRotaPendentes,
  contarFotosPendentes,
  marcarErroLevantamento,
  removerConclusaoPendente,
  removerLevantamentoPendente,
  salvarPontosRotaPendentes,
} from "../lib/offlineStorage";
import { API_BASE_URL, authFetch } from "../lib/api";
import { lerFotoOffline } from "../lib/fotosOffline";

/** Falha que nao se resolve tentando de novo (ex.: solicitacao excluida no escritorio). */
class ErroPermanente extends Error {}
import { confirmar, mensagemDeErro, notificar } from "../lib/feedback";
import type { UsuarioLogado } from "../App";

type Props = {
  usuario: UsuarioLogado | null;
  setTela: (tela: "inicio" | "demandas" | "mapa" | "sincronizacao") => void;
  modoDemonstracao?: boolean;
};

type PontoPendente = ReturnType<typeof carregarPontosRotaPendentes>[number];

const FOTO_MAX_DIMENSAO = 1600;
const FOTO_QUALIDADE = 0.75;
const TIMEOUT_PONTO_ROTA_MS = 15000;
const TIMEOUT_LEVANTAMENTO_MS = 60000;
const TIMEOUT_FOTO_MS = 10000;

function criarErroTimeout(mensagem: string) {
  return new Error(mensagem);
}

async function authFetchComTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await authFetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw criarErroTimeout("Tempo esgotado ao comunicar com a API.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function carregarImagem(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const imagem = new Image();
    const timeout = window.setTimeout(() => {
      imagem.onload = null;
      imagem.onerror = null;
      reject(criarErroTimeout("Tempo esgotado ao preparar foto pendente."));
    }, TIMEOUT_FOTO_MS);

    imagem.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Erro ao carregar foto pendente."));
    };
    imagem.onload = () => {
      window.clearTimeout(timeout);
      resolve(imagem);
    };
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

export default function Sincronizacao({
  usuario,
  setTela,
  modoDemonstracao = false,
}: Props) {
  const idEquipe = usuario?.id_equipe ?? 0;
  const [pontosPendentes, setPontosPendentes] = useState<PontoPendente[]>(
    () => (idEquipe ? carregarPontosRotaPendentes(idEquipe) : [])
  );
  const [levantamentosPendentes, setLevantamentosPendentes] = useState(
    () => carregarLevantamentosPendentes().length
  );
  const [fotosPendentes, setFotosPendentes] = useState(contarFotosPendentes);
  const [conclusoesPendentes, setConclusoesPendentes] = useState(carregarConclusoesPendentes);
  // Pontos que nao conseguem subir (ex.: solicitacao excluida): a equipe decide o que fazer.
  const [itensComProblema, setItensComProblema] = useState(() =>
    carregarLevantamentosPendentes().filter((pendente) => pendente.erro_envio)
  );
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
    setConclusoesPendentes(carregarConclusoesPendentes());
    setItensComProblema(carregarLevantamentosPendentes().filter((pendente) => pendente.erro_envio));
  }

  async function descartarItem(localId: number) {
    const item = itensComProblema.find((pendente) => pendente.local_id === localId);
    if (!item) return;

    const confirmado = await confirmar({
      titulo: `Descartar o ponto ${item.ordem_ponto}?`,
      mensagem: `${item.erro_envio ?? ""} O ponto e ${item.fotos.length} foto(s) serão apagados do aparelho. Essa ação não pode ser desfeita.`,
      confirmarTexto: "Descartar",
      perigo: true,
    });
    if (!confirmado) return;

    removerLevantamentoPendente(localId);
    // Se nao sobrou nenhum ponto desta demanda, a conclusao dela pode seguir.
    carregarPendencias();
    notificar("Ponto descartado do aparelho.", "sucesso");
  }

  async function sincronizarAgora() {
    if (modoDemonstracao) {
      setMensagem("Modo de demonstração: nenhuma informação será sincronizada.");
      return;
    }

    if (!idEquipe) {
      setMensagem("Equipe nao identificada. Faca login novamente.");
      return;
    }

    if (!navigator.onLine) {
      setMensagem("Sem internet. Tente sincronizar quando estiver online.");
      notificar("Sem internet. Tente sincronizar quando estiver online.", "aviso");
      return;
    }

    const pontosRotaAtuais = carregarPontosRotaPendentes(idEquipe);
    const levantamentosAtuais = carregarLevantamentosPendentes();
    setPontosPendentes(pontosRotaAtuais);
    setLevantamentosPendentes(levantamentosAtuais.length);
    setFotosPendentes(
      levantamentosAtuais.reduce((total, levantamento) => total + levantamento.fotos.length, 0)
    );

    const conclusoesAtuais = carregarConclusoesPendentes();
    setConclusoesPendentes(conclusoesAtuais);

    if (
      pontosRotaAtuais.length === 0 &&
      levantamentosAtuais.length === 0 &&
      conclusoesAtuais.length === 0
    ) {
      setMensagem("Nao existem dados pendentes para sincronizar.");
      return;
    }

    try {
      setSincronizando(true);
      setProgresso(0);
      setMensagem("Sincronizando dados...");

      const totalEtapas =
        pontosRotaAtuais.length + levantamentosAtuais.length + conclusoesAtuais.length;
      let etapasConcluidas = 0;
      const pontosRotaFalhados: typeof pontosRotaAtuais = [];
      const atualizarProgresso = () => {
        etapasConcluidas += 1;
        setProgresso(totalEtapas === 0 ? 100 : Math.round((etapasConcluidas / totalEtapas) * 100));
      };

      if (pontosRotaAtuais.length > 0) {
        setMensagem(`Enviando ${pontosRotaAtuais.length} ponto(s) de rota...`);
      }

      for (const ponto of pontosRotaAtuais) {
        try {
            const resposta = await authFetchComTimeout(`${API_BASE_URL}/rota`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(ponto),
            }, TIMEOUT_PONTO_ROTA_MS);

            if (!resposta.ok) {
              const dados = await resposta.json().catch(() => ({}));
              throw new Error(dados.erro || "Erro ao sincronizar ponto de rota.");
            }

            atualizarProgresso();
        } catch (error) {
          pontosRotaFalhados.push(ponto);
          console.error("Erro ao sincronizar ponto de rota:", error);
        }
      }

      salvarPontosRotaPendentes(idEquipe, pontosRotaFalhados);

      // Cada levantamento e enviado separadamente: um item com erro NAO trava os
      // outros (antes a sincronizacao parava no primeiro erro e nada mais subia).
      let enviados = 0;
      let comProblema = 0;
      let falhasTemporarias = 0;
      const solicitacoesComPontosRetidos = new Set<number>();
      const nomes = new Map(
        carregarDemandasCache(idEquipe).map((demanda) => [demanda.id, demanda.solicitacao])
      );

      for (const [indice, levantamento] of levantamentosAtuais.entries()) {
        const nome = nomes.get(levantamento.id_solicitacao) ?? `#${levantamento.id_solicitacao}`;
        setMensagem(`Enviando ponto ${levantamento.ordem_ponto} de ${nome} (${indice + 1} de ${levantamentosAtuais.length})...`);

        try {
          const fotosPayload = [];

          for (let index = 0; index < levantamento.fotos.length; index += 1) {
            const foto = levantamento.fotos[index];
            // Fotos novas estao no IndexedDB (chaveFoto); as antigas, em base64 na propria fila.
            const conteudo =
              foto.conteudoBase64 ?? (foto.chaveFoto ? await lerFotoOffline(foto.chaveFoto) : undefined);

            if (!conteudo) {
              console.warn("Foto pendente não encontrada no aparelho:", foto.chaveFoto);
              continue;
            }

            fotosPayload.push({
              nome: foto.nome || `foto-pendente-${levantamento.local_id}-${index + 1}.jpg`,
              tipo: "image/jpeg",
              conteudoBase64: await recomprimirBase64Imagem(conteudo),
            });
          }

          if (fotosPayload.length === 0) {
            throw new ErroPermanente("As fotos deste ponto não foram encontradas no aparelho.");
          }

          const resposta = await authFetchComTimeout(`${API_BASE_URL}/pontos-coletados`, {
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
              // Horario em que o ponto foi coletado (sem internet), nao o da sincronizacao.
              data_coleta: levantamento.data_coleta,
              fotos: fotosPayload,
            }),
          }, TIMEOUT_LEVANTAMENTO_MS);

          const dados = await resposta.json().catch(() => ({}));

          if (resposta.status === 404) {
            throw new ErroPermanente(
              `A solicitação ${nome} não existe mais no escritório (pode ter sido excluída).`
            );
          }
          if (resposta.status === 400 || resposta.status === 413) {
            throw new ErroPermanente(dados.erro || "O servidor recusou este ponto.");
          }
          if (!resposta.ok) {
            throw new Error(dados.erro || "Erro ao sincronizar levantamento.");
          }

          removerLevantamentoPendente(levantamento.local_id);
          enviados += 1;
        } catch (error) {
          console.error("Levantamento não enviado:", error);
          solicitacoesComPontosRetidos.add(levantamento.id_solicitacao);

          if (error instanceof ErroPermanente) {
            // Nao adianta tentar de novo: fica marcado para a equipe decidir (descartar).
            marcarErroLevantamento(levantamento.local_id, error.message);
            comProblema += 1;
          } else {
            // Rede/servidor: tenta de novo na proxima sincronizacao.
            marcarErroLevantamento(levantamento.local_id, undefined);
            falhasTemporarias += 1;
          }
        }

        atualizarProgresso();
      }

      // Conclusoes feitas sem internet: so quando todos os pontos daquela demanda
      // ja subiram (o escritorio nunca recebe a demanda concluida sem os pontos).
      let conclusoesEnviadas = 0;
      let conclusoesDescartadas = 0;
      let conclusoesAguardando = 0;

      for (const conclusao of conclusoesAtuais) {
        if (solicitacoesComPontosRetidos.has(conclusao.id_solicitacao)) {
          conclusoesAguardando += 1;
          atualizarProgresso();
          continue;
        }

        setMensagem(`Concluindo a solicitação ${conclusao.solicitacao}...`);

        try {
          const resposta = await authFetchComTimeout(
            `${API_BASE_URL}/solicitacoes/${conclusao.id_solicitacao}/concluir`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data_conclusao: conclusao.data_conclusao }),
            },
            TIMEOUT_LEVANTAMENTO_MS
          );
          const dados = await resposta.json().catch(() => ({}));

          // 400: ja estava concluida/finalizada no servidor; 404: solicitacao removida.
          // Nos dois casos nao ha o que reenviar.
          if (!resposta.ok && resposta.status !== 400 && resposta.status !== 404) {
            throw new Error(dados.erro || `Erro ao concluir a solicitação ${conclusao.solicitacao}.`);
          }
          removerConclusaoPendente(conclusao.id_solicitacao);
          if (resposta.status === 404) {
            notificar(`A solicitação ${conclusao.solicitacao} não existe mais no escritório; a conclusão foi descartada.`, "aviso");
            conclusoesDescartadas += 1;
          } else {
            conclusoesEnviadas += 1;
          }
        } catch (error) {
          console.error("Conclusão não enviada:", error);
          falhasTemporarias += 1;
        }

        atualizarProgresso();
      }

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

      const partes = [
        enviados > 0 ? `${enviados} ponto(s) enviado(s)` : "",
        conclusoesEnviadas > 0 ? `${conclusoesEnviadas} conclusão(ões) enviada(s)` : "",
        conclusoesDescartadas > 0 ? `${conclusoesDescartadas} conclusão(ões) descartada(s) (solicitação excluída)` : "",
        comProblema > 0 ? `${comProblema} ponto(s) com problema (veja abaixo)` : "",
        falhasTemporarias > 0 ? `${falhasTemporarias} item(ns) não enviado(s) por falha de conexão — tente de novo` : "",
        conclusoesAguardando > 0 ? `${conclusoesAguardando} conclusão(ões) aguardando os pontos da demanda` : "",
        pontosRotaFalhados.length > 0 ? `${pontosRotaFalhados.length} ponto(s) de rota não enviados` : "",
      ].filter(Boolean);

      const tudoCerto = comProblema === 0 && falhasTemporarias === 0 && conclusoesAguardando === 0 && pontosRotaFalhados.length === 0;
      const resumo = partes.length > 0 ? `${partes.join(" · ")}.` : "Nada a enviar.";
      setMensagem(tudoCerto ? `Sincronização concluída: ${resumo}` : `Sincronização parcial: ${resumo}`);
      notificar(
        tudoCerto ? "Tudo sincronizado com o escritório." : `Sincronização parcial: ${resumo}`,
        tudoCerto ? "sucesso" : comProblema > 0 ? "aviso" : "erro"
      );
    } catch (error) {
      console.error(error);
      carregarPendencias();
      const texto = `Erro ao sincronizar: ${mensagemDeErro(error)} Os dados continuam salvos no aparelho.`;
      setMensagem(texto);
      notificar(texto, "erro");
    } finally {
      setSincronizando(false);
    }
  }

  const totalPendencias =
    pontosPendentes.length + levantamentosPendentes + fotosPendentes + conclusoesPendentes.length;
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

            <div
              style={{
                background: "#f1f5f9",
                borderRadius: 20,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Conclusões pendentes
              </div>
              <strong style={{ fontSize: 28 }}>{conclusoesPendentes.length}</strong>
              {conclusoesPendentes.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11, color: "#64748b" }}>
                  {conclusoesPendentes.map((item) => item.solicitacao).join(", ")}
                </div>
              )}
            </div>
          </div>

          {itensComProblema.length > 0 && (
            <div
              role="alert"
              style={{
                marginBottom: 14,
                padding: 14,
                borderRadius: 18,
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                textAlign: "left",
              }}
            >
              <strong style={{ display: "block", color: "#9a3412", marginBottom: 6 }}>
                {itensComProblema.length} ponto(s) não podem ser enviados
              </strong>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#9a3412" }}>
                Eles não travam mais a sincronização dos outros itens. Confira o motivo e
                descarte se a solicitação não existir mais.
              </p>
              {itensComProblema.map((item) => (
                <div
                  key={item.local_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderTop: "1px solid #fed7aa",
                  }}
                >
                  <div style={{ flex: 1, fontSize: 13, color: "#7c2d12" }}>
                    <strong>Ponto {item.ordem_ponto}</strong> · {item.fotos.length} foto(s)
                    <div style={{ marginTop: 2 }}>{item.erro_envio}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void descartarItem(item.local_id)}
                    disabled={sincronizando}
                    style={{
                      flexShrink: 0,
                      height: 36,
                      padding: "0 12px",
                      borderRadius: 10,
                      border: "1px solid #fca5a5",
                      background: "white",
                      color: "#b91c1c",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Descartar
                  </button>
                </div>
              ))}
            </div>
          )}

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
            Na ausência de conexão, os dados permanecem armazenados com segurança
            neste dispositivo e serão enviados na próxima sincronização.

            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                marginTop: 14,
                borderRadius: 14,
                padding: 12,
                background: "#fff7ed",
                color: "#9a3412",
                fontWeight: 700,
              }}
            >
              <AlertTriangle
                size={20}
                style={{ flexShrink: 0, marginTop: 1 }}
              />
              <span>
                Não limpe o cache ou os dados do aplicativo e não o desinstale
                enquanto houver pendências. Essas ações podem excluir
                definitivamente informações ainda não sincronizadas.
              </span>
            </div>
          </div>
        </div>
      </div>

      <BottomNav telaAtual="sincronizacao" setTela={setTela} />
    </div>
  );
}
