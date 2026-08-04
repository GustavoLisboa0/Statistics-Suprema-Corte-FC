import { getAccessToken, tentarRenovarSessao, logout } from "@/lib/auth";

// Ajuste em .env: VITE_API_BASE_URL=http://127.0.0.1:8000
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function fazerRequisicao(path: string, options: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response = await fazerRequisicao(path, options);

  // Sessão expirada: tenta renovar uma vez e repete a requisição original
  if (response.status === 401) {
    const renovou = await tentarRenovarSessao();
    if (renovou) {
      response = await fazerRequisicao(path, options);
    } else {
      logout();
      window.location.href = "/login";
      throw new Error("Sessão expirada");
    }
  }

  if (!response.ok) {
    let detail = `Erro ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      // corpo não era JSON, mantém a mensagem genérica
    }
    throw new Error(detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
};
