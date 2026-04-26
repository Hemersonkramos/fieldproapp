export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const TOKEN_KEY = "fieldpro_app_token";

export function salvarToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function obterToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function authFetch(input: string, init: RequestInit = {}) {
  const token = obterToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export function authUrl(caminho: string) {
  const token = obterToken();
  const url = new URL(`${API_BASE_URL}${caminho}`);

  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}
