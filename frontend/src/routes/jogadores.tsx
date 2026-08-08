import { createFileRoute, redirect } from "@tanstack/react-router";
import { isAutenticado } from "@/lib/auth";
import { useUsuario } from "@/lib/useUsuario";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  POSITIONS,
  POSITION_LABELS,
  POSITION_ABBR,
  CATEGORIES,
  CATEGORY_LABELS,
  POSITION_CATEGORY,
  PHONE_REGEX,
  MAX_POSITIONS,
  MAX_NAME_LENGTH,
  MAX_NICKNAME_LENGTH,
  MAX_SHIRT_DIGITS,
  nameHasDigits,
  formatPhone,
  fetchPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  type Player,
  type PlayerInput,
  type Position,
} from "@/lib/football";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/DatePicker";
import { NumberInput } from "@/components/NumberInput";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

export const Route = createFileRoute("/jogadores")({
  beforeLoad: () => {
    if (!isAutenticado()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "SCFC - Jogadores" },
      {
        name: "description",
        content: "Elenco do Suprema Corte FC: cadastro, posições e situação de cada jogador.",
      },
      { property: "og:title", content: "SCFC - Jogadores" },
      { property: "og:description", content: "Elenco completo do Suprema Corte FC." },
    ],
  }),
  component: PlayersPage,
});

type FormState = {
  name: string;
  nickname: string;
  phone: string;
  positions: Position[];
  shirt_number: string;
  birth_date: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  nickname: "",
  phone: "",
  positions: [],
  shirt_number: "",
  birth_date: "",
  active: true,
};

function PlayerCard({
  player,
  podeEditar,
  onEdit,
  onDelete,
}: {
  player: Player;
  podeEditar: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      className={cn(
        "w-64 shrink-0",
        !player.active && "border-purple-300 bg-purple-100 dark:border-purple-400/30 dark:bg-purple-400/15",
      )}
    >
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary font-display text-lg text-primary-foreground">
          {player.shirt_number ?? "–"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{player.name}</span>
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${player.active ? "bg-accent" : "bg-muted-foreground"}`}
              aria-label={player.active ? "Ativo" : "Inativo"}
            />
          </div>
          {player.nickname ? (
            <div className="truncate text-xs text-muted-foreground">"{player.nickname}"</div>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-1">
            {player.positions.map((pos, i) => (
              <Badge
                key={pos}
                variant={i === 0 ? "default" : "outline"}
                // secundária: só o contorno dourado e um véu da cor; o texto
                // segue o foreground para continuar legível nos dois temas
                className={`px-1.5 text-[10px] ${i === 0 ? "" : "border-accent/50 bg-accent/15 text-foreground"}`}
              >
                {POSITION_ABBR[pos]}
              </Badge>
            ))}
          </div>
        </div>
        {podeEditar && (
          <div className="flex shrink-0 flex-col gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlayersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });
  const podeEditar = useUsuario()?.papel === "editor";

  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("todas");
  const [showInactive, setShowInactive] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toDelete, setToDelete] = useState<Player | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const payload: PlayerInput = {
        name: form.name.trim(),
        nickname: form.nickname.trim() || null,
        phone: form.phone.trim(),
        positions: form.positions,
        shirt_number: form.shirt_number ? Number(form.shirt_number) : null,
        birth_date: form.birth_date || null,
        active: form.active,
      };
      if (editing) {
        await updatePlayer(editing.id, payload);
      } else {
        await createPlayer(payload);
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Jogador atualizado" : "Jogador cadastrado");
      qc.invalidateQueries({ queryKey: ["players"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error("Erro ao salvar: " + e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deletePlayer(id);
    },
    onSuccess: () => {
      toast.success("Jogador excluído");
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error("Erro ao excluir: " + e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: Player) => {
    setEditing(p);
    setForm({
      name: p.name,
      nickname: p.nickname ?? "",
      phone: p.phone ?? "",
      positions: p.positions,
      shirt_number: p.shirt_number?.toString() ?? "",
      birth_date: p.birth_date ?? "",
      active: p.active,
    });
    setOpen(true);
  };

  const players = (data ?? []).filter((p) => {
    if (!showInactive && !p.active) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.nickname ?? "").toLowerCase().includes(q);
  });

  const groups = CATEGORIES.map((cat) => ({
    category: cat,
    players: players.filter((p) => POSITION_CATEGORY[p.positions[0]] === cat),
  }))
    .filter((g) => positionFilter === "todas" || g.category === positionFilter)
    .filter((g) => g.players.length > 0);

  const submit = () => {
    const name = form.name.trim();
    if (!name) return toast.error("Informe o nome do jogador");
    if (nameHasDigits(name)) return toast.error("O nome não pode conter números");
    if (name.length > MAX_NAME_LENGTH)
      return toast.error(`O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres`);
    if (form.nickname.trim().length > MAX_NICKNAME_LENGTH)
      return toast.error(`O apelido deve ter no máximo ${MAX_NICKNAME_LENGTH} caracteres`);
    if (!PHONE_REGEX.test(form.phone)) return toast.error("Informe um telefone válido: (DDD) 91234-1234");
    if (form.positions.length === 0) return toast.error("Selecione ao menos uma posição");
    if (form.positions.length > MAX_POSITIONS)
      return toast.error(`Selecione no máximo ${MAX_POSITIONS} posições`);
    save.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl">Jogadores</h1>
          <p className="text-sm text-muted-foreground">Elenco do Suprema Corte FC</p>
        </div>
        <Button onClick={openNew} className={podeEditar ? undefined : "hidden"}>
          <Plus className="mr-1 h-4 w-4" /> Novo jogador
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-xs"
        />
        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="md:w-56">
            <SelectValue placeholder="Posição" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as posições</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor="inactive">Mostrar inativos</Label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {(data ?? []).length === 0
              ? "Nenhum jogador cadastrado ainda."
              : "Nenhum jogador encontrado com esses filtros."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.category}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABELS[g.category]}
                <Badge variant="outline" className="font-normal">
                  {g.players.length}
                </Badge>
              </h2>
              <div className="flex flex-wrap gap-3">
                {g.players.map((p) => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    podeEditar={podeEditar}
                    onEdit={() => openEdit(p)}
                    onDelete={() => setToDelete(p)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar jogador" : "Novo jogador"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                maxLength={MAX_NAME_LENGTH}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="nickname">Apelido</Label>
              <Input
                id="nickname"
                maxLength={MAX_NICKNAME_LENGTH}
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">Telefone *</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="(11) 91234-5678"
                maxLength={15}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="shirt">Número da camisa</Label>
              <NumberInput
                id="shirt"
                value={form.shirt_number}
                onChange={(v) => setForm({ ...form, shirt_number: v })}
                min={0}
                max={999}
                maxDigits={MAX_SHIRT_DIGITS}
              />
            </div>
            <div>
              <Label htmlFor="birth">Data de nascimento</Label>
              <DatePicker
                id="birth"
                value={form.birth_date}
                onChange={(v) => setForm({ ...form, birth_date: v })}
                endMonth={new Date()}
                disabled={{ after: new Date() }}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Posições * (máximo {MAX_POSITIONS})</Label>
              <ToggleGroup
                type="multiple"
                value={form.positions}
                onValueChange={(v) => {
                  const mantidas = form.positions.filter((p) => v.includes(p));
                  const novas = v.filter((p) => !form.positions.includes(p as Position)) as Position[];
                  const todas = [...mantidas, ...novas];
                  if (todas.length > MAX_POSITIONS) {
                    toast.error(`Máximo de ${MAX_POSITIONS} posições por jogador`);
                    return;
                  }
                  setForm({ ...form, positions: todas });
                }}
                className="flex flex-wrap justify-start gap-1.5"
              >
                {POSITIONS.map((pos) => (
                  <ToggleGroupItem
                    key={pos}
                    value={pos}
                    variant="outline"
                    className="h-8 px-2.5 text-xs"
                    aria-label={POSITION_LABELS[pos]}
                    title={POSITION_LABELS[pos]}
                  >
                    {POSITION_ABBR[pos]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {form.positions.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Principal: <span className="font-medium text-foreground">{POSITION_LABELS[form.positions[0]]}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
              <Label htmlFor="active">Jogador ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita e apagará em cascata todas as estatísticas deste
              jogador em todas as partidas.
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
