const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const STORAGE_KEY = "sc_fc_sessao";

export type Papel = "editor" | "visualizador";

export type Usuario = {
  id: string;
  email: string;
  papel: Papel;
  /** Digitados no cadastro; servem só pra pré-preencher a tela de criação do jogador. */
  nome: string | null;
  telefone: string | null;
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
    let detail = "Não foi possível concluir a operação";
    try {
      const data = (await response.json()) as { detail?: unknown };
      // Erro do FastAPI é string; erro de validação do Pydantic vem como
      // lista de objetos — nesse caso pega a primeira mensagem.
      if (typeof data.detail === "string") {
        detail = data.detail;
      } else if (Array.isArray(data.detail)) {
        const primeiro = data.detail[0] as { msg?: string } | undefined;
        if (primeiro?.msg) detail = primeiro.msg;
      }
    } catch {
      // corpo não era JSON, mantém a mensagem genérica
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

type RespostaCadastro = {
  sessao: Sessao | null;
  precisa_confirmar_email: boolean;
};

/**
 * Cria a conta do usuário (nome/telefone são só do cadastro em si; o
 * jogador é criado ou revisado na tela seguinte, `/meu-jogador`).
 *
 * Se o projeto do Supabase não exigir confirmação de email, já volta a sessão
 * pronta e o usuário entra direto.
 */
export async function cadastrar(
  nome: string,
  telefone: string,
  email: string,
  password: string,
): Promise<RespostaCadastro> {
  const resposta = await chamarAuth<RespostaCadastro>("/auth/cadastro", {
    nome,
    telefone,
    email,
    password,
  });
  if (resposta.sessao) writeSession(resposta.sessao);
  return resposta;
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
