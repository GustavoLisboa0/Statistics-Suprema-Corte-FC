import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, Goal, ShieldAlert, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchAllStats,
  fetchMatches,
  fetchPlayers,
  formatDate,
  matchTitle,
  MANDO_LABELS,
} from "@/lib/football";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
            { title: "SCFC - Estat�sticas" },
      {
        name: "description",
        content: "Artilharia, cartÃµes, desempenho do time e prÃ³ximas partidas do Suprema Corte FC.",
      },
            { property: "og:title", content: "SCFC - Estat�sticas" },
      {
        property: "og:description",
        content: "Artilharia, cartÃµes e desempenho do Suprema Corte FC.",
      },
    ],
  }),
  component: Estat�sticas,
});

function Empty({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Estat�sticas() {
  const players = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });
  const matches = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });
  const stats = useQuery({ queryKey: ["stats"], queryFn: fetchAllStats });

  const loading = players.isLoading || matches.isLoading || stats.isLoading;

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  const allPlayers = players.data ?? [];
  const allMatches = matches.data ?? [];
  const allStats = stats.data ?? [];

  const nameOf = (id: string) => {
    const player = allPlayers.find((entry) => entry.id === id);
    return player ? player.nickname || player.name : "Desconhecido";
  };

  const goalsByPlayer = new Map<string, number>();
  const cardsByPlayer = new Map<string, number>();

  for (const stat of allStats) {
    goalsByPlayer.set(stat.player_id, (goalsByPlayer.get(stat.player_id) ?? 0) + stat.goals);
    cardsByPlayer.set(
      stat.player_id,
      (cardsByPlayer.get(stat.player_id) ?? 0) + stat.yellow_cards + stat.red_cards,
    );
  }

  const top = (map: Map<string, number>) =>
    [...map.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1])[0];

  const topScorer = top(goalsByPlayer);
  const topCarded = top(cardsByPlayer);

  const played = allMatches.filter((match) => match.status === "realizada");
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const match of played) {
    const scored = match.goals_for ?? 0;
    const conceded = match.goals_against ?? 0;
    goalsFor += scored;
    goalsAgainst += conceded;

    if (scored > conceded) wins++;
    else if (scored === conceded) draws++;
    else losses++;
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = allMatches
    .filter((match) => match.status === "agendada" && match.match_date >= today)
    .sort((a, b) => a.match_date.localeCompare(b.match_date))
    .slice(0, 5);
  const recent = played.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl">Estat�sticas</h1>
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
                { label: "Gols sofridos", value: goalsAgainst },
                { label: "Saldo de gols", value: `${goalsFor - goalsAgainst > 0 ? "+" : ""}${goalsFor - goalsAgainst}` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-muted p-4 text-center">
                  <div className="font-display text-3xl">{item.value}</div>
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
              upcoming.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <div className="font-semibold">{matchTitle(match)}</div>
                    <div className="text-muted-foreground">{formatDate(match.match_date)}</div>
                  </div>
                  <Badge variant="secondary">{MANDO_LABELS[match.mando]}</Badge>
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
              recent.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <div className="font-semibold">{matchTitle(match)}</div>
                    <div className="text-muted-foreground">{formatDate(match.match_date)}</div>
                  </div>
                  <span className="font-display text-2xl">
                    {match.goals_for ?? 0} × {match.goals_against ?? 0}
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



