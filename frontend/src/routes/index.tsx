import { useState, type ReactNode } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { isAutenticado } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Cloud, HeartPulse, MapPin, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchActiveInjuries,
  fetchAllStats,
  fetchMatches,
  fetchMeuJogador,
  fetchPlayers,
  fetchPresences,
  feePerPlayer,
  formatDate,
  formatMoney,
  MANDO_LABELS,
  POSITION_ABBR,
  POSITION_LABELS,
  PRESENCE_LABELS,
  TEAM_NAME,
  VENUE_LABELS,
  type Kind,
  type Match,
  type Player,
} from "@/lib/football";
import { ResultChip } from "@/components/ResultBadge";
import { ConfirmarPresenca } from "@/components/ConfirmarPresenca";
import { useUsuario } from "@/lib/useUsuario";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (!isAutenticado()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "SCFC - Estatísticas" },
      {
        name: "description",
        content: "Artilharia, cartões, desempenho do time e próximas partidas do Suprema Corte FC.",
      },
      { property: "og:title", content: "SCFC - Estatísticas" },
      {
        property: "og:description",
        content: "Artilharia, cartões e desempenho do Suprema Corte FC.",
      },
    ],
  }),
  component: Dashboard,
});

const KIND_LABELS: Record<Kind, string> = {
  campeonato: "Campeonato",
  amistoso: "Amistoso",
};

// Nome do dia calculado a partir das partes da data (sem depender do locale
// do servidor/cliente, que poderia divergir na hidratação).
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function weekdayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

/** "14/11" a partir de "2026-11-14". */
function shortDate(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

function venueText(m: Match): string {
  return m.venue === "outro" && m.venue_detail ? m.venue_detail : VENUE_LABELS[m.venue];
}

function weatherText(m: Match): string | null {
  const w = m.weather;
  if (!w) return null;
  let text = `${Math.round(w.temperature)}°C · ${w.condition}`;
  if (w.source === "previsao" && w.rain_chance !== null) text += ` · ${w.rain_chance}% de chuva`;
  else if (w.source === "historico" && w.rain_mm !== null) text += ` · ${w.rain_mm}mm de chuva`;
  return text;
}

function Empty({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function SectionLink({ to, children }: { to: "/jogadores" | "/partidas"; children: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center text-[13px] font-semibold text-primary hover:underline"
    >
      {children}
    </Link>
  );
}

function StatTile({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-[150px] flex-1 basis-[150px] rounded-2xl border bg-card px-5 py-[18px] ${className ?? ""}`}
    >
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Dashboard() {
  const usuario = useUsuario();
  const players = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });
  const matches = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });
  const stats = useQuery({ queryKey: ["stats"], queryFn: fetchAllStats });
  const injuries = useQuery({ queryKey: ["active-injuries"], queryFn: fetchActiveInjuries });
  const meuJogadorQuery = useQuery({ queryKey: ["meu-jogador"], queryFn: fetchMeuJogador });

  const [confirmando, setConfirmando] = useState<Match | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (matches.data ?? [])
    .filter((m) => m.status === "agendada" && m.match_date >= today)
    .sort((a, b) => a.match_date.localeCompare(b.match_date))
    .slice(0, 5);
  const nextMatch = upcoming[0] ?? null;

  const presences = useQuery({
    queryKey: ["presences", nextMatch?.id],
    queryFn: () => fetchPresences(nextMatch!.id),
    enabled: !!nextMatch,
  });

  const loading = players.isLoading || matches.isLoading || stats.isLoading;

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-64" />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const allPlayers = players.data ?? [];
  const allMatches = matches.data ?? [];
  const allStats = stats.data ?? [];
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const p = playerById.get(id);
    return p ? p.nickname || p.name : "Desconhecido";
  };

  // Jogador da conta logada: pelo vínculo da conta (/jogadores/meu); se não
  // vier, cai na mesma regra de email usada na tela de partidas.
  const meuEmail = (usuario?.email ?? "").trim().toLowerCase();
  const meuJogador: Player | null =
    meuJogadorQuery.data ??
    ((meuEmail &&
      allPlayers.find((p) => p.active && (p.email ?? "").trim().toLowerCase() === meuEmail)) ||
      null);
  const minhaPresenca =
    (meuJogador && (presences.data ?? []).find((p) => p.player_id === meuJogador.id)) || null;

  // ---- Estatísticas individuais ----
  const goalsByPlayer = new Map<string, number>();
  const yellowByPlayer = new Map<string, number>();
  const redByPlayer = new Map<string, number>();
  for (const s of allStats) {
    goalsByPlayer.set(s.player_id, (goalsByPlayer.get(s.player_id) ?? 0) + s.goals);
    yellowByPlayer.set(s.player_id, (yellowByPlayer.get(s.player_id) ?? 0) + s.yellow_cards);
    redByPlayer.set(s.player_id, (redByPlayer.get(s.player_id) ?? 0) + s.red_cards);
  }

  const topScorers = [...goalsByPlayer.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxGoals = topScorers[0]?.[1] ?? 1;

  // Cartões: quem tem algum, vermelhos pesando mais na ordem.
  const cardIds = new Set([...yellowByPlayer.keys(), ...redByPlayer.keys()]);
  const topCards = [...cardIds]
    .map((id) => ({
      id,
      yellow: yellowByPlayer.get(id) ?? 0,
      red: redByPlayer.get(id) ?? 0,
    }))
    .filter((c) => c.yellow + c.red > 0)
    .sort((a, b) => b.red * 2 + b.yellow - (a.red * 2 + a.yellow))
    .slice(0, 5);

  // ---- Campanha ----
  const played = allMatches.filter((m) => m.status === "realizada");
  let wins = 0,
    draws = 0,
    losses = 0,
    gf = 0,
    ga = 0;
  for (const m of played) {
    const f = m.goals_for ?? 0;
    const a = m.goals_against ?? 0;
    gf += f;
    ga += a;
    if (f > a) wins++;
    else if (f === a) draws++;
    else losses++;
  }
  const aproveitamento =
    played.length > 0 ? Math.round(((wins * 3 + draws) / (played.length * 3)) * 100) : null;

  // `fetchMatches` já ordena as passadas da mais recente pra mais antiga.
  const recent = played.slice(0, 5);
  const form = [...recent].reverse();

  const playedAsc = [...played].sort((a, b) => a.match_date.localeCompare(b.match_date));
  const chartMatches = playedAsc.slice(-12);
  const maxAbsSaldo = Math.max(
    1,
    ...chartMatches.map((m) => Math.abs((m.goals_for ?? 0) - (m.goals_against ?? 0))),
  );
  const BAR_AREA = 56;
  const unit = Math.min(14, BAR_AREA / maxAbsSaldo);

  const laterMatches = upcoming.slice(1);
  const activeCount = allPlayers.filter((p) => p.active).length;

  // ---- Próximo jogo: presença e rateio ----
  // Mesma conta de partidas.tsx: goleiro não ocupa vaga de linha.
  const confirmados = (presences.data ?? []).filter(
    (p) => p.status === "confirmado" && p.position !== "goleiro",
  ).length;
  const naEspera = (presences.data ?? []).filter((p) => p.status === "espera").length;
  const vagas = nextMatch?.line_slots ?? null;
  const valor = nextMatch ? feePerPlayer(nextMatch) : null;
  const pct = vagas ? Math.min(100, Math.round((confirmados / vagas) * 100)) : 0;

  const activeInjuries = injuries.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {TEAM_NAME}
          </p>
          <h1 className="text-3xl leading-tight">Visão geral</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {played.length} {played.length === 1 ? "jogo disputado" : "jogos disputados"} ·{" "}
          {activeCount} {activeCount === 1 ? "jogador ativo" : "jogadores ativos"}
        </p>
      </div>

      {/* Próximo jogo */}
      {nextMatch ? (
        <section
          aria-label="Próximo jogo"
          className="flex flex-wrap items-stretch gap-7 rounded-2xl bg-hero p-5 text-hero-foreground md:p-7"
        >
          <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-[18px]">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-md bg-accent px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-accent-foreground">
                Próximo jogo
              </span>
              <span className="text-sm text-hero-muted">
                {KIND_LABELS[nextMatch.kind]} · {MANDO_LABELS[nextMatch.mando]}
              </span>
            </div>
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
              <span className="font-display text-2xl font-extrabold uppercase leading-tight md:text-3xl">
                {TEAM_NAME}
              </span>
              <span className="num text-3xl font-semibold text-accent" aria-label="contra">
                ×
              </span>
              <span className="break-words font-display text-2xl font-extrabold uppercase leading-tight md:text-3xl">
                {nextMatch.opponent}
              </span>
            </p>
            <div className="flex flex-wrap gap-x-7 gap-y-2.5 text-[15px]">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-[18px] w-[18px] text-accent" aria-hidden="true" />
                {weekdayOf(nextMatch.match_date)}, {formatDate(nextMatch.match_date)}
                {nextMatch.kickoff_time && ` às ${nextMatch.kickoff_time.slice(0, 5)}`}
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-[18px] w-[18px] text-accent" aria-hidden="true" />
                {venueText(nextMatch)}
              </span>
              {weatherText(nextMatch) && (
                <span className="inline-flex items-center gap-2">
                  <Cloud className="h-[18px] w-[18px] text-accent" aria-hidden="true" />
                  {weatherText(nextMatch)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-[1_1_280px] flex-col justify-between gap-3.5 rounded-xl border border-white/15 bg-white/[0.07] p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-hero-muted">Confirmados na linha</span>
              <span className="num text-[34px]">
                {presences.isLoading ? "–" : confirmados}
                {vagas !== null && <span className="text-xl text-hero-muted"> / {vagas}</span>}
              </span>
            </div>
            {vagas !== null && (
              <div
                role="img"
                aria-label={`${confirmados} de ${vagas} vagas preenchidas`}
                className="h-2 overflow-hidden rounded bg-white/15"
              >
                <div className="h-full rounded bg-accent" style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px] text-hero-muted">
              <span>
                {naEspera > 0
                  ? `${naEspera} na lista de espera`
                  : vagas !== null
                    ? `${Math.max(0, vagas - confirmados)} ${
                        Math.max(0, vagas - confirmados) === 1 ? "vaga aberta" : "vagas abertas"
                      }`
                    : "Vagas não definidas"}
              </span>
              {valor !== null && <span>{formatMoney(valor)} por jogador</span>}
            </div>
            {minhaPresenca && (
              <p className="text-[13px] text-hero-muted">
                Sua resposta:{" "}
                <span className="font-semibold text-hero-foreground">
                  {PRESENCE_LABELS[minhaPresenca.status]}
                  {minhaPresenca.status !== "ausente" &&
                    minhaPresenca.position &&
                    ` · ${POSITION_LABELS[minhaPresenca.position]}`}
                </span>
              </p>
            )}
            <Button
              type="button"
              onClick={() => setConfirmando(nextMatch)}
              className="h-11 gap-2 rounded-[10px] bg-accent text-[15px] font-extrabold tracking-[0.02em] text-accent-foreground hover:bg-accent/90"
            >
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              {minhaPresenca ? "Alterar presença" : "Confirmar presença"}
            </Button>
          </div>
        </section>
      ) : (
        <section
          aria-label="Próximo jogo"
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed bg-card p-5 md:p-6"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-raised">
              <CalendarDays className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold">Nenhum jogo agendado</p>
              <p className="text-sm text-muted-foreground">
                Quando a próxima partida for marcada, ela aparece aqui com a lista de presença.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="h-11">
            <Link to="/partidas">Ver partidas</Link>
          </Button>
        </section>
      )}

      {/* Números da campanha */}
      <section aria-label="Campanha" className="flex flex-wrap gap-4">
        <StatTile label="Aproveitamento">
          <p className="num text-[46px] text-primary">
            {aproveitamento === null ? "–" : `${aproveitamento}%`}
          </p>
        </StatTile>
        <StatTile label="Vitórias">
          <p className="num text-[46px]">{wins}</p>
        </StatTile>
        <StatTile label="Empates">
          <p className="num text-[46px]">{draws}</p>
        </StatTile>
        <StatTile label="Derrotas">
          <p className="num text-[46px]">{losses}</p>
        </StatTile>
        <StatTile label="Gols pró / contra">
          <p className="num text-[46px]">
            {gf}
            <span className="text-[26px] text-muted-foreground"> / {ga}</span>
          </p>
        </StatTile>
        <StatTile label="Últimos 5 jogos" className="basis-[220px]">
          {form.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhum jogo ainda</p>
          ) : (
            <ol aria-label="Do mais antigo ao mais recente" className="mt-3 flex flex-wrap gap-1.5">
              {form.map((m) => (
                <li key={m.id}>
                  <ResultChip match={m} />
                </li>
              ))}
            </ol>
          )}
        </StatTile>
      </section>

      {/* Saldo + artilheiros */}
      <div className="flex flex-wrap items-stretch gap-6">
        <section
          aria-labelledby="titulo-saldo"
          className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 rounded-2xl border bg-card p-5 md:p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="titulo-saldo" className="text-[15px] leading-tight">
              Saldo de gols por partida
            </h2>
            <div className="flex flex-wrap gap-4 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" aria-hidden="true" />
                Saldo positivo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-chart-neg" aria-hidden="true" />
                Saldo negativo
              </span>
            </div>
          </div>
          {chartMatches.length === 0 ? (
            <Empty>Nenhuma partida realizada ainda</Empty>
          ) : (
            <div className="overflow-x-auto">
              <ol
                className="flex gap-2.5"
                style={{ minWidth: `${Math.max(chartMatches.length * 46, 0)}px` }}
              >
                {chartMatches.map((m) => {
                  const f = m.goals_for ?? 0;
                  const a = m.goals_against ?? 0;
                  const saldo = f - a;
                  return (
                    <li key={m.id} className="flex min-w-0 flex-1 flex-col items-center">
                      <span className="sr-only">
                        {formatDate(m.match_date)} contra {m.opponent}: {f} a {a}, saldo{" "}
                        {saldo > 0 ? `+${saldo}` : saldo}
                      </span>
                      <div
                        aria-hidden="true"
                        className="flex w-full items-end justify-center"
                        style={{ height: BAR_AREA }}
                      >
                        {saldo > 0 && (
                          <div
                            className="w-[70%] max-w-[34px] rounded-t-[5px] bg-accent"
                            style={{ height: saldo * unit }}
                          />
                        )}
                      </div>
                      <div aria-hidden="true" className="h-0.5 w-full bg-border" />
                      <div
                        aria-hidden="true"
                        className="flex w-full items-start justify-center"
                        style={{ height: BAR_AREA }}
                      >
                        {saldo < 0 && (
                          <div
                            className="w-[70%] max-w-[34px] rounded-b-[5px] bg-chart-neg"
                            style={{ height: -saldo * unit }}
                          />
                        )}
                      </div>
                      <span aria-hidden="true" className="text-sm font-bold" title={m.opponent}>
                        {f}–{a}
                      </span>
                      <span aria-hidden="true" className="mt-0.5 text-xs text-muted-foreground">
                        {shortDate(m.match_date)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {played.length > chartMatches.length && (
            <p className="text-xs text-muted-foreground">
              Mostrando as últimas {chartMatches.length} de {played.length} partidas.
            </p>
          )}
        </section>

        <section
          aria-labelledby="titulo-artilheiros"
          className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-2xl border bg-card p-5 md:p-6"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id="titulo-artilheiros" className="text-[15px] leading-tight">
              Artilheiros
            </h2>
            <SectionLink to="/jogadores">Ver elenco</SectionLink>
          </div>
          {topScorers.length === 0 ? (
            <Empty>Nenhum gol lançado ainda</Empty>
          ) : (
            <ol className="flex flex-col gap-3.5">
              {topScorers.map(([id, gols], i) => {
                const pos = playerById.get(id)?.positions[0];
                return (
                  <li key={id} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 text-[13px] font-bold text-muted-foreground">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                        {nameOf(id)}
                      </span>
                      {pos && (
                        <span
                          title={POSITION_LABELS[pos]}
                          className="rounded-[5px] border px-1.5 py-0.5 text-xs font-bold text-muted-foreground"
                        >
                          {POSITION_ABBR[pos]}
                        </span>
                      )}
                      <span className="num w-7 text-right text-2xl">
                        {gols}
                        <span className="sr-only"> {gols === 1 ? "gol" : "gols"}</span>
                      </span>
                    </div>
                    <div aria-hidden="true" className="ml-[30px] h-1.5 rounded-[3px] bg-raised">
                      <div
                        className="h-full rounded-[3px] bg-accent"
                        style={{ width: `${Math.round((gols / maxGoals) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {/* Resultados + cartões + DM */}
      <div className="flex flex-wrap items-stretch gap-6">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-6">
          <section
            aria-labelledby="titulo-resultados"
            className="flex flex-col rounded-2xl border bg-card p-5 md:p-6"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="titulo-resultados" className="text-[15px] leading-tight">
                Últimos resultados
              </h2>
              <SectionLink to="/partidas">Todas as partidas</SectionLink>
            </div>
            {recent.length === 0 ? (
              <Empty>Nenhum resultado registrado</Empty>
            ) : (
              <ul>
                {recent.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t py-3"
                  >
                    <ResultChip match={m} />
                    <span className="min-w-0 flex-[1_1_160px] break-words text-[15px] font-semibold">
                      {m.opponent}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {formatDate(m.match_date)} · {KIND_LABELS[m.kind]}
                    </span>
                    <span className="num w-14 text-right text-2xl">
                      {m.goals_for ?? 0}–{m.goals_against ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {laterMatches.length > 0 && (
            <section
              aria-labelledby="titulo-proximas"
              className="flex flex-col rounded-2xl border bg-card p-5 md:p-6"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 id="titulo-proximas" className="text-[15px] leading-tight">
                  Próximas partidas
                </h2>
                <SectionLink to="/partidas">Ver agenda</SectionLink>
              </div>
              <ul>
                {laterMatches.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t py-3"
                  >
                    <span className="min-w-0 flex-[1_1_160px] break-words text-[15px] font-semibold">
                      {m.opponent}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {formatDate(m.match_date)}
                      {m.kickoff_time && ` às ${m.kickoff_time.slice(0, 5)}`} ·{" "}
                      {KIND_LABELS[m.kind]}
                    </span>
                    <span className="rounded-full bg-raised px-2.5 py-1 text-xs font-semibold">
                      {MANDO_LABELS[m.mando]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-6">
          <section
            aria-labelledby="titulo-cartoes"
            className="flex flex-col gap-3.5 rounded-2xl border bg-card p-5 md:p-6"
          >
            <SectionTitleWithId id="titulo-cartoes">Cartões</SectionTitleWithId>
            {topCards.length === 0 ? (
              <Empty>Nenhum cartão lançado ainda</Empty>
            ) : (
              <ul className="flex flex-col gap-3">
                {topCards.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                      {nameOf(c.id)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                      <span
                        aria-hidden="true"
                        className="h-[15px] w-[11px] rounded-[2px] border border-yellow-500 bg-yellow-400"
                      />
                      {c.yellow}
                      <span className="font-normal text-muted-foreground">
                        {c.yellow === 1 ? "amarelo" : "amarelos"}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                      <span
                        aria-hidden="true"
                        className="h-[15px] w-[11px] rounded-[2px] border border-red-700 bg-red-600"
                      />
                      {c.red}
                      <span className="font-normal text-muted-foreground">
                        {c.red === 1 ? "vermelho" : "vermelhos"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="titulo-dm"
            className="flex flex-col gap-3.5 rounded-2xl border bg-card p-5 md:p-6"
          >
            <div className="flex items-center gap-2.5">
              <HeartPulse className="h-5 w-5" aria-hidden="true" />
              <SectionTitleWithId id="titulo-dm">Departamento médico</SectionTitleWithId>
            </div>
            {injuries.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : injuries.isError ? (
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar as lesões agora.
              </p>
            ) : activeInjuries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém lesionado no momento.</p>
            ) : (
              <ul className="flex flex-col">
                {activeInjuries.map((inj, i) => (
                  <li
                    key={inj.id}
                    className={`flex flex-col gap-0.5 ${i > 0 ? "border-t pt-3" : ""} ${
                      i < activeInjuries.length - 1 ? "pb-3" : ""
                    }`}
                  >
                    <span className="text-[15px] font-semibold">{nameOf(inj.player_id)}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {inj.reason} ·{" "}
                      {inj.type === "data" && inj.ends_on
                        ? `até ${shortDate(inj.ends_on)}`
                        : "só o próximo jogo"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {confirmando && (
        <ConfirmarPresenca
          match={confirmando}
          player={meuJogador}
          current={minhaPresenca}
          open={!!confirmando}
          onOpenChange={(aberto) => !aberto && setConfirmando(null)}
        />
      )}
    </div>
  );
}

function SectionTitleWithId({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-[15px] leading-tight">
      {children}
    </h2>
  );
}
