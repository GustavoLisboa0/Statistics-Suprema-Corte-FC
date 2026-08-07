import { createFileRoute, redirect } from "@tanstack/react-router";
import { isAutenticado } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Award, CalendarDays, Goal, ShieldAlert, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAllStats, fetchMatches, fetchPlayers, formatDate, matchTitle, MANDO_LABELS } from "@/lib/football";
import { ResultBadge } from "@/components/ResultBadge";

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

function Empty({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Dashboard() {
  const players = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });
  const matches = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });
  const stats = useQuery({ queryKey: ["stats"], queryFn: fetchAllStats });

  const loading = players.isLoading || matches.isLoading || stats.isLoading;

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  const allPlayers = players.data ?? [];
  const allMatches = matches.data ?? [];
  const allStats = stats.data ?? [];
  const nameOf = (id: string) => {
    const p = allPlayers.find((x) => x.id === id);
    return p ? (p.nickname || p.name) : "Desconhecido";
  };

  const goalsByPlayer = new Map<string, number>();
  const yellowByPlayer = new Map<string, number>();
  const redByPlayer = new Map<string, number>();
  for (const s of allStats) {
    goalsByPlayer.set(s.player_id, (goalsByPlayer.get(s.player_id) ?? 0) + s.goals);
    yellowByPlayer.set(s.player_id, (yellowByPlayer.get(s.player_id) ?? 0) + s.yellow_cards);
    redByPlayer.set(s.player_id, (redByPlayer.get(s.player_id) ?? 0) + s.red_cards);
  }
  const top3 = (map: Map<string, number>) =>
    [...map.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

  const topScorers = top3(goalsByPlayer);
  const topYellow = top3(yellowByPlayer);
  const topRed = top3(redByPlayer);

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

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = allMatches
    .filter((m) => m.status === "agendada" && m.match_date >= today)
    .sort((a, b) => a.match_date.localeCompare(b.match_date))
    .slice(0, 5);
  const recent = played.slice(0, 5);

  const playedAsc = [...played].sort((a, b) => a.match_date.localeCompare(b.match_date));
  let acW = 0,
    acD = 0,
    acL = 0;
  const serieResultados = playedAsc.map((m) => {
    const f = m.goals_for ?? 0;
    const a = m.goals_against ?? 0;
    if (f > a) acW++;
    else if (f === a) acD++;
    else acL++;
    return { data: formatDate(m.match_date), Vitórias: acW, Empates: acD, Derrotas: acL };
  });

  const dadosGols = [
    { nome: "Feitos", valor: gf, cor: "var(--accent)" },
    { nome: "Sofridos", valor: ga, cor: "var(--destructive)" },
    { nome: "Saldo", valor: gf - ga, cor: "var(--primary)" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl">Estatísticas</h1>
        <p className="text-sm text-muted-foreground">Visão geral do desempenho do time</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Goal className="h-5 w-5 text-accent" />
            <CardTitle className="text-lg">Artilheiros</CardTitle>
          </CardHeader>
          <CardContent>
            {topScorers.length === 0 ? (
              <Empty>Nenhum gol lançado ainda</Empty>
            ) : (
              <ul className="space-y-2">
                {topScorers.map(([id, valor], i) => (
                  <li key={id} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="text-xs text-muted-foreground">{i + 1}º</span>
                      {nameOf(id)}
                    </span>
                    <span className="font-display text-2xl text-accent">{valor}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <ShieldAlert className="h-5 w-5 text-accent" />
            <CardTitle className="text-lg">Cartões</CardTitle>
          </CardHeader>
          <CardContent>
            {topYellow.length === 0 && topRed.length === 0 ? (
              <Empty>Nenhum cartão lançado ainda</Empty>
            ) : (
              <div className="grid grid-cols-1 gap-4 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="sm:pr-4">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="h-4 w-3 rounded-[2px] border border-yellow-500 bg-yellow-400" />
                    Amarelos
                  </div>
                  {topYellow.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum ainda</p>
                  ) : (
                    <ul className="space-y-2">
                      {topYellow.map(([id, valor], i) => (
                        <li key={`y-${id}`} className="flex items-center justify-between">
                          <span className="flex items-center gap-2 font-medium">
                            <span className="text-xs text-muted-foreground">{i + 1}º</span>
                            {nameOf(id)}
                          </span>
                          <span className="font-display text-2xl">{valor}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="pt-4 sm:pl-4 sm:pt-0">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="h-4 w-3 rounded-[2px] border border-red-700 bg-red-600" />
                    Vermelhos
                  </div>
                  {topRed.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum ainda</p>
                  ) : (
                    <ul className="space-y-2">
                      {topRed.map(([id, valor], i) => (
                        <li key={`r-${id}`} className="flex items-center justify-between">
                          <span className="flex items-center gap-2 font-medium">
                            <span className="text-xs text-muted-foreground">{i + 1}º</span>
                            {nameOf(id)}
                          </span>
                          <span className="font-display text-2xl">{valor}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <TrendingUp className="h-5 w-5 text-accent" />
          <CardTitle className="text-lg">Desempenho geral</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {played.length === 0 ? (
            <Empty>Nenhuma partida realizada ainda</Empty>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Vitórias", value: wins },
                  { label: "Empates", value: draws },
                  { label: "Derrotas", value: losses },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-muted p-4 text-center">
                    <div className="font-display text-3xl">{item.value}</div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Gols feitos, sofridos e saldo
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={dadosGols} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="nome"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        axisLine={{ stroke: "var(--border)" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="valor" radius={[4, 4, 4, 4]}>
                        {dadosGols.map((d) => (
                          <Cell key={d.nome} fill={d.cor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Vitórias, empates e derrotas ao longo da temporada
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={serieResultados} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="data"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        axisLine={{ stroke: "var(--border)" }}
                        tickLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Vitórias"
                        stroke="oklch(0.6 0.15 145)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="Empates"
                        stroke="var(--muted-foreground)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="Derrotas"
                        stroke="var(--destructive)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-1 flex justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.6 0.15 145)" }} />
                      Vitórias
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                      Empates
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      Derrotas
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <CalendarDays className="h-5 w-5 text-accent" />
            <CardTitle className="text-lg">Próximas partidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <Empty>Nenhuma partida agendada</Empty>
            ) : (
              upcoming.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <div className="font-semibold">{matchTitle(m)}</div>
                    <div className="text-muted-foreground">{formatDate(m.match_date)}</div>
                  </div>
                  <Badge variant="secondary">{MANDO_LABELS[m.mando]}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Award className="h-5 w-5 text-accent" />
            <CardTitle className="text-lg">Últimos resultados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 ? (
              <Empty>Nenhum resultado registrado</Empty>
            ) : (
              recent.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <div className="font-semibold">{matchTitle(m)}</div>
                    <div className="text-muted-foreground">{formatDate(m.match_date)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-2xl">
                      {m.goals_for ?? 0} × {m.goals_against ?? 0}
                    </span>
                    <ResultBadge match={m} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
