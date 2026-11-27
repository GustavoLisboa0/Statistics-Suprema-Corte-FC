const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const STORAGE_KEY = "sc_fc_sessao";

export type Papel = "editor" | "visualizador";

/** Rótulo exibido pro usuário — o valor interno (`Papel`) continua igual, isso é só texto de tela. */
export const PAPEL_LABELS: Record<Papel, string> = {
  editor: "Administrador",
  visualizador: "Usuário",
};

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

/** Erro de uma chamada `/auth/*`, com o status HTTP (ausente em falha de rede). */
type ErroAuth = Error & { status?: number };

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
    const erro: ErroAuth = new Error(detail);
    erro.status = response.status;
    throw erro;
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

/**
 * Resultado de uma tentativa de renovar a sessão:
 * - `renovada`: há um access_token novo salvo;
 * - `invalida`: o servidor recusou a sessão (401). A sessão local é apagada;
 * - `indisponivel`: o servidor ou o Supabase não respondeu (503, 429, falha de
 *   rede). A sessão local continua, para tentar de novo depois.
 */
export type ResultadoRenovacao = "renovada" | "invalida" | "indisponivel";

// Uma renovação por vez: quando várias requisições recebem 401 juntas (o
// dashboard dispara 5), todas esperam a mesma chamada em vez de mandar o
// mesmo refresh_token N vezes. Com rotação de refresh token no Supabase, usos
// concorrentes podem revogar a sessão.
let renovacaoEmAndamento: Promise<ResultadoRenovacao> | null = null;

async function renovarSessao(): Promise<ResultadoRenovacao> {
  const atual = readSession();
  if (!atual) return "invalida";
  try {
    const nova = await chamarAuth<Sessao>("/auth/refresh", {
      refresh_token: atual.refresh_token,
    });
    writeSession(nova);
    return "renovada";
  } catch (e) {
    const status = (e as ErroAuth).status;
    // Sem status = fetch nem chegou ao servidor (rede caiu, servidor dormindo).
    if (status === undefined || status === 429 || status >= 500) return "indisponivel";
    clearSession();
    return "invalida";
  }
}

/** Troca o refresh_token por um novo access_token, uma chamada por vez. */
export function tentarRenovarSessao(): Promise<ResultadoRenovacao> {
  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = renovarSessao().finally(() => {
      renovacaoEmAndamento = null;
    });
  }
  return renovacaoEmAndamento;
}

export function getAccessToken(): string | null {
  return readSession()?.access_token ?? null;
}
