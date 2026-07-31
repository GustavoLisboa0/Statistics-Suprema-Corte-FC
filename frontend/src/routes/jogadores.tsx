import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  POSITIONS,
  fetchPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  type Player,
  type PlayerInput,
} from "@/lib/football";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  head: () => ({
    meta: [
      { title: "Jogadores — Suprema Corte FC" },
      {
        name: "description",
        content: "Elenco do Suprema Corte FC: cadastro, posições e situação de cada jogador.",
      },
      { property: "og:title", content: "Jogadores — Suprema Corte FC" },
      { property: "og:description", content: "Elenco completo do Suprema Corte FC." },
    ],
  }),
  component: PlayersPage,
});

type FormState = {
  name: string;
  nickname: string;
  position: string;
  shirt_number: string;
  birth_date: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  nickname: "",
  position: "",
  shirt_number: "",
  birth_date: "",
  active: true,
};

function PlayersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });

  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("todas");
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
        position: form.position as Player["position"],
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
      position: p.position,
      shirt_number: p.shirt_number?.toString() ?? "",
      birth_date: p.birth_date ?? "",
      active: p.active,
    });
    setOpen(true);
  };

  const players = (data ?? []).filter((p) => {
    if (!showInactive && !p.active) return false;
    if (position !== "todas" && p.position !== position) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.nickname ?? "").toLowerCase().includes(q);
  });

  const submit = () => {
    if (!form.name.trim()) return toast.error("Informe o nome do jogador");
    if (!form.position) return toast.error("Informe a posição do jogador");
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
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-xs"
        />
        <Select value={position} onValueChange={setPosition}>
          <SelectTrigger className="md:w-48">
            <SelectValue placeholder="Posição" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as posições</SelectItem>
            {POSITIONS.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">
                {p}
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
      ) : players.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {(data ?? []).length === 0
              ? "Nenhum jogador cadastrado ainda."
              : "Nenhum jogador encontrado com esses filtros."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {players.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-display text-xl text-primary-foreground">
                  {p.shirt_number ?? "–"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{p.name}</span>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${p.active ? "bg-accent" : "bg-muted-foreground"}`}
                      aria-label={p.active ? "Ativo" : "Inativo"}
                    />
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {p.nickname ? `"${p.nickname}" · ` : ""}
                    <span className="capitalize">{p.position}</span>
                  </div>
                  <Badge variant={p.active ? "secondary" : "outline"} className="mt-1">
                    {p.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setToDelete(p)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
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
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="nickname">Apelido</Label>
              <Input
                id="nickname"
                maxLength={50}
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              />
            </div>
            <div>
              <Label>Posição *</Label>
              <Select
                value={form.position}
                onValueChange={(v) => setForm({ ...form, position: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="shirt">Número da camisa</Label>
              <Input
                id="shirt"
                type="number"
                min={0}
                max={99}
                value={form.shirt_number}
                onChange={(e) => setForm({ ...form, shirt_number: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="birth">Data de nascimento</Label>
              <Input
                id="birth"
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
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