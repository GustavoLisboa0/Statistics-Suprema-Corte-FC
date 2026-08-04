import { createFileRoute, redirect } from "@tanstack/react-router";
import { isAutenticado, getUsuario } from "@/lib/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";

import {
  STATUSES,
  STATUS_LABELS,
  VENUES,
  VENUE_LABELS,
  MANDOS,
  MANDO_LABELS,
  matchTitle,
  fetchMatchStats,
  fetchMatches,
  fetchPlayers,
  formatDate,
  createMatch,
  updateMatch,
  deleteMatch,
  upsertMatchStats,
  type Match,
  type MatchInput,
} from "@/lib/football";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/partidas")({
  beforeLoad: () => {
    if (!isAutenticado()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "SCFC - Partidas" },
      {
        name: "description",
        content: "Calendário, resultados e estatísticas por partida do Suprema Corte FC.",
      },
      { property: "og:title", content: "SCFC - Partidas" },
      { property: "og:description", content: "Calendário e resultados do Suprema Corte FC." },
    ],
  }),
  component: MatchesPage,
});

type MatchForm = {
  match_date: string;
  opponent: string;
  venue: string;
  venue_detail: string;
  mando: string;
  status: string;
  kind: string;
  notes: string;
  goals_for: string;
  goals_against: string;
};

const emptyMatch: MatchForm = {
  match_date: new Date().toISOString().slice(0, 10),
  opponent: "",
  venue: "trieste",
  venue_detail: "",
  mando: "mandante",
  status: "agendada",
  kind: "campeonato",
  notes: "",
  goals_for: "",
  goals_against: "",
};

type StatRow = {
  starter: boolean;
  minutes: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  goals_conceded: number;
};

const emptyStat: StatRow = {
  starter: false,
  minutes: 0,
  goals: 0,
  assists: 0,
  yellow_cards: 0,
  red_cards: 0,
  saves: 0,
  goals_conceded: 0,
};

const statusVariant = (s: string) =>
  s === "realizada" ? "default" : s === "cancelada" ? "destructive" : "secondary";

function MatchesPage() {
  const qc = useQueryClient();
  const podeEditar = getUsuario()?.papel === "editor";
  const { data, isLoading } = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });
  const { data: players } = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });

  const [status, setStatus] = useState("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Match | null>(null);
  const [form, setForm] = useState<MatchForm>(emptyMatch);
  const [toDelete, setToDelete] = useState<Match | null>(null);
  const [rows, setRows] = useState<Record<string, StatRow>>({});

  const { data: existingStats } = useQuery({
    queryKey: ["match-stats", editing?.id],
    queryFn: () => fetchMatchStats(editing!.id),
    enabled: !!editing && open,
  });

  const activePlayers = (players ?? []).filter((p) => p.active);

  useEffect(() => {
    if (!editing) return;
    const next: Record<string, StatRow> = {};
    for (const p of activePlayers) {
      const found = existingStats?.find((s) => s.player_id === p.id);
      next[p.id] = found
        ? {
            starter: found.starter,
            minutes: found.minutes,
            goals: found.goals,
            assists: found.assists,
            yellow_cards: found.yellow_cards,
            red_cards: found.red_cards,
            saves: found.saves,
            goals_conceded: found.goals_conceded,
          }
        : { ...emptyStat };
    }
    setRows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingStats, editing, players]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: MatchInput = {
        match_date: form.match_date,
        opponent: form.opponent.trim(),
        venue: form.venue as Match["venue"],
        venue_detail: form.venue === "outro" ? form.venue_detail.trim() || null : null,
        mando: form.mando as Match["mando"],
        status: form.status as Match["status"],
        kind: form.kind as Match["kind"],
        notes: form.notes.trim() || null,
        goals_for: form.goals_for === "" ? null : Number(form.goals_for),
        goals_against: form.goals_against === "" ? null : Number(form.goals_against),
      };
      if (!editing) {
        await createMatch(payload);
        return;
      }
      await updateMatch(editing.id, payload);
      if (Object.keys(rows).length) {
        await upsertMatchStats(editing.id, rows, existingStats ?? []);
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Partida atualizada" : "Partida cadastrada");
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["match-stats"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error("Erro ao salvar: " + e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteMatch(id);
    },
    onSuccess: () => {
      toast.success("Partida excluída");
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error("Erro ao excluir: " + e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyMatch);
    setRows({});
    setOpen(true);
  };

  const openEdit = (m: Match) => {
    setEditing(m);
    setForm({
      match_date: m.match_date,
      opponent: m.opponent,
      venue: m.venue,
      venue_detail: m.venue_detail ?? "",
      mando: m.mando,
      status: m.status,
      kind: m.kind,
      notes: m.notes ?? "",
      goals_for: m.goals_for?.toString() ?? "",
      goals_against: m.goals_against?.toString() ?? "",
    });
    setOpen(true);
  };

  const submit = () => {
    if (!form.opponent.trim()) return toast.error("Informe o adversário");
    if (!form.match_date) return toast.error("Informe a data da partida");
    save.mutate();
  };

  const setCell = (playerId: string, key: keyof StatRow, value: number | boolean) =>
    setRows((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [key]: value } }));

  const matches = (data ?? []).filter((m) => status === "todos" || m.status === status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl">Partidas</h1>
          <p className="text-sm text-muted-foreground">Calendário, resultados e estatísticas</p>
        </div>
        <Button onClick={openNew} className={podeEditar ? undefined : "hidden"}>
          <Plus className="mr-1 h-4 w-4" /> Nova partida
        </Button>
      </div>

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="md:w-56">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os status</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {(data ?? []).length === 0
              ? "Nenhuma partida cadastrada ainda."
              : "Nenhuma partida com esse status."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{matchTitle(m)}</span>
                    <Badge variant={statusVariant(m.status)}>{STATUS_LABELS[m.status]}</Badge>
                    <Badge variant="outline">
                      {VENUE_LABELS[m.venue]}
                      {m.venue === "outro" && m.venue_detail ? ` (${m.venue_detail})` : ""}
                    </Badge>
                    <Badge variant="outline">{MANDO_LABELS[m.mando]}</Badge>
                    <Badge variant="outline">{m.kind === "amistoso" ? "Amistoso" : "Campeonato"}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">{formatDate(m.match_date)}</div>
                </div>
                {m.status === "realizada" && (
                  <span className="font-display text-3xl">
                    {m.goals_for ?? 0} × {m.goals_against ?? 0}
                  </span>
                )}
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(m)}>
                    {podeEditar ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {podeEditar && (
                    <Button size="icon" variant="ghost" onClick={() => setToDelete(m)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {!podeEditar ? "Ver partida" : editing ? "Editar partida" : "Nova partida"}
            </DialogTitle>
          </DialogHeader>

          <fieldset disabled={!podeEditar} className="contents">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="date"
                value={form.match_date}
                onChange={(e) => setForm({ ...form, match_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="opponent">Adversário *</Label>
              <Input
                id="opponent"
                maxLength={100}
                value={form.opponent}
                onChange={(e) => setForm({ ...form, opponent: e.target.value })}
              />
            </div>
            <div>
              <Label>Local</Label>
              <Select value={form.venue} onValueChange={(v) => setForm({ ...form, venue: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {VENUE_LABELS[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.venue === "outro" && (
              <div>
                <Label htmlFor="venue_detail">Nome do campo</Label>
                <Input
                  id="venue_detail"
                  maxLength={100}
                  placeholder="Ex: Campo do Bairro Tal"
                  value={form.venue_detail}
                  onChange={(e) => setForm({ ...form, venue_detail: e.target.value })}
                />
              </div>
            )}
            <div>
              <Label>Mando</Label>
              <Select value={form.mando} onValueChange={(v) => setForm({ ...form, mando: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANDOS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MANDO_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="campeonato">Campeonato</SelectItem>
                  <SelectItem value="amistoso">Amistoso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.status === "realizada" && (
              <div className="sm:col-span-2">
                <Label className="mb-2 block">Placar Final</Label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="gf">Suprema Corte</Label>
                    <Input
                      id="gf"
                      type="number"
                      min={0}
                      value={form.goals_for}
                      onChange={(e) => setForm({ ...form, goals_for: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ga">Adversário</Label>
                    <Input
                      id="ga"
                      type="number"
                      min={0}
                      value={form.goals_against}
                      onChange={(e) => setForm({ ...form, goals_against: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                maxLength={1000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          {editing && (
            <>
              <Separator className="my-2" />
              <h3 className="text-xl">Estatísticas dos jogadores</h3>
              {activePlayers.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Nenhum jogador ativo cadastrado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="p-2">Jogador</th>
                        <th className="p-2">Tit.</th>
                        <th className="p-2">Min</th>
                        <th className="p-2">Gols</th>
                        <th className="p-2">Assist.</th>
                        <th className="p-2">CA</th>
                        <th className="p-2">CV</th>
                        <th className="p-2">Def.</th>
                        <th className="p-2">GS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePlayers.map((p) => {
                        const r = rows[p.id] ?? emptyStat;
                        const gk = p.positions.includes("goleiro");
                        const num = (key: keyof StatRow) => (
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-16"
                            value={r[key] as number}
                            onChange={(e) => setCell(p.id, key, Number(e.target.value) || 0)}
                          />
                        );
                        return (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="whitespace-nowrap p-2 font-medium">
                              {p.nickname || p.name}
                            </td>
                            <td className="p-2">
                              <Checkbox
                                checked={r.starter}
                                onCheckedChange={(v) => setCell(p.id, "starter", v === true)}
                              />
                            </td>
                            <td className="p-2">{num("minutes")}</td>
                            <td className="p-2">{num("goals")}</td>
                            <td className="p-2">{num("assists")}</td>
                            <td className="p-2">{num("yellow_cards")}</td>
                            <td className="p-2">{num("red_cards")}</td>
                            <td className="p-2">
                              {gk ? num("saves") : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-2">
                              {gk ? (
                                num("goals_conceded")
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          </fieldset>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {podeEditar ? "Cancelar" : "Fechar"}
            </Button>
            {podeEditar && (
              <Button onClick={submit} disabled={save.isPending}>
                {save.isPending ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir partida contra {toDelete?.opponent}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita e apagará em cascata todas as estatísticas lançadas
              nesta partida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && remove.mutate(toDelete.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}