import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Posições
// ---------------------------------------------------------------------------
export const POSITIONS = [
  "goleiro",
  "lateral_direito",
  "lateral_esquerdo",
  "zagueiro",
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

export type Position = (typeof POSITIONS)[number] | "zagueiro" | "lateral" | "meio";

export const POSITION_LABELS: Record<Position, string> = {
  goleiro: "Goleiro",
  lateral_direito: "Lateral Direito",
  lateral_esquerdo: "Lateral Esquerdo",
  zagueiro: "Zagueiro",
  volante: "Volante",
  meia: "Meia",
  meia_esquerda: "Meia Esquerda",
  meia_direita: "Meia Direita",
  meia_atacante: "Meia Atacante",
  atacante: "Atacante",
  ponta_esquerda: "Ponta Esquerda",
  ponta_direita: "Ponta Direita",
  centro_avante: "Centro Avante",
  zagueiro: "Zagueiro",
  lateral: "Lateral",
  meio: "Meio",
};

export const POSITION_ABBR: Record<Position, string> = {
  goleiro: "GOL",
  lateral_direito: "LD",
  lateral_esquerdo: "LE",
  zagueiro: "ZAG",
  volante: "VOL",
  meia: "MEI",
  meia_esquerda: "ME",
  meia_direita: "MD",
  meia_atacante: "MA",
  atacante: "ATA",
  ponta_esquerda: "PE",
  ponta_direita: "PD",
  centro_avante: "CA",
  zagueiro: "ZAG",
  lateral: "LAT",
  meio: "MEI",
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

export type Kind = "campeonato" | "amistoso";

// ---------------------------------------------------------------------------
// Local e mando
// ---------------------------------------------------------------------------
export const VENUES = ["trieste", "iguacu", "outro"] as const;
export type Venue = (typeof VENUES)[number] | "casa" | "fora";

export const VENUE_LABELS: Record<Venue, string> = {
  trieste: "Trieste",
  iguacu: "Iguaçu",
  outro: "Outro campo",
  casa: "Casa",
  fora: "Fora",
};

export const MANDOS = ["mandante", "visitante"] as const;
export type Mando = (typeof MANDOS)[number];

export const MANDO_LABELS: Record<Mando, string> = {
  mandante: "Mandante",
  visitante: "Visitante",
};

export const TEAM_NAME = "Suprema Corte FC";

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
  position: Position;
  positions: Position[];
  shirt_number: number | null;
  birth_date: string | null;
  active: boolean;
};

export type PlayerInput = {
  name: string;
  nickname: string | null;
  positions: Position[];
  shirt_number: number | null;
  birth_date: string | null;
  active: boolean;
};

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
// Formatos crus como o backend FastAPI devolve
// ---------------------------------------------------------------------------
type JogadorApi = {
  id: string;
  nome: string;
  apelido: string | null;
  posicao?: Position;
  posicoes?: Position[];
  numero_camisa: number | null;
  data_nascimento: string | null;
  ativo: boolean;
};

type PartidaApi = {
  id: string;
  data: string;
  adversario: string;
  local: Venue;
  local_detalhe?: string | null;
  mando?: Mando;
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
// Tradução: API <-> tipos usados pelas telas
// ---------------------------------------------------------------------------
function normalizePositions(player: JogadorApi): Position[] {
  if (player.posicoes && player.posicoes.length > 0) {
    return player.posicoes;
  }
  if (player.posicao) {
    return [player.posicao];
  }
  return ["goleiro"];
}

function toPlayer(player: JogadorApi): Player {
  const positions = normalizePositions(player);
  return {
    id: player.id,
    name: player.nome,
    nickname: player.apelido,
    position: positions[0],
    positions,
    shirt_number: player.numero_camisa,
    birth_date: player.data_nascimento,
    active: player.ativo,
  };
}

function toJogadorPayload(input: PlayerInput) {
  return {
    nome: input.name,
    apelido: input.nickname,
    position: input.positions[0],
    posicao: input.positions[0],
    posicoes: input.positions,
    numero_camisa: input.shirt_number,
    data_nascimento: input.birth_date,
    ativo: input.active,
  };
}

function toMatch(match: PartidaApi): Match {
  const kind: Kind = match.campeonato_ou_amistoso === "amistoso" ? "amistoso" : "campeonato";
  const mando: Mando =
    match.mando ?? (match.local === "fora" ? "visitante" : "mandante");

  return {
    id: match.id,
    match_date: match.data,
    opponent: match.adversario,
    venue: match.local,
    venue_detail: match.local_detalhe ?? null,
    mando,
    status: match.status,
    kind,
    notes: match.observacoes,
    goals_for: match.status === "realizada" ? match.placar_suprema : null,
    goals_against: match.status === "realizada" ? match.placar_adversario : null,
  };
}

function toPartidaPayload(input: MatchInput) {
  return {
    data: input.match_date,
    adversario: input.opponent,
    local: input.venue,
    local_detalhe: input.venue_detail,
    mando: input.mando,
    status: input.status,
    campeonato_ou_amistoso: input.kind,
    observacoes: input.notes,
    placar_suprema: input.goals_for ?? 0,
    placar_adversario: input.goals_against ?? 0,
  };
}

function toMatchStat(stat: EstatisticaApi): MatchStat {
  return {
    id: stat.id,
    match_id: stat.partida_id,
    player_id: stat.jogador_id,
    starter: stat.titular,
    minutes: stat.minutos_jogados,
    goals: stat.gols,
    assists: stat.assistencias,
    yellow_cards: stat.cartoes_amarelos,
    red_cards: stat.cartoes_vermelhos,
    saves: stat.defesas ?? 0,
    goals_conceded: stat.gols_sofridos ?? 0,
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

export async function upsertMatchStats(
  matchId: string,
  rows: Record<string, MatchStatInput>,
  existing: MatchStat[],
): Promise<void> {
  const byPlayer = new Map(existing.map((stat) => [stat.player_id, stat]));

  for (const [playerId, row] of Object.entries(rows)) {
    const payload = {
      jogador_id: playerId,
      partida_id: matchId,
      titular: row.starter,
      minutos_jogados: row.minutes,
      gols: row.goals,
      assistencias: row.assists,
      cartoes_amarelos: row.yellow_cards,
      cartoes_vermelhos: row.red_cards,
      defesas: row.saves,
      gols_sofridos: row.goals_conceded,
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
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
