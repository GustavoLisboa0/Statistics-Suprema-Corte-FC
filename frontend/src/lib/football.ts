import { api } from "@/lib/api";

export const POSITIONS = ["goleiro", "zagueiro", "lateral", "meio", "atacante"] as const;
export const STATUSES = ["agendada", "realizada", "cancelada"] as const;

export type Position = (typeof POSITIONS)[number];
export type Status = (typeof STATUSES)[number];
export type Venue = "casa" | "fora";
export type Kind = "campeonato" | "amistoso";

export type Player = {
  id: string;
  name: string;
  nickname: string | null;
  position: Position;
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
  posicao: Position;
  numero_camisa: number | null;
  data_nascimento: string | null;
  ativo: boolean;
};

type PartidaApi = {
  id: string;
  data: string;
  adversario: string;
  local: Venue;
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
    position: j.posicao,
    shirt_number: j.numero_camisa,
    birth_date: j.data_nascimento,
    active: j.ativo,
  };
}

function toJogadorPayload(input: PlayerInput) {
  return {
    nome: input.name,
    apelido: input.nickname,
    posicao: input.position,
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
export async function fetchMatches(): Promise<Match[]> {
  const data = await api.get<PartidaApi[]>("/partidas/");
  return data.map(toMatch);
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
