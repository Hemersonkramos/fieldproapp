import { useEffect, useRef, useState } from "react";
import {
  EVENTO_CONFIRMACAO,
  EVENTO_NOTIFICACAO,
  mensagemDeErro,
  notificar,
  type Notificacao,
  type PedidoConfirmacao,
  type TipoNotificacao,
} from "../lib/feedback";
import "./feedback.css";

const ICONES: Record<TipoNotificacao, string> = {
  sucesso: "✓",
  erro: "!",
  aviso: "!",
  info: "i",
};

/** Monte uma vez na raiz do app. Exibe os toasts e as confirmacoes. */
export function FeedbackHost() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [confirmacao, setConfirmacao] = useState<
    (PedidoConfirmacao & { resolve: (valor: boolean) => void }) | null
  >(null);
  const botaoConfirmarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const remover = (id: number) => {
      setNotificacoes((atuais) => atuais.map((n) => (n.id === id ? { ...n, saindo: true } : n)));
      window.setTimeout(
        () => setNotificacoes((atuais) => atuais.filter((n) => n.id !== id)),
        220
      );
    };

    const aoNotificar = (evento: Event) => {
      const nova = (evento as CustomEvent<Notificacao>).detail;
      setNotificacoes((atuais) => [...atuais.slice(-3), nova]);
      window.setTimeout(() => remover(nova.id), nova.tipo === "erro" ? 6500 : 4000);
    };

    const aoConfirmar = (evento: Event) => {
      setConfirmacao(
        (evento as CustomEvent<PedidoConfirmacao & { resolve: (valor: boolean) => void }>).detail
      );
    };

    // Erros de promessa que nenhuma tela tratou: avisa em vez de falhar em silencio.
    const aoRejeicaoNaoTratada = (evento: PromiseRejectionEvent) => {
      console.error("Erro nao tratado:", evento.reason);
      notificar(mensagemDeErro(evento.reason), "erro");
    };

    window.addEventListener(EVENTO_NOTIFICACAO, aoNotificar);
    window.addEventListener(EVENTO_CONFIRMACAO, aoConfirmar);
    window.addEventListener("unhandledrejection", aoRejeicaoNaoTratada);

    return () => {
      window.removeEventListener(EVENTO_NOTIFICACAO, aoNotificar);
      window.removeEventListener(EVENTO_CONFIRMACAO, aoConfirmar);
      window.removeEventListener("unhandledrejection", aoRejeicaoNaoTratada);
    };
  }, []);

  useEffect(() => {
    if (!confirmacao) return;
    botaoConfirmarRef.current?.focus();

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") responder(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
    // responder depende so de confirmacao
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmacao]);

  function responder(valor: boolean) {
    confirmacao?.resolve(valor);
    setConfirmacao(null);
  }

  return (
    <>
      <div className="fpfb-toasts" aria-live="polite" aria-atomic="false">
        {notificacoes.map((n) => (
          <div
            key={n.id}
            role={n.tipo === "erro" ? "alert" : "status"}
            className={`fpfb-toast fpfb-${n.tipo}${n.saindo ? " fpfb-saindo" : ""}`}
            onClick={() =>
              setNotificacoes((atuais) => atuais.filter((item) => item.id !== n.id))
            }
          >
            <span className="fpfb-icone" aria-hidden="true">{ICONES[n.tipo]}</span>
            <span className="fpfb-texto">{n.mensagem}</span>
          </div>
        ))}
      </div>

      {confirmacao && (
        <div className="fpfb-fundo" onClick={() => responder(false)}>
          <div
            className="fpfb-dialogo"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="fpfb-titulo"
            onClick={(evento) => evento.stopPropagation()}
          >
            <h3 id="fpfb-titulo">{confirmacao.titulo}</h3>
            {confirmacao.mensagem && <p>{confirmacao.mensagem}</p>}
            <div className="fpfb-acoes">
              <button type="button" className="fpfb-cancelar" onClick={() => responder(false)}>
                {confirmacao.cancelarTexto ?? "Cancelar"}
              </button>
              <button
                ref={botaoConfirmarRef}
                type="button"
                className={confirmacao.perigo ? "fpfb-confirmar fpfb-perigo" : "fpfb-confirmar"}
                onClick={() => responder(true)}
              >
                {confirmacao.confirmarTexto ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
