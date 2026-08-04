import { createFileRoute, redirect } from "@tanstack/react-router";
import { isAutenticado } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Award, Goal, ShieldAlert, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchAllStats, fetchMatches, fetchPlayers, formatDate, matchTitle, MANDO_LABELS } from "@/lib/football";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (!isAutenticado()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Suprema Corte FC" },
      {
        name: "description",
        content: "Artilharia, cartões, desempenho do time e próximas partidas do Suprema Corte FC.",
      },
      { property: "og:title", content: "Dashboard — Suprema Corte FC" },
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
  const cardsByPlayer = new Map<string, number>();
  for (const s of allStats) {
    goalsByPlayer.set(s.player_id, (goalsByPlayer.get(s.player_id) ?? 0) + s.goals);
    cardsByPlayer.set(
      s.player_id,
      (cardsByPlayer.get(s.player_id) ?? 0) + s.yellow_cards + s.red_cards,
    );
  }
  const top = (map: Map<string, number>) =>
    [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];

  const topScorer = top(goalsByPlayer);
  const topCarded = top(cardsByPlayer);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do desempenho do time</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Goal className="h-5 w-5 text-accent" />
            <CardTitle className="text-lg">Artilheiro</CardTitle>
          </CardHeader>
          <CardContent>
            {topScorer ? (
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">{nameOf(topScorer[0])}</span>
                <span className="font-display text-4xl text-accent">{topScorer[1]}</span>
              </div>
            ) : (
              <Empty>Nenhum gol lançado ainda</Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg">Mais advertido</CardTitle>
          </CardHeader>
          <CardContent>
            {topCarded ? (
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">{nameOf(topCarded[0])}</span>
                <span className="font-display text-4xl text-destructive">{topCarded[1]}</span>
              </div>
            ) : (
              <Empty>Nenhum cartão lançado ainda</Empty>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <TrendingUp className="h-5 w-5 text-accent" />
          <CardTitle className="text-lg">Desempenho geral</CardTitle>
        </CardHeader>
        <CardContent>
          {played.length === 0 ? (
            <Empty>Nenhuma partida realizada ainda</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: "Vitórias", value: wins },
                { label: "Empates", value: draws },
                { label: "Derrotas", value: losses },
                { label: "Gols sofridos", value: ga },
                { label: "Saldo de gols", value: `${gf - ga > 0 ? "+" : ""}${gf - ga}` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-muted p-4 text-center">
                  <div className="font-display text-3xl font-bold">{item.value}</div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
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
                  <span className="font-display text-2xl font-semibold">
                    {m.goals_for ?? 0} × {m.goals_against ?? 0}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}