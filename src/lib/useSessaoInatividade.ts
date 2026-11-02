import { useEffect, useRef } from "react";
import {
  EVENTO_SESSAO_EXPIRADA,
  obterToken,
  registrarAtividade,
  renovarTokenSeNecessario,
  sessaoValida,
} from "./api";

const EVENTOS_DE_USO = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"] as const;
const INTERVALO_VERIFICACAO_MS = 30 * 1000;

/**
 * Mantem a sessao viva enquanto ha uso e chama `aoExpirar` depois de 1h sem uso,
 * quando a API recusa o token ou quando outra aba sai do sistema.
 * `manterAtiva` permite tratar um processo em andamento como uso (ex.: rastreio de GPS).
 */
export function useSessaoInatividade(
  ativa: boolean,
  aoExpirar: () => void,
  manterAtiva?: () => boolean
) {
  const aoExpirarRef = useRef(aoExpirar);
  const manterAtivaRef = useRef(manterAtiva);

  useEffect(() => {
    aoExpirarRef.current = aoExpirar;
    manterAtivaRef.current = manterAtiva;
  });

  useEffect(() => {
    if (!ativa) return;

    let encerrada = false;
    const expirar = () => {
      if (encerrada) return;
      encerrada = true;
      aoExpirarRef.current();
    };

    const verificar = () => {
      if (manterAtivaRef.current?.()) {
        registrarAtividade(true);
        renovarTokenSeNecessario();
        return;
      }
      if (!sessaoValida()) expirar();
    };

    let ultimoUso = 0;
    const aoUsar = () => {
      // mousemove/scroll disparam dezenas de vezes por segundo: trata no maximo 1x a cada 5s.
      const agora = Date.now();
      if (agora - ultimoUso < 5000) return;
      ultimoUso = agora;
      // Se o usuario voltou depois do limite, a sessao ja acabou: nao reativa.
      if (!sessaoValida()) {
        expirar();
        return;
      }
      registrarAtividade();
      renovarTokenSeNecessario();
    };

    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") verificar();
    };

    // Logout ou expiracao em outra aba do mesmo navegador.
    const aoMudarStorage = (evento: StorageEvent) => {
      if (evento.key === null || (evento.storageArea === localStorage && !obterToken())) expirar();
    };

    EVENTOS_DE_USO.forEach((nome) =>
      window.addEventListener(nome, aoUsar, { passive: true, capture: true })
    );
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("storage", aoMudarStorage);
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, expirar);
    const intervalo = window.setInterval(verificar, INTERVALO_VERIFICACAO_MS);

    registrarAtividade(true);
    renovarTokenSeNecessario();

    return () => {
      EVENTOS_DE_USO.forEach((nome) =>
        window.removeEventListener(nome, aoUsar, { capture: true })
      );
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("storage", aoMudarStorage);
      window.removeEventListener(EVENTO_SESSAO_EXPIRADA, expirar);
      window.clearInterval(intervalo);
    };
  }, [ativa]);
}
