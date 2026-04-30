import type { Demanda } from "../App";

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
  fotos: Array<{
    nome: string;
    tipo: string;
    conteudoBase64: string;
  }>;
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

function salvarJson(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
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
  salvarJson("fieldpro_levantamentos_pendentes", pendentes);
}

export function adicionarLevantamentoPendente(pendente: PendingSurvey) {
  const atuais = carregarLevantamentosPendentes();
  salvarLevantamentosPendentes([...atuais, pendente]);
}

export function removerLevantamentoPendente(localId: number) {
  const restantes = carregarLevantamentosPendentes().filter(
    (item) => item.local_id !== localId
  );
  salvarLevantamentosPendentes(restantes);
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
