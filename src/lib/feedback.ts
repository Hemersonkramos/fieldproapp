// Avisos (toasts) e confirmacoes: funcoes que qualquer tela pode chamar.
// O componente que desenha os avisos fica em components/Feedback.tsx.

export type TipoNotificacao = "sucesso" | "erro" | "aviso" | "info";

export type Notificacao = {
  id: number;
  mensagem: string;
  tipo: TipoNotificacao;
  saindo?: boolean;
};

export type PedidoConfirmacao = {
  titulo: string;
  mensagem?: string;
  confirmarTexto?: string;
  cancelarTexto?: string;
  perigo?: boolean;
};

export const EVENTO_NOTIFICACAO = "fieldpro:notificacao";
export const EVENTO_CONFIRMACAO = "fieldpro:confirmacao";

let proximoId = 1;
const ultimasMensagens = new Map<string, number>();

/**
 * Mostra um aviso flutuante (toast). Mensagens iguais repetidas em menos de 4s
 * sao ignoradas, para erros em serie nao encherem a tela.
 */
export function notificar(mensagem: string, tipo: TipoNotificacao = "info") {
  const texto = mensagem.trim();
  if (!texto) return;

  const agora = Date.now();
  const chave = `${tipo}:${texto}`;
  if (agora - (ultimasMensagens.get(chave) ?? 0) < 4000) return;
  ultimasMensagens.set(chave, agora);

  window.dispatchEvent(
    new CustomEvent<Notificacao>(EVENTO_NOTIFICACAO, {
      detail: { id: proximoId++, mensagem: texto, tipo },
    })
  );
}

/** Extrai uma mensagem legivel de qualquer erro capturado. */
export function mensagemDeErro(erro: unknown, padrao = "Algo deu errado. Tente novamente.") {
  if (erro instanceof DOMException && erro.name === "AbortError") {
    return "O servidor demorou para responder. Tente novamente.";
  }
  if (erro instanceof TypeError && /fetch|network|load failed/i.test(erro.message)) {
    return navigator.onLine
      ? "Não foi possível falar com o servidor. Ele pode estar iniciando; tente de novo em alguns segundos."
      : "Sem conexão com a internet.";
  }
  // Resposta que nao e JSON (ex.: pagina de erro 502 do servidor).
  if (erro instanceof SyntaxError) {
    return "O servidor respondeu de forma inesperada. Tente novamente em instantes.";
  }
  if (erro instanceof Error && erro.message) return erro.message;
  return padrao;
}

/** Confirmacao em janela propria (substitui window.confirm). Resolve true/false. */
export function confirmar(pedido: PedidoConfirmacao | string) {
  const dados = typeof pedido === "string" ? { titulo: pedido } : pedido;

  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(
      new CustomEvent(EVENTO_CONFIRMACAO, { detail: { ...dados, resolve } })
    );
  });
}

