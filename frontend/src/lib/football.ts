import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Posições
// ---------------------------------------------------------------------------
export const POSITIONS = [
  "goleiro",
  "zagueiro",
  "lateral_direito",
  "lateral_esquerdo",
  "volante",
  "meia",
  "meia_esquerda",
  "meia_direita",
  "meia_atacante",
  "atacante",
  "ponta_esquerda",
  "ponta_direita",
  "centro_avante",
] as const;

export type Position = (typeof POSITIONS)[number];

// Limites do cadastro de jogador (a primeira posição é a principal)
export const MAX_POSITIONS = 3;
export const MAX_NAME_LENGTH = 100;
export const MAX_NICKNAME_LENGTH = 30;
export const MAX_SHIRT_DIGITS = 3;

/** Nome não pode conter dígitos. */
export function nameHasDigits(name: string): boolean {
  return /\d/.test(name);
}

export const POSITION_LABELS: Record<Position, string> = {
  goleiro: "Goleiro",
  zagueiro: "Zagueiro",
  lateral_direito: "Lateral Direito",
  lateral_esquerdo: "Lateral Esquerdo",
  volante: "Volante",
  meia: "Meia",
  meia_esquerda: "Meia Esquerda",
  meia_direita: "Meia Direita",
  meia_atacante: "Meia Atacante",
  atacante: "Atacante",
  ponta_esquerda: "Ponta Esquerda",
  ponta_direita: "Ponta Direita",
  centro_avante: "Centro Avante",
};

export const POSITION_ABBR: Record<Position, string> = {
  goleiro: "GOL",
  zagueiro: "ZAG",
  lateral_direito: "LD",
  lateral_esquerdo: "LE",
  volante: "VOL",
  meia: "MEI",
  meia_esquerda: "ME",
  meia_direita: "MD",
  meia_atacante: "MA",
  atacante: "ATA",
  ponta_esquerda: "PE",
  ponta_direita: "PD",
  centro_avante: "CA",
};

// Categorias "macro" usadas pra agrupar/filtrar o painel de jogadores
export const CATEGORIES = ["goleiro", "defesa", "meio", "ataque"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  goleiro: "Goleiro",
  defesa: "Defesa",
  meio: "Meio Campo",
  ataque: "Ataque",
};

export const POSITION_CATEGORY: Record<Position, Category> = {
  goleiro: "goleiro",
  zagueiro: "defesa",
  lateral_direito: "defesa",
  lateral_esquerdo: "defesa",
  volante: "meio",
  meia: "meio",
  meia_esquerda: "meio",
  meia_direita: "meio",
  meia_atacante: "meio",
  atacante: "ataque",
  ponta_esquerda: "ataque",
  ponta_direita: "ataque",
  centro_avante: "ataque",
};

// ---------------------------------------------------------------------------
// Status da partida
// ---------------------------------------------------------------------------
export const STATUSES = ["agendada", "realizada", "cancelada"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

/** Usado nos títulos das seções da tela de partidas. */
export const STATUS_LABELS_PLURAL: Record<Status, string> = {
  agendada: "Agendadas",
  realizada: "Realizadas",
  cancelada: "Canceladas",
};

// ---------------------------------------------------------------------------
// Local (campo físico) e mando de campo
// ---------------------------------------------------------------------------
export const VENUES = ["trieste", "iguacu", "outro"] as const;
export type Venue = (typeof VENUES)[number];

export const VENUE_LABELS: Record<Venue, string> = {
  trieste: "Trieste",
  iguacu: "Iguaçu",
  outro: "Outro campo",
};

export const MANDOS = ["mandante", "visitante"] as const;
export type Mando = (typeof MANDOS)[number];

export const MANDO_LABELS: Record<Mando, string> = {
  mandante: "Mandante",
  visitante: "Visitante",
};

export type Kind = "campeonato" | "amistoso";

// ---------------------------------------------------------------------------
// Resultado da partida (do ponto de vista do Suprema Corte)
// ---------------------------------------------------------------------------
export type Result = "vitoria" | "empate" | "derrota";

export const RESULT_LABELS: Record<Result, string> = {
  vitoria: "Vitória",
  empate: "Empate",
  derrota: "Derrota",
};

/** Resultado de uma partida já realizada; `null` enquanto não houver placar. */
export function matchResult(match: {
  status: Status;
  goals_for: number | null;
  goals_against: number | null;
}): Result | null {
  if (match.status !== "realizada") return null;
  const gf = match.goals_for ?? 0;
  const ga = match.goals_against ?? 0;
  if (gf > ga) return "vitoria";
  if (gf < ga) return "derrota";
  return "empate";
}

export const TEAM_NAME = "Suprema Corte FC";

/** Título padrão de exibição de uma partida: "Suprema Corte FC × Adversário" */
export function matchTitle(match: { opponent: string }): string {
  return `${TEAM_NAME} × ${match.opponent}`;
}

// ---------------------------------------------------------------------------
// Tipos usados pelas telas
// ---------------------------------------------------------------------------
export type Player = {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  positions: Position[];
  shirt_number: number | null;
  birth_date: string | null;
  active: boolean;
};

export type PlayerInput = Omit<Player, "id">;

export type Match = {
  id: string;
  match_date: string;
  opponent: string;
  venue: Venue;
  venue_detail: string | null;
  mando: Mando;
  status: Status;
  kind: Kind;
  notes: string | null;
  goals_for: number | null;
  goals_against: number | null;
};

export type MatchInput = Omit<Match, "id">;

export type MatchStat = {
  id: string;
  match_id: string;
  player_id: string;
  /** Posição em que atuou nesta partida; null em lançamentos antigos. */
  position: Position | null;
  starter: boolean;
  minutes: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  goals_conceded: number;
};

export type MatchStatInput = Omit<MatchStat, "id" | "match_id" | "player_id">;

// ---------------------------------------------------------------------------
// Formatos crus como o backend FastAPI devolve (nomes em português)
// ---------------------------------------------------------------------------
type JogadorApi = {
  id: string;
  nome: string;
  apelido: string | null;
  telefone: string | null;
  posicoes: Position[];
  numero_camisa: number | null;
  data_nascimento: string | null;
  ativo: boolean;
};

type PartidaApi = {
  id: string;
  data: string;
  adversario: string;
  local: Venue;
  local_detalhe: string | null;
  mando: Mando;
  status: Status;
  placar_suprema: number;
  placar_adversario: number;
  campeonato_ou_amistoso: string | null;
  observacoes: string | null;
};

type EstatisticaApi = {
  id: string;
  jogador_id: string;
  partida_id: string;
  posicao: Position | null;
  gols: number;
  assistencias: number;
  cartoes_amarelos: number;
  cartoes_vermelhos: number;
  minutos_jogados: number;
  titular: boolean;
  defesas: number | null;
  gols_sofridos: number | null;
};

// ---------------------------------------------------------------------------
// Tradução: API (português) <-> tipos usados pelas telas (inglês)
// ---------------------------------------------------------------------------
function toPlayer(j: JogadorApi): Player {
  return {
    id: j.id,
    name: j.nome,
    nickname: j.apelido,
    phone: j.telefone,
    positions: j.posicoes,
    shirt_number: j.numero_camisa,
    birth_date: j.data_nascimento,
    active: j.ativo,
  };
}

function toJogadorPayload(input: PlayerInput) {
  return {
    nome: input.name,
    apelido: input.nickname,
    telefone: input.phone,
    posicoes: input.positions,
    numero_camisa: input.shirt_number,
    data_nascimento: input.birth_date,
    ativo: input.active,
  };
}

function toMatch(p: PartidaApi): Match {
  const kind: Kind = p.campeonato_ou_amistoso === "amistoso" ? "amistoso" : "campeonato";
  return {
    id: p.id,
    match_date: p.data,
    opponent: p.adversario,
    venue: p.local,
    venue_detail: p.local_detalhe,
    mando: p.mando,
    status: p.status,
    kind,
    notes: p.observacoes,
    goals_for: p.status === "realizada" ? p.placar_suprema : null,
    goals_against: p.status === "realizada" ? p.placar_adversario : null,
  };
}

function toPartidaPayload(input: MatchInput) {
  return {
    data: input.match_date,
    adversario: input.opponent,
    local: input.venue,
    local_detalhe: input.venue === "outro" ? input.venue_detail : null,
    mando: input.mando,
    status: input.status,
    campeonato_ou_amistoso: input.kind,
    observacoes: input.notes,
    placar_suprema: input.goals_for ?? 0,
    placar_adversario: input.goals_against ?? 0,
  };
}

function toMatchStat(e: EstatisticaApi): MatchStat {
  return {
    id: e.id,
    match_id: e.partida_id,
    player_id: e.jogador_id,
    position: e.posicao,
    starter: e.titular,
    minutes: e.minutos_jogados,
    goals: e.gols,
    assists: e.assistencias,
    yellow_cards: e.cartoes_amarelos,
    red_cards: e.cartoes_vermelhos,
    saves: e.defesas ?? 0,
    goals_conceded: e.gols_sofridos ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Jogadores
// ---------------------------------------------------------------------------
export async function fetchPlayers(): Promise<Player[]> {
  const data = await api.get<JogadorApi[]>("/jogadores/");
  return data.map(toPlayer).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createPlayer(input: PlayerInput): Promise<void> {
  await api.post("/jogadores/", toJogadorPayload(input));
}

export async function updatePlayer(id: string, input: PlayerInput): Promise<void> {
  await api.patch(`/jogadores/${id}`, toJogadorPayload(input));
}

export async function deletePlayer(id: string): Promise<void> {
  await api.del(`/jogadores/${id}`);
}

// ---------------------------------------------------------------------------
// Partidas
// ---------------------------------------------------------------------------
/**
 * Ordena as partidas pela proximidade com hoje: primeiro as que ainda vão
 * acontecer (da mais próxima para a mais distante) e, na sequência, as que já
 * passaram (da mais recente para a mais antiga).
 */
export function sortMatches(matches: Match[]): Match[] {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;

  return [...matches].sort((a, b) => {
    const aUpcoming = a.match_date >= today;
    const bUpcoming = b.match_date >= today;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming
      ? a.match_date.localeCompare(b.match_date)
      : b.match_date.localeCompare(a.match_date);
  });
}

export async function fetchMatches(): Promise<Match[]> {
  const data = await api.get<PartidaApi[]>("/partidas/");
  return sortMatches(data.map(toMatch));
}

export async function createMatch(input: MatchInput): Promise<void> {
  await api.post("/partidas/", toPartidaPayload(input));
}

export async function updateMatch(id: string, input: MatchInput): Promise<void> {
  await api.patch(`/partidas/${id}`, toPartidaPayload(input));
}

export async function deleteMatch(id: string): Promise<void> {
  await api.del(`/partidas/${id}`);
}

// ---------------------------------------------------------------------------
// Estatísticas
// ---------------------------------------------------------------------------
export async function fetchMatchStats(matchId: string): Promise<MatchStat[]> {
  const data = await api.get<EstatisticaApi[]>(`/estatisticas/?partida_id=${matchId}`);
  return data.map(toMatchStat);
}

export async function fetchAllStats(): Promise<MatchStat[]> {
  const data = await api.get<EstatisticaApi[]>("/estatisticas/");
  return data.map(toMatchStat);
}

/**
 * Salva (cria ou atualiza) as estatísticas de vários jogadores para uma partida.
 * `existing` é a lista já carregada via fetchMatchStats — usada pra saber se
 * cada jogador já tem uma linha (PATCH) ou não (POST) nessa partida.
 */
export async function upsertMatchStats(
  matchId: string,
  rows: Record<string, MatchStatInput>,
  existing: MatchStat[],
): Promise<void> {
  const byPlayer = new Map(existing.map((s) => [s.player_id, s]));

  for (const [playerId, r] of Object.entries(rows)) {
    const payload = {
      jogador_id: playerId,
      partida_id: matchId,
      posicao: r.position,
      titular: r.starter,
      minutos_jogados: r.minutes,
      gols: r.goals,
      assistencias: r.assists,
      cartoes_amarelos: r.yellow_cards,
      cartoes_vermelhos: r.red_cards,
      defesas: r.saves,
      gols_sofridos: r.goals_conceded,
    };

    const found = byPlayer.get(playerId);
    if (found) {
      await api.patch(`/estatisticas/${found.id}`, payload);
    } else {
      await api.post("/estatisticas/", payload);
    }
  }
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------
export const PHONE_REGEX = /^\(\d{2}\) \d{5}-\d{4}$/;

/** Formata dígitos digitados progressivamente como "(DDD) 91234-1234". */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
