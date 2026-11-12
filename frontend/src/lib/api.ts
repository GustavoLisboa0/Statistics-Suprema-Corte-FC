import { getAccessToken, tentarRenovarSessao, logout } from "@/lib/auth";

// Ajuste em .env: VITE_API_BASE_URL=http://127.0.0.1:8000
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

/**
 * "Acorda" o servidor. No plano gratuito da Render o backend hiberna depois de
 * ~15 min sem uso e a primeira requisição leva dezenas de segundos para
 * ligá-lo. Disparar um ping assim que o site abre (inclusive na tela de
 * login) faz esse tempo correr enquanto a pessoa digita a senha, em vez de
 * aparecer como uma tela travada depois do login. Resposta ignorada
 * (`no-cors`: só precisa chegar no servidor).
 */
export function acordarServidor(): void {
  try {
    void fetch(`${API_BASE}/`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  } catch {
    // sem rede ou fetch indisponível: não faz diferença
  }
}

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
    const erro = new Error(detail) as Error & { status?: number };
    erro.status = response.status;
    throw erro;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
};
