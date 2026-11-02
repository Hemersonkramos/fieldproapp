// Fotos dos levantamentos feitos sem internet ficam no IndexedDB do navegador.
// O localStorage tem limite de ~5 MB (poucas fotos); o IndexedDB comporta centenas de MB.
// A fila de sincronizacao (localStorage) guarda so a chave de cada foto.

const NOME_BANCO = "fieldpro-offline";
const LOJA = "fotos";
// Anexos das solicitacoes (PDF/fotos) baixados para consulta offline.
const LOJA_ANEXOS = "anexos";
export const PREFIXO_FOTO_LOCAL = "idb:";

let bancoPromessa: Promise<IDBDatabase> | null = null;

function abrirBanco() {
  if (!bancoPromessa) {
    bancoPromessa = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB indisponível neste navegador."));
        return;
      }
      // Versao 2: inclui a loja de anexos (quem ja tinha a versao 1 so ganha a loja nova).
      const pedido = indexedDB.open(NOME_BANCO, 2);
      pedido.onupgradeneeded = () => {
        if (!pedido.result.objectStoreNames.contains(LOJA)) {
          pedido.result.createObjectStore(LOJA);
        }
        if (!pedido.result.objectStoreNames.contains(LOJA_ANEXOS)) {
          pedido.result.createObjectStore(LOJA_ANEXOS);
        }
      };
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => reject(pedido.error ?? new Error("Erro ao abrir o IndexedDB."));
    });
    // Se falhar, permite tentar de novo depois.
    bancoPromessa.catch(() => {
      bancoPromessa = null;
    });
  }
  return bancoPromessa;
}

function executar<T>(
  modo: IDBTransactionMode,
  acao: (loja: IDBObjectStore) => IDBRequest<T> | void,
  nomeLoja: string = LOJA
) {
  return abrirBanco().then(
    (banco) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transacao = banco.transaction(nomeLoja, modo);
        const pedido = acao(transacao.objectStore(nomeLoja));
        transacao.oncomplete = () => resolve(pedido ? pedido.result : undefined);
        transacao.onerror = () => reject(transacao.error ?? new Error("Erro no IndexedDB."));
        transacao.onabort = () => reject(transacao.error ?? new Error("Gravação no IndexedDB cancelada."));
      })
  );
}

export function salvarFotoOffline(chave: string, dataUrl: string) {
  return executar("readwrite", (loja) => loja.put(dataUrl, chave)).then(() => undefined);
}

export async function lerFotoOffline(chave: string) {
  const valor = await executar<string>("readonly", (loja) => loja.get(chave));
  return typeof valor === "string" ? valor : undefined;
}

export function removerFotosOffline(chaves: string[]) {
  if (chaves.length === 0) return Promise.resolve();
  return executar("readwrite", (loja) => {
    chaves.forEach((chave) => loja.delete(chave));
  })
    .then(() => undefined)
    .catch((erro) => console.warn("Não foi possível apagar fotos offline:", erro));
}

export function ehFotoLocal(dataUrl?: string) {
  return Boolean(dataUrl?.startsWith(PREFIXO_FOTO_LOCAL));
}

/** Resolve "idb:chave" para o conteudo da foto; outros valores voltam como estao. */
export async function resolverFotoLocal(dataUrl?: string) {
  if (!dataUrl || !ehFotoLocal(dataUrl)) return dataUrl;
  try {
    return await lerFotoOffline(dataUrl.slice(PREFIXO_FOTO_LOCAL.length));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Anexos (arquivo inteiro como Blob), chave = caminho do arquivo na API.

export function salvarAnexoOffline(caminho: string, arquivo: Blob) {
  return executar("readwrite", (loja) => loja.put(arquivo, caminho), LOJA_ANEXOS).then(() => undefined);
}

export async function lerAnexoOffline(caminho: string) {
  try {
    const valor = await executar<Blob>("readonly", (loja) => loja.get(caminho), LOJA_ANEXOS);
    return valor instanceof Blob ? valor : undefined;
  } catch {
    return undefined;
  }
}

export async function temAnexoOffline(caminho: string) {
  try {
    const total = await executar<number>("readonly", (loja) => loja.count(caminho), LOJA_ANEXOS);
    return (total ?? 0) > 0;
  } catch {
    return false;
  }
}
