const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const STORAGE_KEY = "sc_fc_sessao";

export type Papel = "editor" | "visualizador";

export type Usuario = {
  id: string;
  email: string;
  papel: Papel;
};

type Sessao = {
  access_token: string;
  refresh_token: string;
  usuario: Usuario;
};

function readSession(): Sessao | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Sessao;
  } catch {
    return null;
  }
}

function writeSession(sessao: Sessao) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessao));
}

function clearSession() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getSession(): Sessao | null {
  return readSession();
}

export function getUsuario(): Usuario | null {
  return readSession()?.usuario ?? null;
}

export function isAutenticado(): boolean {
  return readSession() !== null;
}

async function chamarAuth<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = "Não foi possível entrar";
    try {
      const data = (await response.json()) as { detail?: string };
      detail = data.detail ?? detail;
    } catch {
      // ignora
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<Usuario> {
  const sessao = await chamarAuth<Sessao>("/auth/login", { email, password });
  writeSession(sessao);
  return sessao.usuario;
}

export function logout() {
  clearSession();
}

/** Troca o refresh_token por um novo access_token. Retorna false se não deu certo. */
export async function tentarRenovarSessao(): Promise<boolean> {
  const atual = readSession();
  if (!atual) return false;
  try {
    const nova = await chamarAuth<Sessao>("/auth/refresh", {
      refresh_token: atual.refresh_token,
    });
    writeSession(nova);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

export function getAccessToken(): string | null {
  return readSession()?.access_token ?? null;
}
