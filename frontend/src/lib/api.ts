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

const MSG_INDISPONIVEL = "Servidor indisponível, tente de novo";

/**
 * Servidor ou Supabase fora do ar (503) ou limitando requisições (429): a
 * sessão continua e o erro sobe com o status. O aviso na tela fica com quem
 * chamou: o QueryCache do router.tsx (buscas) ou o onError de cada mutação.
 */
function servidorIndisponivel(status = 503): never {
  const erro = new Error(MSG_INDISPONIVEL) as Error & { status?: number };
  erro.status = status;
  throw erro;
}

async function fazerRequisicao(
  path: string,
  options: RequestInit,
): Promise<{ response: Response; token: string | null }> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return { response: await fetch(`${API_BASE}${path}`, { ...options, headers }), token };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const primeira = await fazerRequisicao(path, options);
  let response = primeira.response;

  // Sessão expirada: renova (uma renovação por vez, compartilhada) e repete a
  // requisição original uma vez. Só um 401 de verdade desloga.
  if (response.status === 401) {
    const atual = getAccessToken();
    // Outra requisição já renovou enquanto esta estava no ar: só repete.
    const jaRenovada = atual !== null && atual !== primeira.token;
    const resultado = jaRenovada ? "renovada" : await tentarRenovarSessao();
    if (resultado === "renovada") {
      response = (await fazerRequisicao(path, options)).response;
    } else if (resultado === "indisponivel") {
      servidorIndisponivel();
    } else {
      logout();
      window.location.href = "/login";
      throw new Error("Sessão expirada");
    }
  }

  if (response.status === 503 || response.status === 429) servidorIndisponivel(response.status);

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
