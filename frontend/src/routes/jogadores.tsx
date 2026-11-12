import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { isAutenticado } from "@/lib/auth";
import { useUsuario } from "@/lib/useUsuario";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  HeartPulse,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  POSITIONS,
  POSITION_LABELS,
  POSITION_ABBR,
  CATEGORIES,
  POSITION_CATEGORY,
  PHONE_REGEX,
  EMAIL_REGEX,
  MAX_POSITIONS,
  MAX_NAME_LENGTH,
  MAX_NICKNAME_LENGTH,
  MAX_SHIRT_DIGITS,
  nameHasDigits,
  formatPhone,
  fetchPlayers,
  fetchMeuJogador,
  fetchActiveInjuries,
  fetchAllStats,
  formatDate,
  createPlayer,
  updatePlayer,
  deletePlayer,
  type Category,
  type Injury,
  type Player,
  type PlayerInput,
  type Position,
} from "@/lib/football";
import { cn } from "@/lib/utils";
import { PunicoesDialog } from "@/components/PunicoesDialog";
import { AtributosJogadorDialog } from "@/components/AtributosJogadorDialog";
import { LesaoDialog } from "@/components/LesaoDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/DatePicker";
import { NumberInput } from "@/components/NumberInput";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ssr: false, // depende da sessão do navegador (ver comentário em routes/index.tsx)
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
  email: string;
  positions: Position[];
  shirt_number: string;
  birth_date: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  nickname: "",
  phone: "",
  email: "",
  positions: [],
  shirt_number: "",
  birth_date: "",
  active: true,
};

// Rótulos curtos das pílulas de setor (CATEGORY_LABELS é singular/longo).
const SECTOR_PILL_LABELS: Record<Category, string> = {
  goleiro: "Goleiros",
  defesa: "Defesa",
  meio: "Meio",
  ataque: "Ataque",
};

type SectorFilter = "todos" | Category;

type PlayerTotals = { games: number; goals: number; cards: number };

function PlayerCard({
  player,
  podeEditar,
  isMine,
  injury,
  totals,
  onEdit,
  onDelete,
  onEditMine,
  onPunicoes,
  onLesoes,
  onAtributos,
}: {
  player: Player;
  podeEditar: boolean;
  isMine: boolean;
  injury: Injury | null;
  /** null = estatísticas ainda não carregadas (rodapé omitido). */
  totals: PlayerTotals | null;
  onEdit: () => void;
  onDelete: () => void;
  onEditMine: () => void;
  onPunicoes: () => void;
  onLesoes: () => void;
  onAtributos: () => void;
}) {
  const injuryDeadline = injury
    ? injury.type === "data"
      ? `Até ${formatDate(injury.ends_on)}`
      : "Só o próximo jogo"
    : "";

  return (
    <li
      className={cn(
        "flex flex-col gap-3.5 rounded-2xl border bg-card p-5",
        !player.active && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            "num min-w-[54px] text-5xl leading-[0.9]",
            player.active ? "text-primary" : "text-muted-foreground",
          )}
          aria-label={
            player.shirt_number != null ? `Camisa ${player.shirt_number}` : "Sem número de camisa"
          }
        >
          {player.shirt_number ?? "–"}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <span className="break-words text-base font-bold leading-tight">{player.name}</span>
          {player.nickname ? (
            <span className="truncate text-[13px] text-muted-foreground">“{player.nickname}”</span>
          ) : null}
        </div>
        {podeEditar ? (
          <div className="-mr-2 -mt-2 flex shrink-0 items-center">
            <Button
              size="icon"
              variant="ghost"
              className="h-11 w-11 text-muted-foreground"
              onClick={onEdit}
              aria-label={`Editar ${player.name}`}
              title="Editar"
            >
              <Pencil aria-hidden="true" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11 text-muted-foreground"
                  aria-label={`Mais ações para ${player.name}`}
                  title="Mais ações"
                >
                  <MoreVertical aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onPunicoes} className="min-h-11">
                  <ShieldAlert className="mr-2" aria-hidden="true" /> Punições
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onLesoes} className="min-h-11">
                  <HeartPulse className="mr-2" aria-hidden="true" /> Lesões
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAtributos} className="min-h-11">
                  <SlidersHorizontal className="mr-2" aria-hidden="true" /> Atributos
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="min-h-11 text-destructive focus:bg-destructive focus:text-destructive-foreground"
                >
                  <Trash2 className="mr-2" aria-hidden="true" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : isMine ? (
          <Button
            size="icon"
            variant="ghost"
            className="-mr-2 -mt-2 h-11 w-11 shrink-0 text-muted-foreground"
            onClick={onEditMine}
            aria-label="Editar meu cadastro"
            title="Editar meu cadastro"
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {player.positions.map((pos, i) => (
          <span
            key={pos}
            title={POSITION_LABELS[pos]}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs font-bold",
              i === 0 ? "border-accent bg-accent text-accent-foreground" : "text-muted-foreground",
            )}
          >
            {POSITION_ABBR[pos]}
          </span>
        ))}
        {injury && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Lesionado"
                aria-label={`Lesionado: ${injury.reason} (${injuryDeadline})`}
                // 28px visíveis; o ::after amplia a área de toque para 44px
                className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground after:absolute after:-inset-2 after:content-['']"
              >
                <HeartPulse className="h-4 w-4" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 text-sm" align="start">
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-destructive">
                <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" /> Lesionado
              </p>
              <p>{injury.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">{injuryDeadline}</p>
            </PopoverContent>
          </Popover>
        )}
        {!player.active && (
          <span className="rounded-md bg-raised px-2 py-0.5 text-xs font-bold text-muted-foreground">
            Inativo
          </span>
        )}
      </div>

      {totals && (
        <div className="mt-auto flex justify-between gap-3 border-t pt-3 text-[13px] text-muted-foreground">
          <span>
            {totals.games} {totals.games === 1 ? "jogo" : "jogos"}
          </span>
          <span>
            {totals.goals} {totals.goals === 1 ? "gol" : "gols"}
          </span>
          <span>
            {totals.cards} {totals.cards === 1 ? "cartão" : "cartões"}
          </span>
        </div>
      )}
    </li>
  );
}

function PlayersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });
  const podeEditar = useUsuario()?.papel === "editor";
  // Só precisa saber "qual card é meu" pra quem não é editor — usado pra
  // mostrar a ação de autoedição em vez do lápis/lixeira do admin.
  const { data: meuJogador } = useQuery({
    queryKey: ["meu-jogador"],
    queryFn: fetchMeuJogador,
    enabled: !podeEditar,
  });
  // Visível pra todo mundo logado — diferente de punição, lesão não é segredo.
  const { data: activeInjuries } = useQuery({
    queryKey: ["active-injuries"],
    queryFn: fetchActiveInjuries,
  });
  const injuriesByPlayer = new Map((activeInjuries ?? []).map((i) => [i.player_id, i]));

  // Mesma query (e chave) do dashboard: uma linha por jogador por partida realizada.
  const { data: allStats } = useQuery({ queryKey: ["stats"], queryFn: fetchAllStats });
  const totalsByPlayer = new Map<string, PlayerTotals>();
  for (const s of allStats ?? []) {
    const t = totalsByPlayer.get(s.player_id) ?? { games: 0, goals: 0, cards: 0 };
    t.games += 1;
    t.goals += s.goals;
    t.cards += s.yellow_cards + s.red_cards;
    totalsByPlayer.set(s.player_id, t);
  }

  const [search, setSearch] = useState("");
  const [sector, setSector] = useState<SectorFilter>("todos");
  const [showInactive, setShowInactive] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialForm, setInitialForm] = useState<FormState>(emptyForm);
  const [toDelete, setToDelete] = useState<Player | null>(null);
  const [punicoesDe, setPunicoesDe] = useState<Player | null>(null);
  const [atributosDe, setAtributosDe] = useState<Player | null>(null);
  const [lesoesDe, setLesoesDe] = useState<Player | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const payload: PlayerInput = {
        name: form.name.trim(),
        nickname: form.nickname.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
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

  // Salvar só faz sentido depois de alguma mudança de verdade (mesmo padrão de /meu-jogador).
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

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
    setInitialForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: Player) => {
    const inicial: FormState = {
      name: p.name,
      nickname: p.nickname ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      positions: p.positions,
      shirt_number: p.shirt_number?.toString() ?? "",
      birth_date: p.birth_date ?? "",
      active: p.active,
    };
    setEditing(p);
    setForm(inicial);
    setInitialForm(inicial);
    setOpen(true);
  };

  const allPlayers = data ?? [];
  const activeCount = allPlayers.filter((p) => p.active).length;
  const inactiveCount = allPlayers.length - activeCount;

  // Ordem de exibição: por setor da posição principal (goleiro → ataque),
  // mantendo a ordem da API dentro de cada setor.
  const categoryOrder = (p: Player) => CATEGORIES.indexOf(POSITION_CATEGORY[p.positions[0]]);
  const players = allPlayers
    .filter((p) => {
      if (!showInactive && !p.active) return false;
      if (sector !== "todos" && POSITION_CATEGORY[p.positions[0]] !== sector) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.nickname ?? "").toLowerCase().includes(q);
    })
    .map((p, i) => ({ p, i }))
    .sort((a, b) => categoryOrder(a.p) - categoryOrder(b.p) || a.i - b.i)
    .map(({ p }) => p);

  const submit = () => {
    const name = form.name.trim();
    if (!name) return toast.error("Informe o nome do jogador");
    if (nameHasDigits(name)) return toast.error("O nome não pode conter números");
    if (name.length > MAX_NAME_LENGTH)
      return toast.error(`O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres`);
    if (form.nickname.trim().length > MAX_NICKNAME_LENGTH)
      return toast.error(`O apelido deve ter no máximo ${MAX_NICKNAME_LENGTH} caracteres`);
    if (!PHONE_REGEX.test(form.phone))
      return toast.error("Informe um telefone válido: (DDD) 91234-1234");
    if (form.email.trim() && !EMAIL_REGEX.test(form.email.trim()))
      return toast.error("Informe um email válido");
    if (form.positions.length === 0) return toast.error("Selecione ao menos uma posição");
    if (form.positions.length > MAX_POSITIONS)
      return toast.error(`Selecione no máximo ${MAX_POSITIONS} posições`);
    save.mutate();
  };

  const sectorOptions: { value: SectorFilter; label: string }[] = [
    { value: "todos", label: "Todos" },
    ...CATEGORIES.map((c) => ({ value: c, label: SECTOR_PILL_LABELS[c] })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 min-h-[1lh] text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {data
              ? `${activeCount} ${activeCount === 1 ? "ativo" : "ativos"} · ${inactiveCount} ${
                  inactiveCount === 1 ? "inativo" : "inativos"
                }`
              : null}
          </p>
          <h1 className="text-3xl leading-tight">Elenco</h1>
        </div>
        {podeEditar && (
          <Button onClick={openNew} className="min-h-11 px-5 font-bold">
            <Plus aria-hidden="true" /> Novo jogador
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-[1_1_260px]">
          <Label htmlFor="busca-jogador" className="sr-only">
            Buscar jogador
          </Label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="busca-jogador"
            type="search"
            placeholder="Buscar por nome ou apelido"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-[10px] bg-card pl-10"
          />
        </div>
        <div role="group" aria-label="Filtrar por setor" className="flex flex-wrap gap-2">
          {sectorOptions.map((opt) => {
            const ativo = sector === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={ativo}
                onClick={() => setSector(opt.value)}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo
                    ? "border-accent bg-accent font-bold text-accent-foreground"
                    : "bg-card text-foreground hover:bg-raised",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="flex min-h-11 items-center gap-2">
          <Switch id="inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor="inactive" className="cursor-pointer">
            Mostrar inativos
          </Label>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="rounded-2xl border bg-card px-5 py-10 text-center text-muted-foreground">
          {allPlayers.length === 0
            ? "Nenhum jogador cadastrado ainda."
            : "Nenhum jogador encontrado com esses filtros."}
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-0">
          {players.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              podeEditar={podeEditar}
              isMine={p.id === meuJogador?.id}
              injury={injuriesByPlayer.get(p.id) ?? null}
              totals={
                allStats ? (totalsByPlayer.get(p.id) ?? { games: 0, goals: 0, cards: 0 }) : null
              }
              onEdit={() => openEdit(p)}
              onDelete={() => setToDelete(p)}
              onEditMine={() => navigate({ to: "/meu-jogador" })}
              onPunicoes={() => setPunicoesDe(p)}
              onLesoes={() => setLesoesDe(p)}
              onAtributos={() => setAtributosDe(p)}
            />
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-lg sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {editing ? "Editar jogador" : "Novo jogador"}
            </DialogTitle>
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
            <div className="sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                placeholder="email@exemplo.com"
                maxLength={150}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
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
              <Label id="positions-label">
                Posições *{" "}
                <span className="font-normal text-muted-foreground">(máximo {MAX_POSITIONS})</span>
              </Label>
              <ToggleGroup
                type="multiple"
                aria-labelledby="positions-label"
                value={form.positions}
                onValueChange={(v) => {
                  const mantidas = form.positions.filter((p) => v.includes(p));
                  const novas = v.filter(
                    (p) => !form.positions.includes(p as Position),
                  ) as Position[];
                  const todas = [...mantidas, ...novas];
                  if (todas.length > MAX_POSITIONS) {
                    toast.error(`Máximo de ${MAX_POSITIONS} posições por jogador`);
                    return;
                  }
                  setForm({ ...form, positions: todas });
                }}
                className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5"
              >
                {POSITIONS.map((pos) => (
                  <ToggleGroupItem
                    key={pos}
                    value={pos}
                    variant="outline"
                    className="h-11 w-full px-0 text-xs font-bold data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                    aria-label={POSITION_LABELS[pos]}
                    title={POSITION_LABELS[pos]}
                  >
                    {POSITION_ABBR[pos]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {form.positions.length > 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Principal:{" "}
                  <span className="font-medium text-foreground">
                    {POSITION_LABELS[form.positions[0]]}
                  </span>
                </p>
              )}
            </div>
            <div className="flex min-h-11 items-center gap-2">
              <Switch
                id="active"
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
              <Label htmlFor="active" className="cursor-pointer">
                Jogador ativo
              </Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button className="min-h-11" onClick={submit} disabled={save.isPending || !isDirty}>
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-card sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Excluir {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita e apagará em cascata todas as estatísticas deste
              jogador em todas as partidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AtributosJogadorDialog
        player={atributosDe}
        open={!!atributosDe}
        onOpenChange={(o) => !o && setAtributosDe(null)}
      />

      <PunicoesDialog
        player={punicoesDe}
        open={!!punicoesDe}
        onOpenChange={(o) => !o && setPunicoesDe(null)}
      />

      <LesaoDialog
        player={lesoesDe}
        open={!!lesoesDe}
        onOpenChange={(o) => !o && setLesoesDe(null)}
      />
    </div>
  );
}
