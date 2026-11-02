import type { Demanda } from "../App";
import { ehFotoLocal, PREFIXO_FOTO_LOCAL, removerFotosOffline, salvarFotoOffline } from "./fotosOffline";

export type CachedAttachment = {
  id: number;
  nome_arquivo: string;
  caminho_arquivo: string;
  data_url?: string;
};

export type CachedPhoto = {
  id: number;
  id_ponto_coletado: number;
  nome_arquivo: string;
  caminho_arquivo: string;
  data_foto: string;
  data_url?: string;
};

export type CachedPoint = {
  id: number;
  id_solicitacao: number;
  ordem_ponto?: number;
  latitude: string;
  longitude: string;
  data_coleta: string;
  observacao: string | null;
  fotos: CachedPhoto[];
};

export type PendingSurvey = {
  local_id: number;
  id_solicitacao: number;
  ordem_ponto: number;
  latitude: number;
  longitude: number;
  observacao: string;
  data_coleta: string;
  fotos: FotoPendente[];
};

/**
 * Foto de um levantamento ainda nao enviado. Novas fotos ficam no IndexedDB
 * (chaveFoto); conteudoBase64 so existe em itens antigos ou se o IndexedDB falhar.
 */
export type FotoPendente = {
  nome: string;
  tipo: string;
  conteudoBase64?: string;
  chaveFoto?: string;
};

export type OfflineRoutePoint = {
  id_equipe: number;
  latitude: number;
  longitude: number;
  data_hora: string;
};

export type PlannedRoute = {
  origem?: [number, number] | null;
  rotaSelecionada?: Demanda[];
};

function lerJson<T>(chave: string, fallback: T): T {
  const valor = localStorage.getItem(chave);

  if (!valor) {
    return fallback;
  }

  try {
    return JSON.parse(valor) as T;
  } catch (error) {
    console.error(`Erro ao ler ${chave}:`, error);
    return fallback;
  }
}

function gravarTexto(chave: string, texto: string) {
  try {
    localStorage.setItem(chave, texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * Libera espaco tirando as copias em base64 das fotos guardadas no cache de pontos.
 * Nao perde dados: fotos ja enviadas sao baixadas da API e as pendentes continuam
 * inteiras na fila de sincronizacao.
 */
function liberarEspacoFotosCache() {
  let liberou = false;

  for (let indice = localStorage.length - 1; indice >= 0; indice -= 1) {
    const chave = localStorage.key(indice);
    if (!chave?.startsWith("fieldpro_pontos_")) continue;

    const pontos = lerJson<CachedPoint[]>(chave, []);
    let alterou = false;
    const limpos = pontos.map((ponto) => ({
      ...ponto,
      fotos: ponto.fotos.map((foto) => {
        // "idb:..." e so uma referencia curta ao IndexedDB: nao ocupa espaco.
        if (!foto.data_url || ehFotoLocal(foto.data_url)) return foto;
        alterou = true;
        const { data_url: _dataUrl, ...semDataUrl } = foto;
        void _dataUrl;
        return semDataUrl;
      }),
    }));

    if (alterou && gravarTexto(chave, JSON.stringify(limpos))) liberou = true;
  }

  return liberou;
}

/**
 * Grava no localStorage sem lancar erro. Se o armazenamento estiver cheio, libera
 * as copias de fotos do cache e tenta de novo. Retorna se conseguiu gravar.
 * (Antes um erro de cota aqui, depois de o ponto ja ter subido para a API, caia no
 * tratamento de "sem conexao" e o ponto era enfileirado de novo, duplicando.)
 */
function salvarJson(chave: string, valor: unknown) {
  const texto = JSON.stringify(valor);
  if (gravarTexto(chave, texto)) return true;
  if (liberarEspacoFotosCache() && gravarTexto(chave, texto)) return true;
  console.warn(`Armazenamento do aparelho cheio: nao foi possivel gravar ${chave}.`);
  return false;
}

function chaveDemandas(idEquipe: number) {
  return `fieldpro_demandas_${idEquipe}`;
}

function chaveAnexos(idSolicitacao: number) {
  return `fieldpro_anexos_${idSolicitacao}`;
}

function chavePontos(idSolicitacao: number) {
  return `fieldpro_pontos_${idSolicitacao}`;
}

function chaveRotaPlanejada(idEquipe: number) {
  return `fieldpro_rota_planejada_${idEquipe}`;
}

function chavePontosRotaPendentes(idEquipe: number) {
  return `fieldpro_rota_real_${idEquipe}`;
}

function pontosIguais(a: OfflineRoutePoint, b: OfflineRoutePoint) {
  return (
    Number(a.id_equipe) === Number(b.id_equipe) &&
    Number(a.latitude) === Number(b.latitude) &&
    Number(a.longitude) === Number(b.longitude) &&
    a.data_hora === b.data_hora
  );
}

function removerPontosRotaLegadosDaEquipe(idEquipe: number) {
  const pontosLegados = lerJson<OfflineRoutePoint[]>("fieldpro_rota_real", []);
  const restantes = pontosLegados.filter(
    (ponto) => Number(ponto.id_equipe) !== Number(idEquipe)
  );

  if (restantes.length === 0) {
    localStorage.removeItem("fieldpro_rota_real");
    return;
  }

  salvarJson("fieldpro_rota_real", restantes);
}

export function carregarDemandasCache(idEquipe: number) {
  return lerJson<Demanda[]>(chaveDemandas(idEquipe), []);
}

export function salvarDemandasCache(idEquipe: number, demandas: Demanda[]) {
  salvarJson(chaveDemandas(idEquipe), demandas);
}

export function carregarAnexosCache(idSolicitacao: number) {
  return lerJson<CachedAttachment[]>(chaveAnexos(idSolicitacao), []);
}

export function salvarAnexosCache(
  idSolicitacao: number,
  anexos: CachedAttachment[]
) {
  salvarJson(chaveAnexos(idSolicitacao), anexos);
}

export function carregarPontosCache(idSolicitacao: number) {
  return lerJson<CachedPoint[]>(chavePontos(idSolicitacao), []);
}

export function salvarPontosCache(idSolicitacao: number, pontos: CachedPoint[]) {
  salvarJson(chavePontos(idSolicitacao), pontos);
}

export function adicionarPontoCache(
  idSolicitacao: number,
  ponto: CachedPoint
) {
  const atuais = carregarPontosCache(idSolicitacao);
  salvarPontosCache(idSolicitacao, [ponto, ...atuais]);
}

export function atualizarPontosCache(
  idSolicitacao: number,
  atualizador: (pontos: CachedPoint[]) => CachedPoint[]
) {
  salvarPontosCache(idSolicitacao, atualizador(carregarPontosCache(idSolicitacao)));
}

export function carregarLevantamentosPendentes() {
  return lerJson<PendingSurvey[]>("fieldpro_levantamentos_pendentes", []);
}

export function salvarLevantamentosPendentes(pendentes: PendingSurvey[]) {
  // A fila de sincronizacao nao pode falhar em silencio: a equipe precisa saber.
  if (!salvarJson("fieldpro_levantamentos_pendentes", pendentes)) {
    throw new Error(
      "Armazenamento do aparelho cheio. Sincronize os levantamentos pendentes antes de coletar mais fotos."
    );
  }  gravarTexto(CHAVE_TOTAL_PENDENTES, String(pendentes.length));
}

const CHAVE_TOTAL_PENDENTES = "fieldpro_levantamentos_pendentes_total";

/**
 * Quantidade de levantamentos pendentes sem ler a fila inteira (que guarda as fotos
 * em base64 e pode ter varios MB). Usado pelo selo da barra inferior.
 */
export function contarLevantamentosPendentes() {
  const total = localStorage.getItem(CHAVE_TOTAL_PENDENTES);
  if (total !== null) return Number(total) || 0;
  const quantidade = carregarLevantamentosPendentes().length;
  gravarTexto(CHAVE_TOTAL_PENDENTES, String(quantidade));
  return quantidade;
}

export function adicionarLevantamentoPendente(pendente: PendingSurvey) {
  const atuais = carregarLevantamentosPendentes();
  salvarLevantamentosPendentes([...atuais, pendente]);
}

export function removerLevantamentoPendente(localId: number) {
  const atuais = carregarLevantamentosPendentes();
  const removido = atuais.find((item) => item.local_id === localId);
  const restantes = atuais.filter((item) => item.local_id !== localId);
  salvarLevantamentosPendentes(restantes);
  // Apaga do IndexedDB as fotos que ja subiram (ou foram descartadas).
  if (removido) {
    void removerFotosOffline(
      removido.fotos.map((foto) => foto.chaveFoto).filter((chave): chave is string => Boolean(chave))
    );
  }
}

/**
 * Guarda as fotos de um levantamento offline no IndexedDB e devolve as fotos para a
 * fila (so com a chave). Se o IndexedDB falhar, mantem o base64 como antes.
 */
export async function guardarFotosPendentes(
  localId: number,
  fotos: Array<{ nome: string; tipo: string; conteudoBase64: string }>
): Promise<FotoPendente[]> {
  return Promise.all(
    fotos.map(async (foto, indice) => {
      const chaveFoto = `${localId}-${indice}`;
      try {
        await salvarFotoOffline(chaveFoto, foto.conteudoBase64);
        return { nome: foto.nome, tipo: foto.tipo, chaveFoto };
      } catch (erro) {
        console.warn("IndexedDB indisponível; foto mantida no armazenamento local.", erro);
        return { nome: foto.nome, tipo: foto.tipo, conteudoBase64: foto.conteudoBase64 };
      }
    })
  );
}

/** Valor para exibir a foto pendente: referencia "idb:" ou o proprio base64. */
export function referenciaFotoPendente(foto: FotoPendente) {
  return foto.chaveFoto ? `${PREFIXO_FOTO_LOCAL}${foto.chaveFoto}` : foto.conteudoBase64;
}

export function contarFotosPendentes() {
  return carregarLevantamentosPendentes().reduce(
    (total, levantamento) => total + levantamento.fotos.length,
    0
  );
}

export function carregarRotaPlanejada(idEquipe: number) {
  const rota = lerJson<PlannedRoute>(chaveRotaPlanejada(idEquipe), {});

  if (rota.rotaSelecionada) {
    return {
      ...rota,
      rotaSelecionada: rota.rotaSelecionada.filter(
        (demanda) => Number(demanda.id_equipe) === Number(idEquipe)
      ),
    };
  }

  const rotaLegada = lerJson<PlannedRoute>("fieldpro_rota_planejada", {});

  return {
    ...rotaLegada,
    rotaSelecionada: (rotaLegada.rotaSelecionada ?? []).filter(
      (demanda) => Number(demanda.id_equipe) === Number(idEquipe)
    ),
  };
}

export function salvarRotaPlanejada(idEquipe: number, rota: PlannedRoute) {
  salvarJson(chaveRotaPlanejada(idEquipe), {
    ...rota,
    rotaSelecionada: (rota.rotaSelecionada ?? []).filter(
      (demanda) => Number(demanda.id_equipe) === Number(idEquipe)
    ),
  });
}

export function limparRotaPlanejada(idEquipe: number) {
  localStorage.removeItem(chaveRotaPlanejada(idEquipe));
}

export function carregarPontosRotaPendentes(idEquipe: number) {
  const pontos = lerJson<OfflineRoutePoint[]>(chavePontosRotaPendentes(idEquipe), []);
  const pontosLegados = lerJson<OfflineRoutePoint[]>("fieldpro_rota_real", []).filter(
    (ponto) => Number(ponto.id_equipe) === Number(idEquipe)
  );

  return [...pontos, ...pontosLegados].filter(
    (ponto, index, todos) => todos.findIndex((item) => pontosIguais(item, ponto)) === index
  );
}

export function salvarPontosRotaPendentes(idEquipe: number, pontos: OfflineRoutePoint[]) {
  removerPontosRotaLegadosDaEquipe(idEquipe);

  salvarJson(
    chavePontosRotaPendentes(idEquipe),
    pontos.filter((ponto) => Number(ponto.id_equipe) === Number(idEquipe))
  );
}

export function salvarPosicaoAtual(posicao: [number, number] | null) {
  salvarJson("fieldpro_posicao_atual", posicao);
}

export function carregarPosicaoAtual() {
  return lerJson<[number, number] | null>("fieldpro_posicao_atual", null);
}

export async function urlParaDataUrl(url: string) {
  const resposta = await fetch(url);
  const blob = await resposta.blob();

  return await new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();

    leitor.onloadend = () => {
      if (typeof leitor.result === "string") {
        resolve(leitor.result);
        return;
      }

      reject(new Error("Erro ao converter arquivo para data URL."));
    };

    leitor.onerror = () => {
      reject(new Error("Erro ao ler arquivo."));
    };

    leitor.readAsDataURL(blob);
  });
}

function idsPendentesDaSolicitacao(idSolicitacao: number) {
  return new Set(
    carregarLevantamentosPendentes()
      .filter((pendente) => Number(pendente.id_solicitacao) === Number(idSolicitacao))
      .map((pendente) => pendente.local_id)
  );
}

/**
 * Junta os pontos vindos da API com os pontos desta solicitacao que ainda estao
 * so no aparelho. Sem isso, ao abrir a tela com internet, os pontos ainda nao
 * sincronizados sumiam da lista (embora continuassem guardados).
 */
export function mesclarPontosPendentes<T extends { id: number }>(
  idSolicitacao: number,
  pontosServidor: T[]
): T[] {
  const idsPendentes = idsPendentesDaSolicitacao(idSolicitacao);
  if (idsPendentes.size === 0) return pontosServidor;

  const locais = carregarPontosCache(idSolicitacao).filter((ponto) => idsPendentes.has(ponto.id));
  return [...(locais as unknown as T[]), ...pontosServidor];
}

export function ehLevantamentoPendente(localId: number) {
  return carregarLevantamentosPendentes().some((pendente) => pendente.local_id === localId);
}

/** Remove uma foto (pela posicao) de um levantamento que ainda nao subiu. */
export function removerFotoDeLevantamentoPendente(localId: number, indiceFoto: number) {
  const pendentes = carregarLevantamentosPendentes();
  const chave = pendentes.find((p) => p.local_id === localId)?.fotos[indiceFoto]?.chaveFoto;
  if (chave) void removerFotosOffline([chave]);
  const atualizados = pendentes
    .map((pendente) =>
      pendente.local_id !== localId
        ? pendente
        : { ...pendente, fotos: pendente.fotos.filter((_, indice) => indice !== indiceFoto) }
    )
    .filter((pendente) => pendente.fotos.length > 0);
  salvarLevantamentosPendentes(atualizados);
}
