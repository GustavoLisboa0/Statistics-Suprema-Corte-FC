import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  POSITIONS,
  POSITION_LABELS,
  POSITION_ABBR,
  fetchPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  type Player,
  type PlayerInput,
  type Position,
} from "@/lib/football";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

type PlayerGroupKey = "goleiro" | "defesa" | "meio_campo" | "ataque";

const PLAYER_GROUPS: Array<{
  key: PlayerGroupKey;
  label: string;
}> = [
  {
    key: "goleiro",
    label: "Goleiro",
  },
  {
    key: "defesa",
    label: "Defesa",
  },
  {
    key: "meio_campo",
    label: "Meio Campo",
  },
  {
    key: "ataque",
    label: "Ataque",
  },
];

function getPlayerGroup(position: Position): PlayerGroupKey {
  switch (position) {
    case "goleiro":
      return "goleiro";
    case "lateral_direito":
    case "lateral_esquerdo":
    case "zagueiro":
    case "lateral":
      return "defesa";
    case "volante":
    case "meia":
    case "meia_esquerda":
    case "meia_direita":
    case "meia_atacante":
    case "meio":
      return "meio_campo";
    default:
      return "ataque";
  }
}

function secondaryPositionBadgeClass() {
  return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300";
}

export const Route = createFileRoute("/jogadores")({
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
  positions: Position[];
  shirt_number: string;
  birth_date: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  nickname: "",
  positions: [],
  shirt_number: "",
  birth_date: "",
  active: true,
};

function PlayerCard({
  player,
  onEdit,
  onDelete,
}: {
  player: Player;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="w-64 shrink-0">
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
            {player.positions.map((position, index) => (
              <Badge
                key={position}
                variant={index === 0 ? "default" : "secondary"}
                className={`px-1.5 text-[10px] ${index > 0 ? secondaryPositionBadgeClass() : ""}`}
              >
                {POSITION_ABBR[position]}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PlayersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });

  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<PlayerGroupKey | "todas">("todas");
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
    onError: (error: Error) => toast.error("Erro ao salvar: " + error.message),
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
    onError: (error: Error) => toast.error("Erro ao excluir: " + error.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (player: Player) => {
    setEditing(player);
    setForm({
      name: player.name,
      nickname: player.nickname ?? "",
      positions: player.positions,
      shirt_number: player.shirt_number?.toString() ?? "",
      birth_date: player.birth_date ?? "",
      active: player.active,
    });
    setOpen(true);
  };

  const players = (data ?? []).filter((player) => {
    if (!showInactive && !player.active) return false;
    const query = search.trim().toLowerCase();
    if (
      query &&
      !player.name.toLowerCase().includes(query) &&
      !(player.nickname ?? "").toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });

  const groups = PLAYER_GROUPS.map((group) => ({
    ...group,
    players: players.filter((player) => getPlayerGroup(player.position) === group.key),
  }))
    .filter((group) => positionFilter === "todas" || group.key === positionFilter)
    .filter((group) => group.players.length > 0);

  const submit = () => {
    if (!form.name.trim()) return toast.error("Informe o nome do jogador");
    if (form.positions.length === 0) return toast.error("Selecione ao menos uma posição");
    save.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl">Jogadores</h1>
          <p className="text-sm text-muted-foreground">Elenco do Suprema Corte FC</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> Novo jogador
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="md:max-w-xs"
        />
        <Select value={positionFilter} onValueChange={(value) => setPositionFilter(value as PlayerGroupKey | "todas")}>
          <SelectTrigger className="md:w-56">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {PLAYER_GROUPS.map((group) => (
              <SelectItem key={group.key} value={group.key}>
                {group.label}
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
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-20 w-full" />
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
          {groups.map((group) => (
            <div key={group.key}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
                <Badge variant="outline" className="font-normal">
                  {group.players.length}
                </Badge>
              </h2>
              <div className="flex flex-wrap gap-3">
                {group.players.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    onEdit={() => openEdit(player)}
                    onDelete={() => setToDelete(player)}
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
                maxLength={100}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="nickname">Apelido</Label>
              <Input
                id="nickname"
                maxLength={50}
                value={form.nickname}
                onChange={(event) => setForm({ ...form, nickname: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="shirt">Número da camisa</Label>
              <Input
                id="shirt"
                type="number"
                min={0}
                max={99}
                value={form.shirt_number}
                onChange={(event) => setForm({ ...form, shirt_number: event.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Posições * (selecione uma ou mais)</Label>
              <ToggleGroup
                type="multiple"
                value={form.positions}
                onValueChange={(value) => setForm({ ...form, positions: value as Position[] })}
                className="flex flex-wrap justify-start gap-1.5"
              >
                {POSITIONS.map((position) => (
                  <ToggleGroupItem
                    key={position}
                    value={position}
                    variant="outline"
                    className="h-8 px-2.5 text-xs"
                    aria-label={POSITION_LABELS[position]}
                    title={POSITION_LABELS[position]}
                  >
                    {POSITION_ABBR[position]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div>
              <Label htmlFor="birth">Data de nascimento</Label>
              <Input
                id="birth"
                type="date"
                value={form.birth_date}
                onChange={(event) => setForm({ ...form, birth_date: event.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={form.active}
                onCheckedChange={(value) => setForm({ ...form, active: value })}
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

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
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
