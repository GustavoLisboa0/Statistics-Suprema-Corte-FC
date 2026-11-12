import { createFileRoute, redirect } from "@tanstack/react-router";
import { isAutenticado } from "@/lib/auth";
import { useUsuario } from "@/lib/useUsuario";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Pencil,
  Plus,
  Trash2,
  Eye,
  UserCheck,
  UserPlus,
  Loader2,
  X,
  CloudSun,
  CloudOff,
  RefreshCw,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";

import {
  STATUSES,
  STATUS_LABELS,
  STATUS_LABELS_PLURAL,
  VENUES,
  VENUE_LABELS,
  MANDOS,
  MANDO_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  POSITION_CATEGORY,
  POSITION_LABELS,
  POSITION_ABBR,
  MIN_LINE_SLOTS,
  MAX_LINE_SLOTS,
  matchTitle,
  fetchMatchStats,
  fetchMatches,
  fetchPlayers,
  fetchPresences,
  confirmPresenceAsEditor,
  updatePaymentStatus,
  updatePresenceStatus,
  updatePresencePosition,
  deletePresence,
  formatDate,
  formatMoney,
  teamCost,
  feePerPlayer,
  createMatch,
  updateMatch,
  deleteMatch,
  refreshMatchWeather,
  upsertMatchStats,
  type Match,
  type MatchInput,
  type Position,
  type Presence,
  type Status,
} from "@/lib/football";
import { cn } from "@/lib/utils";
import { ResultChip } from "@/components/ResultBadge";
import { ConfirmarPresenca, PresenceBadge } from "@/components/ConfirmarPresenca";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { DatePicker } from "@/components/DatePicker";
import { NumberInput } from "@/components/NumberInput";
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
  ssr: false, // depende da sessão do navegador (ver comentário em routes/index.tsx)
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
  kickoff_time: string;
  opponent: string;
  venue: string;
  venue_detail: string;
  mando: string;
  status: string;
  kind: string;
  notes: string;
  goals_for: string;
  goals_against: string;
  line_slots: string;
  court_fee: string;
  referee_fee: string;
  keeper_fee: string;
};

const emptyMatch: MatchForm = {
  match_date: new Date().toISOString().slice(0, 10),
  kickoff_time: "",
  opponent: "",
  venue: "trieste",
  venue_detail: "",
  mando: "mandante",
  status: "agendada",
  kind: "campeonato",
  notes: "",
  goals_for: "",
  goals_against: "",
  line_slots: "",
  court_fee: "",
  referee_fee: "",
  keeper_fee: "",
};

type StatRow = {
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

const emptyStat: StatRow = {
  position: null,
  starter: false,
  minutes: 0,
  goals: 0,
  assists: 0,
  yellow_cards: 0,
  red_cards: 0,
  saves: 0,
  goals_conceded: 0,
};

type Filtro = "todos" | Status;

/** "Sábado, 14/11/2026 às 20:00" — dia da semana + data + horário (se houver). */
function dataHora(m: Match) {
  const [y, mo, d] = m.match_date.split("-").map(Number);
  const dia = new Date(y, (mo ?? 1) - 1, d ?? 1);
  const semana = Number.isNaN(dia.getTime())
    ? ""
    : dia.toLocaleDateString("pt-BR", { weekday: "long" });
  const prefixo = semana ? `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ` : "";
  return `${prefixo}${formatDate(m.match_date)}${m.kickoff_time ? ` às ${m.kickoff_time.slice(0, 5)}` : ""}`;
}

function localLabel(m: Match) {
  return `${VENUE_LABELS[m.venue]}${m.venue === "outro" && m.venue_detail ? ` (${m.venue_detail})` : ""}`;
}

function tipoLabel(m: Match) {
  return m.kind === "amistoso" ? "Amistoso" : "Campeonato";
}

/** Etiqueta quadrada de status. `destaque` = dourado, usado no próximo jogo. */
function StatusTag({ status, destaque = false }: { status: Status; destaque?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-extrabold uppercase tracking-[0.06em]",
        destaque
          ? "border-accent bg-accent text-accent-foreground"
          : status === "cancelada"
            ? "border-destructive/40 bg-transparent text-destructive"
            : "bg-raised text-foreground",
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const chipClass = "inline-flex items-center rounded-full border bg-raised px-2.5 py-1 text-[13px]";

/** Badge de clima + botão de atualizar (só editor). Some se a partida não tem horário. */
function WeatherChip({
  match: m,
  podeEditar,
  refreshing,
  onRefresh,
}: {
  match: Match;
  podeEditar: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  if (!m.kickoff_time) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {m.weather ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-border bg-sky px-2.5 py-1 text-[13px] text-sky-foreground">
          <CloudSun aria-hidden="true" className="h-4 w-4" />
          {Math.round(m.weather.temperature)}°C · {m.weather.condition}
          {m.weather.source === "previsao" && m.weather.rain_chance !== null
            ? ` · ${m.weather.rain_chance}% chuva`
            : m.weather.source === "historico" && m.weather.rain_mm !== null
              ? ` · ${m.weather.rain_mm} mm`
              : ""}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] text-muted-foreground">
          <CloudOff aria-hidden="true" className="h-4 w-4" />
          Clima indisponível
        </span>
      )}
      {podeEditar && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full text-muted-foreground"
          aria-label="Atualizar clima"
          title="Atualizar clima"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      )}
    </span>
  );
}

/**
 * Ações de um card de partida. Editor: lápis + menu "⋯" (excluir).
 * Visualizador: só o olho, que abre a partida em modo leitura.
 */
function MatchActions({
  podeEditar,
  showEdit = true,
  onEdit,
  onDelete,
}: {
  podeEditar: boolean;
  showEdit?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!podeEditar) {
    return showEdit ? (
      <Button
        size="icon"
        variant="outline"
        className="h-11 w-11 rounded-[10px] bg-transparent"
        aria-label="Ver partida"
        onClick={onEdit}
      >
        <Eye aria-hidden="true" className="h-[18px] w-[18px]" />
      </Button>
    ) : null;
  }
  return (
    <div className="flex gap-1.5">
      {showEdit && (
        <Button
          size="icon"
          variant="outline"
          className="h-11 w-11 rounded-[10px] bg-transparent"
          aria-label="Editar partida"
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" className="h-[18px] w-[18px]" />
        </Button>
      )}
      {/* modal={false}: o item abre outro diálogo; com o menu modal o Radix
        pode deixar `pointer-events: none` preso no body ao trocar de camada. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11 rounded-[10px] bg-transparent"
            aria-label="Mais ações"
          >
            <MoreVertical aria-hidden="true" className="h-[18px] w-[18px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!showEdit && (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden="true" />
              Editar partida
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
          >
            <Trash2 aria-hidden="true" />
            Excluir partida
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MatchesPage() {
  const qc = useQueryClient();
  const usuario = useUsuario();
  const podeEditar = usuario?.papel === "editor";
  const { data, isLoading } = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });
  const { data: players } = useQuery({ queryKey: ["players"], queryFn: fetchPlayers });

  const [status, setStatus] = useState<Filtro>("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Match | null>(null);
  const [form, setForm] = useState<MatchForm>(emptyMatch);
  const [toDelete, setToDelete] = useState<Match | null>(null);
  const [rows, setRows] = useState<Record<string, StatRow>>({});
  const [confirmando, setConfirmando] = useState<Match | null>(null);
  const [toRemoverPresenca, setToRemoverPresenca] = useState<Presence | null>(null);
  // Formulário do editor pra confirmar presença de quem avisou por fora.
  const [jogadorParaAdicionar, setJogadorParaAdicionar] = useState("");
  const [posicaoParaAdicionar, setPosicaoParaAdicionar] = useState<Position | "">("");
  // Posição escolhida ao reverter um "não vai" de volta pra confirmado,
  // por jogador (cada linha "ausente" tem seu próprio seletor).
  const [posicaoReversao, setPosicaoReversao] = useState<Record<string, Position>>({});

  const { data: existingStats } = useQuery({
    queryKey: ["match-stats", editing?.id],
    queryFn: () => fetchMatchStats(editing!.id),
    enabled: !!editing && open,
  });

  // Presenças da partida aberta (para a lista) e da que está confirmando.
  const partidaComPresenca = editing ?? confirmando;
  const { data: presences } = useQuery({
    queryKey: ["presences", partidaComPresenca?.id],
    queryFn: () => fetchPresences(partidaComPresenca!.id),
    enabled: !!partidaComPresenca,
  });

  // Próximo jogo = primeira agendada (fetchMatches já ordena: próximas
  // primeiro, da mais perto de hoje). Alimenta o card destacado e o "Quem vai".
  const proximoJogo = (data ?? []).find((m) => m.status === "agendada") ?? null;
  const { data: presencasProximo, isLoading: carregandoProximo } = useQuery({
    queryKey: ["presences", proximoJogo?.id],
    queryFn: () => fetchPresences(proximoJogo!.id),
    enabled: !!proximoJogo,
  });

  const activePlayers = (players ?? []).filter((p) => p.active);

  // Qual jogador é a conta logada. Mesma regra do backend: casa pelo email.
  const meuEmail = (usuario?.email ?? "").trim().toLowerCase();
  const meuJogador =
    (meuEmail && activePlayers.find((p) => (p.email ?? "").trim().toLowerCase() === meuEmail)) ||
    null;

  const minhaPresenca =
    (meuJogador && (presences ?? []).find((p) => p.player_id === meuJogador.id)) || null;

  const jogadorParaRemover = (players ?? []).find((p) => p.id === toRemoverPresenca?.player_id);
  const nomeParaRemover = jogadorParaRemover
    ? jogadorParaRemover.nickname || jogadorParaRemover.name
    : "este jogador";

  // Partidas anteriores a esta feature não têm presença; nesse caso a lista
  // segue mostrando o elenco inteiro, senão sumiria tudo.
  const temPresenca = (presences ?? []).length > 0;
  const presencaPorJogador = new Map((presences ?? []).map((pr) => [pr.player_id, pr]));
  const confirmados = (presences ?? []).filter((p) => p.status === "confirmado");

  // Lista unificada: todo mundo com presença registrada (confirmado, espera
  // ou ausente) — o editor gerencia tudo num só lugar (posição, pagamento,
  // cancelar, retirar). Sem nenhuma presença, cai no elenco inteiro.
  const jogadoresDaPartida = temPresenca
    ? (presences ?? [])
        .map((pr) => activePlayers.find((p) => p.id === pr.player_id))
        .filter((p): p is (typeof activePlayers)[number] => !!p)
    : activePlayers;

  // Só entra na tabela de estatísticas quem realmente confirmou (ou, no modo
  // legado sem presença, todo mundo — igual já era antes desta feature).
  const jogadoresComEstatisticas = temPresenca
    ? jogadoresDaPartida.filter((p) => presencaPorJogador.get(p.id)?.status === "confirmado")
    : jogadoresDaPartida;

  useEffect(() => {
    if (!editing) return;
    const next: Record<string, StatRow> = {};
    for (const p of jogadoresComEstatisticas) {
      const found = existingStats?.find((s) => s.player_id === p.id);
      // Prioridade: posição já lançada > posição declarada na presença > principal.
      const daPresenca = (presences ?? []).find((pr) => pr.player_id === p.id)?.position ?? null;
      const padrao = daPresenca ?? p.positions[0] ?? null;
      next[p.id] = found
        ? {
            position: found.position ?? padrao,
            starter: found.starter,
            minutes: found.minutes,
            goals: found.goals,
            assists: found.assists,
            yellow_cards: found.yellow_cards,
            red_cards: found.red_cards,
            saves: found.saves,
            goals_conceded: found.goals_conceded,
          }
        : { ...emptyStat, position: padrao };
    }
    setRows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingStats, editing, players, presences]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: MatchInput = {
        match_date: form.match_date,
        kickoff_time: form.kickoff_time || null,
        opponent: form.opponent.trim(),
        venue: form.venue as Match["venue"],
        venue_detail: form.venue === "outro" ? form.venue_detail.trim() || null : null,
        mando: form.mando as Match["mando"],
        status: form.status as Match["status"],
        kind: form.kind as Match["kind"],
        notes: form.notes.trim() || null,
        goals_for: form.goals_for === "" ? null : Number(form.goals_for),
        goals_against: form.goals_against === "" ? null : Number(form.goals_against),
        line_slots: form.line_slots === "" ? null : Number(form.line_slots),
        court_fee: form.court_fee === "" ? null : Number(form.court_fee),
        referee_fee: form.referee_fee === "" ? null : Number(form.referee_fee),
        keeper_fee: form.keeper_fee === "" ? null : Number(form.keeper_fee),
      };
      if (!editing) {
        await createMatch(payload);
        return;
      }
      await updateMatch(editing.id, payload);
      // Estatística só existe pra jogo que já rolou — as colunas nem aparecem
      // na tela antes disso (ver renderização mais abaixo). Sem essa checagem,
      // qualquer salvamento de uma partida agendada reenviava estatística de
      // todo mundo à toa.
      if (payload.status === "realizada" && Object.keys(rows).length) {
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

  const refreshWeather = useMutation({
    mutationFn: (id: string) => refreshMatchWeather(id),
    onSuccess: () => {
      toast.success("Previsão atualizada");
      qc.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
      kickoff_time: m.kickoff_time?.slice(0, 5) ?? "",
      opponent: m.opponent,
      venue: m.venue,
      venue_detail: m.venue_detail ?? "",
      mando: m.mando,
      status: m.status,
      kind: m.kind,
      notes: m.notes ?? "",
      goals_for: m.goals_for?.toString() ?? "",
      goals_against: m.goals_against?.toString() ?? "",
      line_slots: m.line_slots?.toString() ?? "",
      court_fee: m.court_fee?.toString() ?? "",
      referee_fee: m.referee_fee?.toString() ?? "",
      keeper_fee: m.keeper_fee?.toString() ?? "",
    });
    setOpen(true);
  };

  const submit = () => {
    if (!form.opponent.trim()) return toast.error("Informe o adversário");
    if (!form.match_date) return toast.error("Informe a data da partida");
    // Só obrigatório em partidas novas — partidas antigas não têm horário
    // salvo e continuam editáveis sem ele.
    if (!editing && !form.kickoff_time) return toast.error("Informe o horário do jogo");
    save.mutate();
  };

  const setCell = (playerId: string, key: keyof StatRow, value: number | boolean | Position) =>
    setRows((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [key]: value } }));

  // Prévia do rateio enquanto o organizador digita os valores no formulário.
  const previaValores = {
    court_fee: form.court_fee === "" ? null : Number(form.court_fee),
    referee_fee: form.referee_fee === "" ? null : Number(form.referee_fee),
    keeper_fee: form.keeper_fee === "" ? null : Number(form.keeper_fee),
    line_slots: form.line_slots === "" ? null : Number(form.line_slots),
  };
  const previaCusto = teamCost(previaValores);
  const previaRateio = feePerPlayer(previaValores);

  const allMatches = data ?? [];
  const matches = allMatches.filter((m) => status === "todos" || m.status === status);
  const contagem: Record<Filtro, number> = {
    todos: allMatches.length,
    agendada: allMatches.filter((m) => m.status === "agendada").length,
    realizada: allMatches.filter((m) => m.status === "realizada").length,
    cancelada: allMatches.filter((m) => m.status === "cancelada").length,
  };
  const filtros: Filtro[] = ["todos", ...STATUSES];

  // Seções fixas: Agendadas, Realizadas e Canceladas (nessa ordem), filtradas
  // pela pílula ativa.
  const agendadas = matches.filter((m) => m.status === "agendada");
  const realizadas = matches.filter((m) => m.status === "realizada");
  const canceladas = matches.filter((m) => m.status === "cancelada");

  // "Quem vai" do próximo jogo: confirmados primeiro, depois a espera.
  const nomePorJogador = new Map((players ?? []).map((p) => [p.id, p.nickname || p.name] as const));
  const listaProximo = (presencasProximo ?? [])
    .filter((p) => p.status !== "ausente")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "confirmado" ? -1 : 1));
  const confirmadosProximo = listaProximo.filter((p) => p.status === "confirmado");
  const esperaProximo = listaProximo.length - confirmadosProximo.length;
  // Mesma conta da lista do diálogo: goleiro não ocupa vaga de linha.
  const linhaProximo = confirmadosProximo.filter((p) => p.position !== "goleiro").length;
  const mostrarQuemVai = !!proximoJogo && (status === "todos" || status === "agendada");

  // Jogadores do lançamento de estatísticas, agrupados por setor do campo.
  const playersByCategory = CATEGORIES.map((cat) => ({
    category: cat,
    players: jogadoresDaPartida.filter((p) => POSITION_CATEGORY[p.positions[0]] === cat),
  })).filter((g) => g.players.length > 0);

  // Só jogadores de linha ocupam vaga; o goleiro entra por fora.
  const confirmadosDeLinha = confirmados.filter((p) => p.position !== "goleiro").length;

  // Quem ainda não tem nenhuma linha de presença nesta partida — candidatos
  // pro editor confirmar em nome de alguém que avisou por fora do app.
  const jogadoresSemPresenca = activePlayers.filter(
    (p) => !(presences ?? []).some((pr) => pr.player_id === p.id),
  );
  const jogadorSelecionado = jogadoresSemPresenca.find((p) => p.id === jogadorParaAdicionar);

  const pagamento = useMutation({
    mutationFn: ({ playerId, pago }: { playerId: string; pago: boolean }) =>
      updatePaymentStatus(editing!.id, playerId, pago ? "pago" : "pendente"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["presences", editing?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Usada tanto pra "Promover" (espera -> confirmado) quanto pra "Cancelar"
  // (marca ausente em nome do jogador — a API já zera a posição nesse caso).
  const mudarStatus = useMutation({
    mutationFn: ({ playerId, status }: { playerId: string; status: Presence["status"] }) =>
      updatePresenceStatus(editing!.id, playerId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["presences", editing?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarPosicaoPresenca = useMutation({
    mutationFn: ({ playerId, position }: { playerId: string; position: Position }) =>
      updatePresencePosition(editing!.id, playerId, position),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["presences", editing?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removerPresenca = useMutation({
    mutationFn: (playerId: string) => deletePresence(editing!.id, playerId),
    onSuccess: () => {
      toast.success("Presença removida da lista");
      qc.invalidateQueries({ queryKey: ["presences", editing?.id] });
      setToRemoverPresenca(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Confirmar em nome de quem avisou por fora do app.
  const adicionarPresenca = useMutation({
    mutationFn: ({ playerId, position }: { playerId: string; position: Position }) =>
      confirmPresenceAsEditor(editing!.id, playerId, position),
    onSuccess: () => {
      toast.success("Presença confirmada");
      qc.invalidateQueries({ queryKey: ["presences", editing?.id] });
      setJogadorParaAdicionar("");
      setPosicaoParaAdicionar("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Calendário e resultados
          </p>
          <h1 className="text-3xl leading-tight">Partidas</h1>
        </div>
        {podeEditar && (
          <Button onClick={openNew} className="min-h-11 gap-2 rounded-[10px] px-5 font-extrabold">
            <Plus aria-hidden="true" className="h-[18px] w-[18px]" /> Nova partida
          </Button>
        )}
      </div>

      <div role="group" aria-label="Filtrar partidas" className="flex flex-wrap gap-2">
        {filtros.map((f) => {
          const ativo = status === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={ativo}
              onClick={() => setStatus(f)}
              className={cn(
                "min-h-10 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                ativo
                  ? "border-accent bg-accent font-bold text-accent-foreground"
                  : "bg-card font-medium text-foreground hover:bg-raised",
              )}
            >
              {f === "todos" ? "Todas" : STATUS_LABELS_PLURAL[f]} · {contagem[f]}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-2xl border bg-card px-5 py-10 text-center text-muted-foreground">
          {allMatches.length === 0
            ? "Nenhuma partida cadastrada ainda."
            : "Nenhuma partida com esse status."}
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-6">
            {agendadas.length > 0 && (
              <section aria-labelledby="sec-agendadas" className="flex flex-col gap-3">
                <h2 id="sec-agendadas" className="text-[15px] leading-tight">
                  Agendadas
                </h2>
                {agendadas.map((m) => {
                  const fee = feePerPlayer(m);
                  if (m.id === proximoJogo?.id) {
                    const slots = m.line_slots ?? 0;
                    const pct = slots ? Math.min(100, Math.round((linhaProximo / slots) * 100)) : 0;
                    return (
                      <article
                        key={m.id}
                        aria-label={`Próximo jogo: ${matchTitle(m)}`}
                        className="flex flex-col gap-4 rounded-2xl border border-accent bg-card p-5 md:p-6"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <StatusTag status={m.status} destaque />
                            <span className="text-sm text-muted-foreground">{dataHora(m)}</span>
                          </div>
                          <MatchActions
                            podeEditar={podeEditar}
                            onEdit={() => openEdit(m)}
                            onDelete={() => setToDelete(m)}
                          />
                        </div>
                        <h3 className="text-xl leading-tight">
                          Suprema Corte{" "}
                          <span aria-hidden="true" className="text-accent">
                            ×
                          </span>
                          <span className="sr-only">contra</span> {m.opponent}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={chipClass}>{localLabel(m)}</span>
                          <span className={chipClass}>{MANDO_LABELS[m.mando]}</span>
                          <span className={chipClass}>{tipoLabel(m)}</span>
                          <WeatherChip
                            match={m}
                            podeEditar={podeEditar}
                            refreshing={
                              refreshWeather.isPending && refreshWeather.variables === m.id
                            }
                            onRefresh={() => refreshWeather.mutate(m.id)}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-4 border-t pt-4">
                          <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-2">
                            <div className="flex flex-wrap justify-between gap-x-3 text-[13px] text-muted-foreground">
                              <span>Confirmados</span>
                              <span>
                                <strong className="text-foreground">
                                  {carregandoProximo ? "…" : linhaProximo}
                                </strong>
                                {slots ? ` / ${slots}` : ""}
                                {fee !== null && ` · ${formatMoney(fee)} por jogador`}
                              </span>
                            </div>
                            {slots > 0 && (
                              <div
                                role="img"
                                aria-label={`${linhaProximo} de ${slots} vagas preenchidas`}
                                className="h-2 overflow-hidden rounded bg-raised"
                              >
                                <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </div>
                          <Button
                            onClick={() => setConfirmando(m)}
                            className="min-h-11 gap-2 rounded-[10px] px-5 font-extrabold"
                          >
                            <UserCheck aria-hidden="true" className="h-4 w-4" />
                            Confirmar presença
                          </Button>
                        </div>
                      </article>
                    );
                  }
                  return (
                    <article
                      key={m.id}
                      aria-label={matchTitle(m)}
                      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border bg-card px-5 py-4 md:px-6"
                    >
                      <StatusTag status={m.status} />
                      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
                        <h3 className="text-sm leading-snug">Suprema Corte × {m.opponent}</h3>
                        <span className="text-[13px] text-muted-foreground">
                          {dataHora(m)} · {tipoLabel(m)} · {MANDO_LABELS[m.mando]} · {localLabel(m)}
                        </span>
                      </div>
                      <WeatherChip
                        match={m}
                        podeEditar={podeEditar}
                        refreshing={refreshWeather.isPending && refreshWeather.variables === m.id}
                        onRefresh={() => refreshWeather.mutate(m.id)}
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="outline"
                          onClick={() => setConfirmando(m)}
                          className="min-h-11 gap-2 rounded-[10px] bg-transparent"
                        >
                          <UserCheck aria-hidden="true" className="h-4 w-4" />
                          Confirmar presença
                        </Button>
                        <MatchActions
                          podeEditar={podeEditar}
                          onEdit={() => openEdit(m)}
                          onDelete={() => setToDelete(m)}
                        />
                      </div>
                    </article>
                  );
                })}
              </section>
            )}

            {realizadas.length > 0 && (
              <section aria-labelledby="sec-realizadas" className="flex flex-col gap-3">
                <h2 id="sec-realizadas" className="text-[15px] leading-tight">
                  Realizadas
                </h2>
                <ul className="rounded-2xl border bg-card px-5 py-1.5 md:px-6">
                  {realizadas.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t py-4 first:border-t-0"
                    >
                      <span className="inline-flex w-8 shrink-0 justify-center">
                        <ResultChip match={m} />
                      </span>
                      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                        <span className="text-[15px] font-semibold">{m.opponent}</span>
                        <span className="text-[13px] text-muted-foreground">
                          {formatDate(m.match_date)}
                          {m.kickoff_time && ` às ${m.kickoff_time.slice(0, 5)}`} · {tipoLabel(m)} ·{" "}
                          {MANDO_LABELS[m.mando]} · {localLabel(m)}
                        </span>
                      </div>
                      <WeatherChip
                        match={m}
                        podeEditar={podeEditar}
                        refreshing={refreshWeather.isPending && refreshWeather.variables === m.id}
                        onRefresh={() => refreshWeather.mutate(m.id)}
                      />
                      <span className="num w-16 text-right text-[28px] leading-none">
                        {m.goals_for ?? 0}–{m.goals_against ?? 0}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          onClick={() => openEdit(m)}
                          className="min-h-11 px-2.5 text-[13px] font-semibold text-primary"
                        >
                          Estatísticas
                          <span className="sr-only"> da partida contra {m.opponent}</span>
                        </Button>
                        {podeEditar && (
                          <MatchActions
                            podeEditar={podeEditar}
                            showEdit={false}
                            onEdit={() => openEdit(m)}
                            onDelete={() => setToDelete(m)}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {canceladas.length > 0 && (
              <section aria-labelledby="sec-canceladas" className="flex flex-col gap-3">
                <h2 id="sec-canceladas" className="text-[15px] leading-tight text-muted-foreground">
                  Canceladas
                </h2>
                <ul className="rounded-2xl border bg-card px-5 py-1.5 md:px-6">
                  {canceladas.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t py-3 first:border-t-0"
                    >
                      <StatusTag status={m.status} />
                      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                        <span className="text-sm font-medium text-muted-foreground">
                          Suprema Corte × {m.opponent}
                        </span>
                        <span className="text-[13px] text-muted-foreground">
                          {dataHora(m)} · {tipoLabel(m)} · {localLabel(m)}
                        </span>
                      </div>
                      <MatchActions
                        podeEditar={podeEditar}
                        onEdit={() => openEdit(m)}
                        onDelete={() => setToDelete(m)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {mostrarQuemVai && proximoJogo && (
            <aside
              aria-labelledby="quem-vai-titulo"
              className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-2xl border bg-card p-5 md:p-6"
            >
              <div>
                <h2 id="quem-vai-titulo" className="mb-1 text-[15px] leading-tight">
                  Quem vai · {formatDate(proximoJogo.match_date).slice(0, 5)}
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  {proximoJogo.opponent} · {confirmadosProximo.length}{" "}
                  {confirmadosProximo.length === 1 ? "confirmado" : "confirmados"}
                  {esperaProximo > 0 && `, ${esperaProximo} na espera`}
                </p>
              </div>
              {carregandoProximo ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : listaProximo.length === 0 ? (
                <p className="border-t pt-3 text-sm text-muted-foreground">
                  Ninguém confirmou ainda.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {listaProximo.map((pr) => {
                    const pago = pr.payment_status === "pago";
                    return (
                      <li key={pr.id} className="flex items-center gap-2.5 border-t py-2.5 text-sm">
                        <span className="min-w-0 flex-grow truncate font-semibold">
                          {nomePorJogador.get(pr.player_id) ?? "Jogador"}
                        </span>
                        {pr.status === "espera" && (
                          <span className="rounded-[5px] border border-accent px-1.5 py-0.5 text-xs font-bold">
                            Espera
                          </span>
                        )}
                        {pr.position && (
                          <span
                            title={POSITION_LABELS[pr.position]}
                            className="rounded-[5px] border px-1.5 py-0.5 text-xs font-bold text-muted-foreground"
                          >
                            {POSITION_ABBR[pr.position]}
                          </span>
                        )}
                        <span
                          className={cn(
                            "w-16 text-right text-xs font-bold",
                            pago ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          {pago ? "Pago" : "Pendente"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {podeEditar && (
                <p className="text-xs text-muted-foreground">
                  Gerencie presença e pagamento em{" "}
                  <button
                    type="button"
                    onClick={() => openEdit(proximoJogo)}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    editar partida.
                  </button>
                </p>
              )}
            </aside>
          )}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[52rem]">
          <DialogHeader>
            <DialogTitle>
              {!podeEditar ? "Ver partida" : editing ? "Editar partida" : "Nova partida"}
            </DialogTitle>
          </DialogHeader>

          <fieldset disabled={!podeEditar} className="contents">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="date">Data *</Label>
                <DatePicker
                  id="date"
                  value={form.match_date}
                  onChange={(v) => setForm({ ...form, match_date: v })}
                />
              </div>
              <div>
                <Label htmlFor="kickoff">Horário {!editing && "*"}</Label>
                <Input
                  id="kickoff"
                  type="time"
                  value={form.kickoff_time}
                  onChange={(e) => setForm({ ...form, kickoff_time: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Usado pra buscar a previsão do tempo.
                </p>
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
              <div className="sm:col-span-2">
                <Label className="mb-2 block">Vagas e rateio</Label>
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <Label htmlFor="slots" className="text-xs">
                        Jogadores de linha
                      </Label>
                      <NumberInput
                        id="slots"
                        value={form.line_slots}
                        onChange={(v) => setForm({ ...form, line_slots: v })}
                        min={MIN_LINE_SLOTS}
                        max={MAX_LINE_SLOTS}
                      />
                    </div>
                    <div>
                      <Label htmlFor="court" className="text-xs">
                        Quadra (R$)
                      </Label>
                      <NumberInput
                        id="court"
                        value={form.court_fee}
                        onChange={(v) => setForm({ ...form, court_fee: v })}
                        max={9999}
                        maxDigits={4}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ref" className="text-xs">
                        Arbitragem (R$)
                      </Label>
                      <NumberInput
                        id="ref"
                        value={form.referee_fee}
                        onChange={(v) => setForm({ ...form, referee_fee: v })}
                        max={9999}
                        maxDigits={4}
                      />
                    </div>
                    <div>
                      <Label htmlFor="keeper" className="text-xs">
                        Goleiro (R$)
                      </Label>
                      <NumberInput
                        id="keeper"
                        value={form.keeper_fee}
                        onChange={(v) => setForm({ ...form, keeper_fee: v })}
                        max={9999}
                        maxDigits={4}
                      />
                    </div>
                  </div>
                  {/* Quadra e arbitragem são rachadas com o adversário; o goleiro é só nosso. */}
                  <p className="text-xs text-muted-foreground">
                    Quadra e arbitragem entram pela metade (rachadas com o adversário); o goleiro
                    entra cheio.
                    {previaRateio !== null && (
                      <>
                        {" "}
                        Total do time:{" "}
                        <span className="font-medium text-foreground">
                          {formatMoney(previaCusto)}
                        </span>{" "}
                        ·{" "}
                        <span className="font-semibold text-primary">
                          {formatMoney(previaRateio)} por jogador
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {form.status === "realizada" && (
                <div className="sm:col-span-2">
                  <Label className="mb-2 block">Placar Final</Label>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                    <div>
                      <Label htmlFor="gf">Suprema Corte</Label>
                      <NumberInput
                        id="gf"
                        value={form.goals_for}
                        onChange={(v) => setForm({ ...form, goals_for: v })}
                        max={99}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ga">Adversário</Label>
                      <NumberInput
                        id="ga"
                        value={form.goals_against}
                        onChange={(v) => setForm({ ...form, goals_against: v })}
                        max={99}
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base leading-tight">Jogadores</h3>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">
                      Confirmados:{" "}
                      <span className="font-semibold text-foreground">{confirmadosDeLinha}</span>
                      {editing.line_slots ? ` / ${editing.line_slots}` : ""}
                    </span>
                    {feePerPlayer(editing) !== null && (
                      <span className="num text-xl text-primary">
                        {formatMoney(feePerPlayer(editing)!)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Pra quem avisou por fora do app (ligação, WhatsApp) ou ainda
                  não tem conta — o editor confirma em nome dele. */}
                {podeEditar && jogadoresSemPresenca.length > 0 && (
                  <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2.5">
                    <div className="min-w-40 flex-1">
                      <Label htmlFor="add-jogador" className="text-xs text-muted-foreground">
                        Confirmar em nome de
                      </Label>
                      <Select
                        value={jogadorParaAdicionar}
                        onValueChange={(v) => {
                          setJogadorParaAdicionar(v);
                          const jog = jogadoresSemPresenca.find((p) => p.id === v);
                          setPosicaoParaAdicionar(jog?.positions[0] ?? "");
                        }}
                      >
                        <SelectTrigger id="add-jogador" className="h-8">
                          <SelectValue placeholder="Escolher jogador..." />
                        </SelectTrigger>
                        <SelectContent>
                          {jogadoresSemPresenca.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nickname || p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {jogadorSelecionado && (
                      <div className="w-32">
                        <Label className="text-xs text-muted-foreground">Posição</Label>
                        <Select
                          value={posicaoParaAdicionar}
                          onValueChange={(v) => setPosicaoParaAdicionar(v as Position)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {jogadorSelecionado.positions.map((pos) => (
                              <SelectItem key={pos} value={pos}>
                                {POSITION_LABELS[pos]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <Button
                      size="sm"
                      className="h-8 gap-1"
                      disabled={
                        !jogadorParaAdicionar ||
                        !posicaoParaAdicionar ||
                        adicionarPresenca.isPending
                      }
                      onClick={() =>
                        jogadorParaAdicionar &&
                        posicaoParaAdicionar &&
                        adicionarPresenca.mutate({
                          playerId: jogadorParaAdicionar,
                          position: posicaoParaAdicionar,
                        })
                      }
                    >
                      {adicionarPresenca.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      Confirmar
                    </Button>
                  </div>
                )}

                {jogadoresDaPartida.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    {temPresenca
                      ? "Ninguém confirmado ainda — a lista aparece conforme o pessoal confirmar."
                      : "Nenhum jogador ativo cadastrado."}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-center text-xs uppercase text-muted-foreground">
                          <th className="px-1.5 py-2 text-left">Jogador</th>
                          <th className="px-1.5 py-2 text-left">Posição</th>
                          <th className="px-1.5 py-2">Confirmação</th>
                          <th className="px-1.5 py-2">Pagamento</th>
                          {editing.status === "realizada" && (
                            <>
                              <th className="px-1.5 py-2">Tit.</th>
                              <th className="px-1.5 py-2">Min</th>
                              <th className="px-1.5 py-2">Gols</th>
                              <th className="px-1.5 py-2">Assist.</th>
                              <th className="px-1.5 py-2">CA</th>
                              <th className="px-1.5 py-2">CV</th>
                              <th className="px-1.5 py-2">Def.</th>
                              <th className="px-1.5 py-2">GS</th>
                            </>
                          )}
                          <th className="px-1.5 py-2">Ações</th>
                        </tr>
                      </thead>
                      {playersByCategory.map((g) => (
                        <tbody key={g.category}>
                          <tr className="border-b bg-raised">
                            <td
                              colSpan={4 + (editing.status === "realizada" ? 8 : 0) + 1}
                              className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              {CATEGORY_LABELS[g.category]}
                            </td>
                          </tr>
                          {g.players.map((p) => {
                            const pr = presencaPorJogador.get(p.id);
                            const r = rows[p.id] ?? emptyStat;
                            const gk = p.positions.includes("goleiro");
                            const pago = pr?.payment_status === "pago";
                            const mostrarStats =
                              editing.status === "realizada" &&
                              (!temPresenca || pr?.status === "confirmado");
                            const salvandoLinha =
                              (pagamento.isPending && pagamento.variables?.playerId === p.id) ||
                              (mudarStatus.isPending && mudarStatus.variables?.playerId === p.id) ||
                              (mudarPosicaoPresenca.isPending &&
                                mudarPosicaoPresenca.variables?.playerId === p.id) ||
                              (removerPresenca.isPending && removerPresenca.variables === p.id) ||
                              (adicionarPresenca.isPending &&
                                adicionarPresenca.variables?.playerId === p.id);
                            const num = (key: keyof StatRow) => (
                              <NumberInput
                                className="mx-auto w-16"
                                inputClassName="h-8 text-center"
                                max={999}
                                value={String(r[key] ?? 0)}
                                onChange={(v) => setCell(p.id, key, Number(v) || 0)}
                              />
                            );

                            return (
                              <tr key={p.id} className="border-b last:border-0">
                                <td className="whitespace-nowrap px-1.5 py-1.5 text-left font-medium">
                                  {p.nickname || p.name}
                                </td>

                                <td className="px-1.5 py-1.5">
                                  {pr?.position ? (
                                    podeEditar && p.positions.length > 1 ? (
                                      <Select
                                        value={pr.position}
                                        onValueChange={(v) =>
                                          mudarPosicaoPresenca.mutate({
                                            playerId: p.id,
                                            position: v as Position,
                                          })
                                        }
                                      >
                                        <SelectTrigger className="h-auto w-auto gap-1 border-0 bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {p.positions.map((pos) => (
                                            <SelectItem key={pos} value={pos}>
                                              <Badge
                                                variant="secondary"
                                                className="font-normal"
                                                title={POSITION_LABELS[pos]}
                                              >
                                                {POSITION_ABBR[pos]}
                                              </Badge>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <div className="flex justify-start">
                                        <Badge
                                          variant="secondary"
                                          className="font-normal"
                                          title={POSITION_LABELS[pr.position]}
                                        >
                                          {POSITION_ABBR[pr.position]}
                                        </Badge>
                                      </div>
                                    )
                                  ) : !temPresenca ? (
                                    // Partida sem presença registrada (anterior a esta
                                    // feature): posição vem do lançamento de estatística.
                                    podeEditar && p.positions.length > 1 ? (
                                      <Select
                                        value={r.position ?? p.positions[0]}
                                        onValueChange={(v) =>
                                          setCell(p.id, "position", v as Position)
                                        }
                                      >
                                        <SelectTrigger className="h-auto w-auto gap-1 border-0 bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {p.positions.map((pos) => (
                                            <SelectItem key={pos} value={pos}>
                                              <Badge
                                                variant="secondary"
                                                className="font-normal"
                                                title={POSITION_LABELS[pos]}
                                              >
                                                {POSITION_ABBR[pos]}
                                              </Badge>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <div className="flex justify-start">
                                        <Badge
                                          variant="secondary"
                                          className="font-normal"
                                          title={POSITION_LABELS[r.position ?? p.positions[0]]}
                                        >
                                          {POSITION_ABBR[r.position ?? p.positions[0]]}
                                        </Badge>
                                      </div>
                                    )
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>

                                <td className="px-1.5 py-1.5 text-center">
                                  {pr ? (
                                    <PresenceBadge status={pr.status} />
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>

                                <td className="px-1.5 py-1.5 text-center">
                                  {pr && pr.status !== "ausente" ? (
                                    podeEditar ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={salvandoLinha}
                                        onClick={() =>
                                          pagamento.mutate({ playerId: p.id, pago: !pago })
                                        }
                                        className={cn(
                                          "h-7 gap-1",
                                          pago
                                            ? "border-accent font-semibold text-primary"
                                            : "border-warn-border bg-warn text-warn-foreground hover:bg-warn/80",
                                        )}
                                      >
                                        {salvandoLinha && (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        )}
                                        {pago ? "Pago" : "Pendente"}
                                      </Button>
                                    ) : (
                                      <Badge
                                        className={cn(
                                          pago
                                            ? "border-accent bg-transparent text-primary hover:bg-transparent"
                                            : "border-warn-border bg-warn text-warn-foreground hover:bg-warn",
                                        )}
                                      >
                                        {pago ? "Pago" : "Pendente"}
                                      </Badge>
                                    )
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>

                                {editing.status === "realizada" &&
                                  (mostrarStats ? (
                                    <>
                                      <td className="px-1.5 py-1.5">
                                        <div className="flex justify-center">
                                          <Checkbox
                                            checked={r.starter}
                                            onCheckedChange={(v) =>
                                              setCell(p.id, "starter", v === true)
                                            }
                                          />
                                        </div>
                                      </td>
                                      <td className="px-1.5 py-1.5">{num("minutes")}</td>
                                      <td className="px-1.5 py-1.5">{num("goals")}</td>
                                      <td className="px-1.5 py-1.5">{num("assists")}</td>
                                      <td className="px-1.5 py-1.5">{num("yellow_cards")}</td>
                                      <td className="px-1.5 py-1.5">{num("red_cards")}</td>
                                      <td className="px-1.5 py-1.5 text-center">
                                        {gk ? (
                                          num("saves")
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      <td className="px-1.5 py-1.5 text-center">
                                        {gk ? (
                                          num("goals_conceded")
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                    </>
                                  ) : (
                                    <td
                                      colSpan={8}
                                      className="px-1.5 py-1.5 text-center text-xs text-muted-foreground"
                                    >
                                      {pr?.status === "espera"
                                        ? "Na lista de espera"
                                        : pr?.status === "ausente"
                                          ? "Não vai"
                                          : "Não jogou"}
                                    </td>
                                  ))}

                                <td className="px-1.5 py-1.5">
                                  <div className="flex flex-wrap items-center justify-center gap-1">
                                    {podeEditar && pr?.status === "espera" && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7"
                                        disabled={salvandoLinha}
                                        onClick={() =>
                                          mudarStatus.mutate({
                                            playerId: p.id,
                                            status: "confirmado",
                                          })
                                        }
                                      >
                                        Promover
                                      </Button>
                                    )}

                                    {podeEditar && pr && pr.status !== "ausente" && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        title="Cancelar presença (marca como não vai)"
                                        aria-label={`Cancelar presença de ${p.nickname || p.name}`}
                                        disabled={salvandoLinha}
                                        onClick={() =>
                                          mudarStatus.mutate({ playerId: p.id, status: "ausente" })
                                        }
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    )}

                                    {podeEditar && pr?.status === "ausente" && (
                                      <div className="flex items-center gap-1">
                                        <Select
                                          value={posicaoReversao[p.id] ?? p.positions[0]}
                                          onValueChange={(v) =>
                                            setPosicaoReversao((prev) => ({
                                              ...prev,
                                              [p.id]: v as Position,
                                            }))
                                          }
                                        >
                                          <SelectTrigger className="h-7 w-[4.5rem] text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {p.positions.map((pos) => (
                                              <SelectItem key={pos} value={pos}>
                                                {POSITION_ABBR[pos]}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7"
                                          title="Reverter — confirmar de novo"
                                          aria-label={`Confirmar ${p.nickname || p.name} de novo`}
                                          disabled={salvandoLinha}
                                          onClick={() =>
                                            adicionarPresenca.mutate({
                                              playerId: p.id,
                                              position: posicaoReversao[p.id] ?? p.positions[0],
                                            })
                                          }
                                        >
                                          <UserCheck className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    )}

                                    {podeEditar && pr && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        title="Retirar da lista"
                                        aria-label={`Retirar ${p.nickname || p.name} da lista`}
                                        disabled={salvandoLinha}
                                        onClick={() => setToRemoverPresenca(pr)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      ))}
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

      {confirmando && (
        <ConfirmarPresenca
          match={confirmando}
          player={meuJogador}
          current={minhaPresenca}
          open={!!confirmando}
          onOpenChange={(aberto) => !aberto && setConfirmando(null)}
        />
      )}

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

      <AlertDialog
        open={!!toRemoverPresenca}
        onOpenChange={(o) => !o && setToRemoverPresenca(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirar {nomeParaRemover} da lista?</AlertDialogTitle>
            <AlertDialogDescription>
              A presença é apagada por completo, como se ele nunca tivesse respondido. Se ele quiser
              voltar, precisa confirmar de novo pelo próprio card da partida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                toRemoverPresenca && removerPresenca.mutate(toRemoverPresenca.player_id)
              }
            >
              Retirar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
