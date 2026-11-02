import type { Demanda } from "../App";
import { API_BASE_URL, authFetch, authUrl } from "./api";
import { salvarAnexoOffline, temAnexoOffline } from "./fotosOffline";
import {
  mesclarPontosPendentes,
  salvarAnexosCache,
  salvarPontosCache,
  type CachedAttachment,
  type CachedPoint,
} from "./offlineStorage";

export type ResultadoPreCarregamento = {
  demandas: number;
  arquivosNovos: number;
  falhas: number;
};

const STATUS_EM_ABERTO = ["Andamento", "Devolvida"];
// Arquivos muito grandes nao sao baixados automaticamente (economiza dados moveis).
const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024;

let emAndamento: Promise<ResultadoPreCarregamento> | null = null;

/**
 * Baixa, para uso sem internet, tudo que a equipe precisa consultar nas demandas
 * em aberto: a lista de anexos com os arquivos (PDF/fotos, guardados no IndexedDB)
 * e os pontos ja coletados. Arquivos ja baixados nao sao baixados de novo.
 */
export function preCarregarDemandas(demandas: Demanda[]): Promise<ResultadoPreCarregamento> {
  if (emAndamento) return emAndamento;

  emAndamento = (async () => {
    const resultado: ResultadoPreCarregamento = { demandas: 0, arquivosNovos: 0, falhas: 0 };
    const abertas = demandas.filter((demanda) => STATUS_EM_ABERTO.includes(demanda.status));

    for (const demanda of abertas) {
      if (!navigator.onLine) break;

      try {
        const [respostaAnexos, respostaPontos] = await Promise.all([
          authFetch(`${API_BASE_URL}/solicitacoes/${demanda.id}/anexos`),
          authFetch(`${API_BASE_URL}/solicitacoes/${demanda.id}/pontos`),
        ]);

        if (respostaPontos.ok) {
          const pontos = (await respostaPontos.json()) as CachedPoint[];
          salvarPontosCache(demanda.id, mesclarPontosPendentes(demanda.id, pontos));
        }

        if (!respostaAnexos.ok) {
          resultado.falhas += 1;
          continue;
        }

        const anexos = (await respostaAnexos.json()) as CachedAttachment[];
        salvarAnexosCache(demanda.id, anexos);

        for (const anexo of anexos) {
          if (!anexo.caminho_arquivo || (await temAnexoOffline(anexo.caminho_arquivo))) continue;

          try {
            const arquivo = await fetch(authUrl(anexo.caminho_arquivo));
            if (!arquivo.ok) throw new Error(`HTTP ${arquivo.status}`);
            const tamanho = Number(arquivo.headers.get("content-length") || 0);
            if (tamanho > TAMANHO_MAXIMO_BYTES) continue;
            await salvarAnexoOffline(anexo.caminho_arquivo, await arquivo.blob());
            resultado.arquivosNovos += 1;
          } catch (erro) {
            console.warn(`Anexo não baixado (${anexo.nome_arquivo}):`, erro);
            resultado.falhas += 1;
          }
        }

        resultado.demandas += 1;
      } catch (erro) {
        console.warn(`Demanda ${demanda.id} não pré-carregada:`, erro);
        resultado.falhas += 1;
      }
    }

    return resultado;
  })().finally(() => {
    emAndamento = null;
  });

  return emAndamento;
}
