export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const TOKEN_KEY = "fieldpro_app_token";
const SESSAO_KEY = "fieldpro_app_sessao";
const ATIVIDADE_KEY = "fieldpro_app_ultima_atividade";

/** Tempo sem uso apos o qual o login volta a ser exigido. */
export const INATIVIDADE_MAXIMA_MS = 60 * 60 * 1000;
/** Evento disparado quando a sessao acaba (inatividade ou token recusado pela API). */
export const EVENTO_SESSAO_EXPIRADA = "fieldpro:sessao-expirada";

// O token vale 12h na API. Quando faltar menos que isso, ele e renovado
// enquanto o usuario estiver usando o sistema.
const RENOVAR_QUANDO_RESTAR_MS = 6 * 60 * 60 * 1000;
const INTERVALO_GRAVAR_ATIVIDADE_MS = 15 * 1000;

function lerStorage(chave: string) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarStorage(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Storage cheio ou bloqueado: a sessao segue valida so nesta aba.
  }
}

function removerStorage(chave: string) {
  try {
    localStorage.removeItem(chave);
  } catch {
    // ignorado
  }
}

export function salvarToken(token: string) {
  gravarStorage(TOKEN_KEY, token);
}

export function obterToken() {
  return lerStorage(TOKEN_KEY) || "";
}

/** Data de expiracao (ms) gravada no token, ou 0 se nao for possivel ler. */
function expiracaoToken(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const dados = JSON.parse(atob(base64)) as { exp?: number };
    return typeof dados.exp === "number" ? dados.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function ultimaAtividade() {
  return Number(lerStorage(ATIVIDADE_KEY)) || 0;
}

let ultimaGravacaoAtividade = 0;

/** Marca que o usuario esta usando o sistema (gravacao limitada a cada 15s). */
export function registrarAtividade(forcar = false) {
  const agora = Date.now();
  if (!forcar && agora - ultimaGravacaoAtividade < INTERVALO_GRAVAR_ATIVIDADE_MS) return;
  ultimaGravacaoAtividade = agora;
  gravarStorage(ATIVIDADE_KEY, String(agora));
}

/** A sessao gravada ainda pode ser usada: token presente, nao vencido e uso ha menos de 1h. */
export function sessaoValida() {
  const token = obterToken();
  if (!token) return false;

  // Sem internet a equipe nao conseguiria entrar de novo, entao o token vencido so
  // encerra a sessao quando houver conexao (a API tambem recusa com 401).
  const expiraEm = expiracaoToken(token);
  if (expiraEm && expiraEm <= Date.now() && navigator.onLine) return false;

  const atividade = ultimaAtividade();
  return atividade > 0 && Date.now() - atividade < INATIVIDADE_MAXIMA_MS;
}

export function salvarSessao<T extends { token: string }>(usuario: T) {
  salvarToken(usuario.token);
  // O token fica so na sua propria chave; a copia do usuario nao guarda o token.
  const { token: _token, ...dados } = usuario;
  void _token;
  gravarStorage(SESSAO_KEY, JSON.stringify(dados));
  registrarAtividade(true);
}

/** Restaura o usuario logado se a sessao ainda for valida; senao limpa tudo. */
export function carregarSessao<T extends { token: string }>(): T | null {
  if (!sessaoValida()) {
    if (obterToken()) limparSessao();
    return null;
  }

  try {
    const dados = JSON.parse(lerStorage(SESSAO_KEY) || "null") as Omit<T, "token"> | null;
    if (!dados) return null;
    return { ...dados, token: obterToken() } as T;
  } catch {
    limparSessao();
    return null;
  }
}

export function limparSessao() {
  removerStorage(TOKEN_KEY);
  removerStorage(SESSAO_KEY);
  removerStorage(ATIVIDADE_KEY);
}

function avisarSessaoExpirada() {
  window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
}

let renovacaoEmAndamento: Promise<void> | null = null;
let ultimaTentativaRenovacao = 0;

/** Renova o token quando ele estiver na metade final da validade. */
export function renovarTokenSeNecessario() {
  const token = obterToken();
  if (!token || renovacaoEmAndamento || !navigator.onLine) return;

  const expiraEm = expiracaoToken(token);
  if (!expiraEm || expiraEm - Date.now() > RENOVAR_QUANDO_RESTAR_MS) return;
  if (Date.now() - ultimaTentativaRenovacao < 60 * 1000) return;
  ultimaTentativaRenovacao = Date.now();

  renovacaoEmAndamento = fetch(`${API_BASE_URL}/sessao/renovar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(async (resposta) => {
      if (resposta.status === 401) {
        avisarSessaoExpirada();
        return;
      }
      if (!resposta.ok) return;
      const dados = (await resposta.json()) as { token?: string };
      // So troca se ninguem saiu/entrou de novo enquanto a renovacao acontecia.
      if (dados.token && obterToken() === token) salvarToken(dados.token);
    })
    .catch(() => undefined)
    .finally(() => {
      renovacaoEmAndamento = null;
    });
}

export async function authFetch(input: string, init: RequestInit = {}) {
  const token = obterToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const resposta = await fetch(input, {
    ...init,
    headers,
  });

  // Token recusado pela API (vencido, usuario removido etc.): volta para o login.
  if (resposta.status === 401 && token && token === obterToken()) {
    avisarSessaoExpirada();
  }

  return resposta;
}

export function authUrl(caminho: string) {
  const token = obterToken();
  // Base da pagina: permite VITE_API_URL relativo (ex.: /api-dev no teste local).
  const url = new URL(`${API_BASE_URL}${caminho}`, window.location.origin);

  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}
