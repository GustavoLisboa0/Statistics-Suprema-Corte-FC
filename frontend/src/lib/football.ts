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

// ---------------------------------------------------------------------------
// Presença e rateio
// ---------------------------------------------------------------------------
export type PresenceStatus = "confirmado" | "espera" | "ausente";
export type PaymentStatus = "pendente" | "pago";

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  confirmado: "Confirmado",
  espera: "Lista de espera",
  ausente: "Não vou",
};

/** Vagas de linha por partida: o time joga com no mínimo 10 e no máximo 20. */
export const MIN_LINE_SLOTS = 10;
export const MAX_LINE_SLOTS = 20;

export type Presence = {
  id: string;
  match_id: string;
  player_id: string;
  status: PresenceStatus;
  position: Position | null;
  terms_accepted: boolean;
  payment_status: PaymentStatus;
};

/**
 * Quanto o time paga pela partida.
 *
 * Quadra e arbitragem são rachadas com o adversário; o goleiro é despesa só
 * nossa. Espelha `custo_do_time()` do backend — se mudar lá, mude aqui.
 */
export function teamCost(match: Pick<Match, "court_fee" | "referee_fee" | "keeper_fee">): number {
  return (match.court_fee ?? 0) / 2 + (match.referee_fee ?? 0) / 2 + (match.keeper_fee ?? 0);
}

/** Valor por jogador de linha. `null` quando ainda não dá pra calcular. */
export function feePerPlayer(
  match: Pick<Match, "court_fee" | "referee_fee" | "keeper_fee" | "line_slots">,
): number | null {
  const total = teamCost(match);
  if (!match.line_slots || total <= 0) return null;
  return total / match.line_slots;
}

export function formatMoney(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  /** Casa a conta de login com o jogador do elenco. */
  email: string | null;
  positions: Position[];
  shirt_number: number | null;
  birth_date: string | null;
  active: boolean;
};

export type PlayerInput = Omit<Player, "id">;

/**
 * Clima de Curitiba no horário do jogo — sempre calculado pelo backend.
 *
 * `source` diz se é previsão (jogo no futuro, `rain_chance` em %) ou o
 * clima que realmente ocorreu (jogo no passado, `rain_mm` medidos) — só um
 * dos dois vem preenchido, dependendo da fonte.
 */
export type Weather = {
  temperature: number;
  condition: string;
  rain_chance: number | null;
  rain_mm: number | null;
  wind: number | null;
  updated_at: string;
  source: "previsao" | "historico";
};

export type Match = {
  id: string;
  match_date: string;
  /** Horário do jogo ("HH:MM:SS"); null em partidas antigas, sem ele. */
  kickoff_time: string | null;
  opponent: string;
  venue: Venue;
  venue_detail: string | null;
  mando: Mando;
  status: Status;
  kind: Kind;
  notes: string | null;
  goals_for: number | null;
  goals_against: number | null;
  /** Vagas de jogadores de linha (goleiro não ocupa vaga). */
  line_slots: number | null;
  court_fee: number | null;
  referee_fee: number | null;
  keeper_fee: number | null;
  /**
   * Null enquanto não buscou, se a data está fora da janela de previsão
   * (~16 dias) ou se a partida é antiga demais pra ter horário salvo.
   */
  weather: Weather | null;
};

// `weather` nunca vem do cliente — é sempre calculado pelo backend.
export type MatchInput = Omit<Match, "id" | "weather">;

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
  email: string | null;
  posicoes: Position[];
  numero_camisa: number | null;
  data_nascimento: string | null;
  ativo: boolean;
};

type ClimaApi = {
  temperatura: number;
  condicao: string;
  chance_chuva: number | null;
  chuva_mm: number | null;
  vento: number | null;
  atualizado_em: string;
  fonte: "previsao" | "historico";
};

type PartidaApi = {
  id: string;
  data: string;
  horario: string | null;
  adversario: string;
  local: Venue;
  local_detalhe: string | null;
  mando: Mando;
  status: Status;
  placar_suprema: number;
  placar_adversario: number;
  campeonato_ou_amistoso: string | null;
  observacoes: string | null;
  vagas_linha: number | null;
  valor_quadra: number | string | null;
  valor_arbitragem: number | string | null;
  valor_goleiro: number | string | null;
  clima: ClimaApi | null;
};

type PresencaApi = {
  id: string;
  partida_id: string;
  jogador_id: string;
  status: PresenceStatus;
  posicao: Position | null;
  termos_aceitos: boolean;
  status_pagamento: PaymentStatus;
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
    email: j.email,
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
    email: input.email,
    posicoes: input.positions,
    numero_camisa: input.shirt_number,
    data_nascimento: input.birth_date,
    ativo: input.active,
  };
}

function toWeather(c: ClimaApi | null): Weather | null {
  if (!c) return null;
  return {
    temperature: c.temperatura,
    condition: c.condicao,
    rain_chance: c.chance_chuva,
    rain_mm: c.chuva_mm,
    wind: c.vento,
    updated_at: c.atualizado_em,
    source: c.fonte,
  };
}

function toMatch(p: PartidaApi): Match {
  const kind: Kind = p.campeonato_ou_amistoso === "amistoso" ? "amistoso" : "campeonato";
  return {
    id: p.id,
    match_date: p.data,
    kickoff_time: p.horario,
    opponent: p.adversario,
    venue: p.local,
    venue_detail: p.local_detalhe,
    mando: p.mando,
    status: p.status,
    kind,
    notes: p.observacoes,
    goals_for: p.status === "realizada" ? p.placar_suprema : null,
    goals_against: p.status === "realizada" ? p.placar_adversario : null,
    line_slots: p.vagas_linha,
    // numeric do Postgres chega como string ("300.00"); normaliza pra número
    court_fee: toNumber(p.valor_quadra),
    referee_fee: toNumber(p.valor_arbitragem),
    keeper_fee: toNumber(p.valor_goleiro),
    weather: toWeather(p.clima),
  };
}

function toNumber(valor: number | string | null): number | null {
  if (valor === null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function toPartidaPayload(input: MatchInput) {
  return {
    data: input.match_date,
    horario: input.kickoff_time,
    adversario: input.opponent,
    local: input.venue,
    local_detalhe: input.venue === "outro" ? input.venue_detail : null,
    mando: input.mando,
    status: input.status,
    campeonato_ou_amistoso: input.kind,
    observacoes: input.notes,
    placar_suprema: input.goals_for ?? 0,
    placar_adversario: input.goals_against ?? 0,
    vagas_linha: input.line_slots,
    valor_quadra: input.court_fee,
    valor_arbitragem: input.referee_fee,
    valor_goleiro: input.keeper_fee,
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

/** Jogador vinculado à conta logada, ou `null` se ela ainda não tem um. */
export async function fetchMeuJogador(): Promise<Player | null> {
  try {
    const data = await api.get<JogadorApi>("/jogadores/meu");
    return toPlayer(data);
  } catch (e) {
    if (e instanceof Error && (e as Error & { status?: number }).status === 404) return null;
    throw e;
  }
}

/** Autoatendimento: a própria conta logada cria seu jogador. */
export async function createMyPlayer(input: PlayerInput): Promise<Player> {
  const data = await api.post<JogadorApi>("/jogadores/meu", toJogadorPayload(input));
  return toPlayer(data);
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

/**
 * Busca o clima de novo pro horário já salvo — útil quando a partida foi
 * criada fora da janela de ~16 dias da Open-Meteo, ou pra tentar de novo o
 * clima real de uma partida recém-realizada se a busca automática não achou
 * dado ainda.
 */
export async function refreshMatchWeather(id: string): Promise<Match> {
  const data = await api.post<PartidaApi>(`/partidas/${id}/clima`, {});
  return toMatch(data);
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

  // Em paralelo: cada linha é independente, e toda chamada autenticada paga
  // sozinha o round-trip de validar o token no Supabase (~0,5-1s). Rodar uma
  // de cada vez multiplicava esse custo por jogador — 15 jogadores sequenciais
  // já passava de 10s. Em paralelo, o tempo total é o da chamada mais lenta.
  await Promise.all(
    Object.entries(rows).map(([playerId, r]) => {
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
      return found
        ? api.patch(`/estatisticas/${found.id}`, payload)
        : api.post("/estatisticas/", payload);
    }),
  );
}

// ---------------------------------------------------------------------------
// Presença
// ---------------------------------------------------------------------------
function toPresence(p: PresencaApi): Presence {
  return {
    id: p.id,
    match_id: p.partida_id,
    player_id: p.jogador_id,
    status: p.status,
    position: p.posicao,
    terms_accepted: p.termos_aceitos,
    payment_status: p.status_pagamento,
  };
}

export async function fetchPresences(matchId: string): Promise<Presence[]> {
  const data = await api.get<PresencaApi[]>(`/partidas/${matchId}/presenca`);
  return data.map(toPresence);
}

/**
 * Salva a presença de quem está logado. O jogador não vai no corpo: o backend
 * resolve pela sessão, então ninguém confirma no lugar de outro.
 */
export async function savePresence(
  matchId: string,
  input: { status: PresenceStatus; position: Position | null; termsAccepted: boolean },
): Promise<Presence> {
  const data = await api.post<PresencaApi>(`/partidas/${matchId}/presenca`, {
    status: input.status,
    posicao: input.position,
    termos_aceitos: input.termsAccepted,
  });
  return toPresence(data);
}

/**
 * Confirma presença em nome de um jogador que avisou por fora (não usa o
 * app, ou ainda não tem conta). Só editor; a API sempre confirma (respeitando
 * a fila de espera se lotar) e já marca os termos como aceitos.
 */
export async function confirmPresenceAsEditor(
  matchId: string,
  playerId: string,
  position: Position,
): Promise<Presence> {
  const data = await api.post<PresencaApi>(`/partidas/${matchId}/presenca/${playerId}`, {
    posicao: position,
  });
  return toPresence(data);
}

export async function updatePaymentStatus(
  matchId: string,
  playerId: string,
  status: PaymentStatus,
): Promise<Presence> {
  const data = await api.patch<PresencaApi>(`/partidas/${matchId}/presenca/${playerId}/pagamento`, {
    status_pagamento: status,
  });
  return toPresence(data);
}

export async function updatePresenceStatus(
  matchId: string,
  playerId: string,
  status: PresenceStatus,
): Promise<Presence> {
  const data = await api.patch<PresencaApi>(`/partidas/${matchId}/presenca/${playerId}/status`, {
    status,
  });
  return toPresence(data);
}

/** Corrige a posição de um confirmado. Só editor; a API valida. */
export async function updatePresencePosition(
  matchId: string,
  playerId: string,
  position: Position,
): Promise<Presence> {
  const data = await api.patch<PresencaApi>(`/partidas/${matchId}/presenca/${playerId}/posicao`, {
    posicao: position,
  });
  return toPresence(data);
}

/** Retira o jogador da lista por completo — como se nunca tivesse respondido. */
export async function deletePresence(matchId: string, playerId: string): Promise<void> {
  await api.del(`/partidas/${matchId}/presenca/${playerId}`);
}

// ---------------------------------------------------------------------------
// Punições (admin-only — o próprio jogador nunca vê isso)
// ---------------------------------------------------------------------------
export type PunishmentType = "dias" | "jogos";

export type Punishment = {
  id: string;
  player_id: string;
  reason: string;
  type: PunishmentType;
  /** Prazo final (tipo "dias"); null se for por número de jogos. */
  ends_on: string | null;
  /** Total de jogos da suspensão (tipo "jogos"); null se for por prazo. */
  games_total: number | null;
  games_served: number;
  created_at: string;
};

type PunicaoApi = {
  id: string;
  jogador_id: string;
  motivo: string;
  tipo: PunishmentType;
  termina_em: string | null;
  jogos_totais: number | null;
  jogos_cumpridos: number;
  criado_em: string;
};

function toPunishment(p: PunicaoApi): Punishment {
  return {
    id: p.id,
    player_id: p.jogador_id,
    reason: p.motivo,
    type: p.tipo,
    ends_on: p.termina_em,
    games_total: p.jogos_totais,
    games_served: p.jogos_cumpridos,
    created_at: p.criado_em,
  };
}

/** Se a punição ainda está valendo. Espelha punicao_ativa() do backend. */
export function isPunishmentActive(p: Punishment): boolean {
  if (p.type === "dias") {
    if (!p.ends_on) return false;
    const hoje = new Date().toISOString().slice(0, 10);
    return p.ends_on >= hoje;
  }
  return p.games_served < (p.games_total ?? 0);
}

export async function fetchPunishments(playerId: string): Promise<Punishment[]> {
  const data = await api.get<PunicaoApi[]>(`/jogadores/${playerId}/punicoes`);
  return data.map(toPunishment);
}

export async function createPunishment(
  playerId: string,
  input: { reason: string; type: PunishmentType; endsOn: string | null; gamesTotal: number | null },
): Promise<Punishment> {
  const data = await api.post<PunicaoApi>(`/jogadores/${playerId}/punicoes`, {
    motivo: input.reason,
    tipo: input.type,
    termina_em: input.endsOn,
    jogos_totais: input.gamesTotal,
  });
  return toPunishment(data);
}

/** Editor pode corrigir prazo/jogos cumpridos — inclusive "reverter" um desconto automático. */
export async function updatePunishment(
  playerId: string,
  punishmentId: string,
  input: Partial<{ reason: string; endsOn: string; gamesTotal: number; gamesServed: number }>,
): Promise<Punishment> {
  const data = await api.patch<PunicaoApi>(`/jogadores/${playerId}/punicoes/${punishmentId}`, {
    motivo: input.reason,
    termina_em: input.endsOn,
    jogos_totais: input.gamesTotal,
    jogos_cumpridos: input.gamesServed,
  });
  return toPunishment(data);
}

export async function deletePunishment(playerId: string, punishmentId: string): Promise<void> {
  await api.del(`/jogadores/${playerId}/punicoes/${punishmentId}`);
}

// ---------------------------------------------------------------------------
// Lesões (autoatendimento — visível pra todo mundo logado, ao contrário de punição)
// ---------------------------------------------------------------------------
export type InjuryType = "proximo_jogo" | "data";

export type Injury = {
  id: string;
  player_id: string;
  reason: string;
  type: InjuryType;
  /** Prazo final (tipo "data"); null se for "até o próximo jogo". */
  ends_on: string | null;
  /** Partida travada no registro (tipo "proximo_jogo"); null se for por prazo. */
  match_id: string | null;
  created_at: string;
};

type LesaoApi = {
  id: string;
  jogador_id: string;
  motivo: string;
  tipo: InjuryType;
  termina_em: string | null;
  partida_id: string | null;
  criado_em: string;
};

function toInjury(l: LesaoApi): Injury {
  return {
    id: l.id,
    player_id: l.jogador_id,
    reason: l.motivo,
    type: l.tipo,
    ends_on: l.termina_em,
    match_id: l.partida_id,
    created_at: l.criado_em,
  };
}

/**
 * Se a lesão ainda está valendo. Só cobre o tipo "data" sem consultar nada
 * mais — o tipo "próximo jogo" depende do status atual da partida travada,
 * que quem usa isso já deve ter carregado (ver `fetchActiveInjuries`).
 */
export function isInjuryActiveByDate(i: Pick<Injury, "type" | "ends_on">): boolean {
  if (i.type !== "data") return false;
  if (!i.ends_on) return false;
  const hoje = new Date().toISOString().slice(0, 10);
  return i.ends_on >= hoje;
}

export async function fetchInjuries(playerId: string): Promise<Injury[]> {
  const data = await api.get<LesaoApi[]>(`/jogadores/${playerId}/lesoes`);
  return data.map(toInjury);
}

/** Todas as lesões ativas do elenco inteiro — usado pra pintar a tag "Lesionado" na lista. */
export async function fetchActiveInjuries(): Promise<Injury[]> {
  const data = await api.get<LesaoApi[]>("/lesoes/ativas");
  return data.map(toInjury);
}

export async function createInjury(
  playerId: string,
  input: { reason: string; type: InjuryType; endsOn: string | null },
): Promise<Injury> {
  const data = await api.post<LesaoApi>(`/jogadores/${playerId}/lesoes`, {
    motivo: input.reason,
    tipo: input.type,
    termina_em: input.endsOn,
  });
  return toInjury(data);
}

export async function deleteInjury(playerId: string, injuryId: string): Promise<void> {
  await api.del(`/jogadores/${playerId}/lesoes/${injuryId}`);
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

/** Mesma validação simples do backend (EMAIL_REGEX em models.py). */
export const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Formata dígitos digitados progressivamente como "(DDD) 91234-1234". */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
