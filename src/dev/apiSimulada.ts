// API SIMULADA - somente em desenvolvimento (npm run dev), ativada com ?simular no endereço.
// Serve para ensaiar e testar o fluxo offline sem o servidor real:
//   http://localhost:5173/?simular
// No console do navegador:
//   simular.offline(true)   -> "desliga a internet" (pedidos falham e o app recebe o evento offline)
//   simular.offline(false)  -> "liga a internet"
//   simular.excluir(13)     -> exclui a solicitacao 13 "no escritorio"
//   simular.estado()        -> mostra o que o "servidor" recebeu
//   simular.reiniciar()     -> volta os dados iniciais
// Qualquer usuario/senha entra como equipe EPI01. O GPS tambem e simulado.

import { API_BASE_URL } from "../lib/api";

type Solicitacao = Record<string, unknown> & { id: number; status: string; solicitacao: string };
type Estado = {
  solicitacoes: Solicitacao[];
  excluidas: number[];
  pontos: Array<Record<string, unknown>>;
  conclusoes: Array<{ id: number; data_conclusao: string }>;
};

const CHAVE = "fieldpro_api_simulada";
// Como o servidor real devolve um DATE do MySQL (meia-noite de Brasilia em UTC).
const hoje = `${new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)}T03:00:00.000Z`;

function estadoInicial(): Estado {
  const base = {
    nome: "Cliente de teste",
    regional: "Teresina",
    municipio: "Teresina",
    prazo: hoje,
    id_equipe: 1,
    telefone: "(86) 99999-0000",
    prioridade: "Normal",
    data_servico: hoje,
    status: "Andamento",
  };
  return {
    solicitacoes: [
      { ...base, id: 13, solicitacao: "1234567890", detalhes: "Endereço: Av. Frei Serafim, Teresina", latitude: "-5.0866", longitude: "-42.8030" },
      { ...base, id: 14, solicitacao: "TCC-0001", detalhes: "Levantamento da apresentação", latitude: "-5.0891", longitude: "-42.8016" },
    ],
    excluidas: [],
    pontos: [],
    conclusoes: [],
  };
}

function ler(): Estado {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE) || "") as Estado;
  } catch {
    return estadoInicial();
  }
}

function gravar(estado: Estado) {
  sessionStorage.setItem(CHAVE, JSON.stringify(estado));
}

let offline = false;
const onLineOriginal = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
Object.defineProperty(navigator, "onLine", {
  configurable: true,
  get: () => !offline && (onLineOriginal?.get?.call(navigator) ?? true),
});

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function tokenFalso() {
  const b = (v: object) => btoa(JSON.stringify(v)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b({ alg: "HS256" })}.${b({ id: 99, perfil: "equipe", id_equipe: 1, exp: Math.floor(Date.now() / 1000) + 12 * 3600 })}.simulado`;
}

const fetchOriginal = window.fetch.bind(window);

window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  const caminhoCompleto = new URL(url, window.location.origin);
  const base = new URL(API_BASE_URL, window.location.origin);

  if (!caminhoCompleto.href.startsWith(base.href)) return fetchOriginal(entrada, init);
  if (offline) throw new TypeError("Failed to fetch");

  await new Promise((resolve) => setTimeout(resolve, 150)); // latencia de rede
  const caminho = caminhoCompleto.pathname.slice(base.pathname.replace(/\/$/, "").length) || "/";
  const metodo = (init?.method || "GET").toUpperCase();
  const corpo = init?.body ? JSON.parse(String(init.body)) : {};
  const estado = ler();
  const existe = (id: number) => estado.solicitacoes.some((s) => s.id === id);
  let m: RegExpMatchArray | null;

  if (metodo === "POST" && caminho === "/login") {
    return json({
      token: tokenFalso(),
      usuario: { id: 99, nome_completo: "Equipe de Teste", user: corpo.user, perfil: "equipe", id_equipe: 1, numero_equipe: "EPI01", veiculo: "carro", placa: "AAA-1234", status: "Ativo" },
    });
  }
  if (caminho === "/equipes") return json([{ id_equipe: 1, numero_equipe: "EPI01", veiculo: "carro", placa: "AAA-1234", status: "Ativo" }]);
  if (caminho === "/sessao/renovar") return json({ token: tokenFalso() });
  if (caminho.startsWith("/presenca") || caminho === "/rota") return json({ ok: true });
  if ((m = caminho.match(/^\/demandas\/\d+$/))) return json(estado.solicitacoes);
  if ((m = caminho.match(/^\/solicitacoes\/(\d+)\/anexos$/))) {
    const id = Number(m[1]);
    return json(id === 14 ? [{ id: "a1", nome_arquivo: "Projeto-TCC.pdf", caminho_arquivo: "/uploads/solicitacoes/14/projeto.pdf", tipo: "application/pdf" }] : []);
  }
  if (caminho.startsWith("/uploads/solicitacoes/")) {
    return new Response(new Blob(["%PDF-1.4\n% arquivo de teste do FieldPro\n"], { type: "application/pdf" }), { status: 200 });
  }
  if ((m = caminho.match(/^\/solicitacoes\/(\d+)\/pontos$/))) {
    const id = Number(m[1]);
    return json(estado.pontos.filter((p) => p.id_solicitacao === id).map((p) => ({ ...p, fotos: [] })));
  }
  if (metodo === "POST" && caminho === "/pontos-coletados") {
    const id = Number(corpo.id_solicitacao);
    if (!existe(id)) return json({ erro: `Solicitacao ${id} nao encontrada. Atualize as demandas antes de sincronizar.` }, 404);
    const ponto = { id: estado.pontos.length + 1, id_solicitacao: id, ordem_ponto: corpo.ordem_ponto, latitude: String(corpo.latitude), longitude: String(corpo.longitude), observacao: corpo.observacao, data_coleta: corpo.data_coleta ?? new Date().toISOString(), total_fotos: (corpo.fotos ?? []).length };
    estado.pontos.push(ponto);
    gravar(estado);
    return json({ mensagem: "Ponto salvo com sucesso", id_ponto_coletado: ponto.id }, 201);
  }
  if ((m = caminho.match(/^\/solicitacoes\/(\d+)\/concluir$/))) {
    const id = Number(m[1]);
    const solicitacao = estado.solicitacoes.find((s) => s.id === id);
    if (!solicitacao) return json({ erro: "Solicitação não encontrada" }, 404);
    if (!["Andamento", "Devolvida"].includes(solicitacao.status)) return json({ erro: `Não é possível concluir uma solicitação em ${solicitacao.status}` }, 400);
    solicitacao.status = "Concluida";
    estado.conclusoes.push({ id, data_conclusao: corpo.data_conclusao ?? new Date().toISOString() });
    gravar(estado);
    return json({ mensagem: "ok", demanda: solicitacao });
  }

  console.warn("[api simulada] rota não simulada:", metodo, caminho);
  return json({ erro: "Rota não simulada" }, 404);
};

// GPS simulado (o navegador do computador normalmente nao tem GPS).
const posicao = { coords: { latitude: -5.0889, longitude: -42.8017, accuracy: 5 }, timestamp: Date.now() } as GeolocationPosition;
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition: (ok: PositionCallback) => setTimeout(() => ok({ ...posicao, timestamp: Date.now() }), 300),
    watchPosition: (ok: PositionCallback) => window.setInterval(() => ok({ ...posicao, timestamp: Date.now() }), 2000),
    clearWatch: (id: number) => window.clearInterval(id),
  },
});

const controle = {
  offline(valor: boolean) {
    offline = valor;
    window.dispatchEvent(new Event(valor ? "offline" : "online"));
    return valor ? "internet DESLIGADA (simulada)" : "internet LIGADA (simulada)";
  },
  excluir(id: number) {
    const estado = ler();
    estado.solicitacoes = estado.solicitacoes.filter((s) => s.id !== id);
    estado.excluidas.push(id);
    gravar(estado);
    return `solicitação ${id} excluída no "escritório"`;
  },
  estado: () => ler(),
  reiniciar() {
    gravar(estadoInicial());
    return "dados simulados reiniciados";
  },
};

(window as unknown as { simular: typeof controle }).simular = controle;
if (!sessionStorage.getItem(CHAVE)) gravar(estadoInicial());
console.info("[FieldPro] API simulada ativa. Use simular.offline(true), simular.excluir(13), simular.estado().");
