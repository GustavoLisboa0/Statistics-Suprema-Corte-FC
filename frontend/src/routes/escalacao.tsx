import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ClipboardList,
  Download,
  Loader2,
  RefreshCw,
  Save,
  Shuffle,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { isAutenticado } from "@/lib/auth";
import { useUsuario } from "@/lib/useUsuario";
import { fetchMatches, formatDate, matchTitle, VENUE_LABELS, type Match } from "@/lib/football";
import {
  FUNCAO_LABELS,
  FUNCOES,
  siglaPosicao,
  escalacaoDaJanela,
  fetchConvocados,
  fetchEscalacaoSalva,
  gerarEscalacao,
  salvarEscalacao,
  type Convocado,
  type EscalacaoSalva,
  type Funcao,
  type GerarPayload,
  type OpcaoDeTrocas,
  type PreviaEscalacao,
  type RegraComposicao,
  type RegraJogador,
  type Restricao,
  type ResultadoEscalacao,
  avaliarGrupos,
  quemJogaTudo,
  type GrupoDeFixos,
} from "@/lib/escalacao";
import { exportarEscalacaoPdf } from "@/lib/escalacaoPdf";
import { CampoEscalacao } from "@/components/CampoEscalacao";
import { AbaTatica } from "@/components/EscalacaoInterna";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuemJogaTudo } from "@/components/QuemJogaTudo";
import {
  Aba,
  AjudaSistema,
  CLASSE_CHAVE,
  FormacaoDoJogo,
  ListaDeAbas,
  type MudancaFormacaoForm,
} from "@/components/EscalacaoControles";
import { NumberInput } from "@/components/NumberInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/escalacao")({
  ssr: false, // depende da sessão do navegador (ver comentário em routes/index.tsx)
  beforeLoad: () => {
    if (!isAutenticado()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [{ title: "Escalação — Suprema Corte FC" }],
  }),
  component: EscalacaoPage,
});

/** Cartão/seção padrão da tela. */
const SECAO = "rounded-2xl border bg-card p-5 md:p-6";
/** Título de seção (Orbitron é larga: tamanho pequeno). */
const TITULO_SECAO = "text-[15px] leading-tight";

const ROTULO_JOGO: Record<Match["status"], string> = {
  agendada: "Jogo agendado",
  realizada: "Jogo realizado",
  cancelada: "Jogo cancelado",
};

// ---------------------------------------------------------------------------
// Página: título + escolha do jogo
// ---------------------------------------------------------------------------
function EscalacaoPage() {
  const usuario = useUsuario();
  const podeEditar = usuario?.papel === "editor";
  const [partidaId, setPartidaId] = useState("");

  const { data: partidas, isLoading } = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });

  // Jogo inicial: o próximo agendado (a lista já vem ordenada por proximidade).
  useEffect(() => {
    if (!partidaId && partidas?.length) {
      setPartidaId((partidas.find((p) => p.status === "agendada") ?? partidas[0]).id);
    }
  }, [partidas, partidaId]);

  const partida = partidas?.find((p) => p.id === partidaId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {partida
              ? `${ROTULO_JOGO[partida.status] ?? "Jogo"} · ${partida.opponent} · ${formatDate(partida.match_date)}`
              : "Montagem do time"}
          </p>
          <h1 className="text-3xl leading-tight">Escalação</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {podeEditar
              ? "Escolha o jogo e o sistema divide os minutos e as trocas para você."
              : "Veja a escalação montada para cada jogo."}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {isLoading ? (
            <Skeleton className="h-11 w-full rounded-[10px] sm:w-72" />
          ) : !partidas?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma partida cadastrada ainda.</p>
          ) : (
            <Select value={partidaId} onValueChange={setPartidaId}>
              <SelectTrigger className="h-11 w-full sm:w-72" aria-label="Jogo">
                <SelectValue placeholder="Selecione o jogo" />
              </SelectTrigger>
              <SelectContent>
                {partidas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {formatDate(p.match_date)} — {p.opponent}
                    {p.status !== "agendada" ? ` (${p.status})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {podeEditar && <AjudaSistema />}
        </div>
      </div>

      {partida &&
        (podeEditar ? (
          <PainelAdmin key={partida.id} partida={partida} />
        ) : (
          <PainelVisualizacao key={partida.id} partida={partida} />
        ))}
    </div>
  );
}

function tituloDoJogo(partida: Match) {
  const hora = partida.kickoff_time ? ` · ${partida.kickoff_time.slice(0, 5)}` : "";
  return {
    titulo: matchTitle({ opponent: partida.opponent }),
    subtitulo: `${formatDate(partida.match_date)} · ${VENUE_LABELS[partida.venue]}${hora}`,
  };
}

// ---------------------------------------------------------------------------
// Usuário comum: só vê a escalação salva
// ---------------------------------------------------------------------------
function PainelVisualizacao({ partida }: { partida: Match }) {
  const { data: salva, isLoading } = useQuery({
    queryKey: ["escalacao", partida.id],
    queryFn: () => fetchEscalacaoSalva(partida.id),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!salva) {
    return (
      <div className={cn(SECAO, "flex items-center gap-3 text-sm text-muted-foreground")}>
        <ClipboardList className="h-5 w-5 shrink-0" aria-hidden="true" />A escalação deste jogo
        ainda não foi divulgada.
      </div>
    );
  }
  return <VisaoEscalacao resultado={salva.resultado} partida={partida} />;
}

// ---------------------------------------------------------------------------
// Visão da escalação (campinho, banco, trocas, minutos) — admin e usuário
// ---------------------------------------------------------------------------
const VisaoEscalacao = memo(function VisaoEscalacao({
  resultado,
  partida,
  acoes,
}: {
  resultado: ResultadoEscalacao;
  partida: Match;
  acoes?: React.ReactNode;
}) {
  const [indice, setIndice] = useState(0);
  const idx = Math.min(indice, resultado.janelas.length - 1);
  const { janela, banco } = escalacaoDaJanela(resultado, idx);

  const quemEntrou = useMemo(
    () => new Set(resultado.trocas.filter((t) => t.minuto === janela.inicio).map((t) => t.entra)),
    [resultado.trocas, janela.inicio],
  );

  const pdf = async () => {
    try {
      await exportarEscalacaoPdf({ ...tituloDoJogo(partida), resultado });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  // O goleiro joga o jogo todo e não tem troca: fica fora desta lista.
  const minutosOrdenados = Object.entries(resultado.minutos)
    .filter(([id]) => {
      const pos = resultado.jogadores[id]?.posicoes ?? [];
      return id !== resultado.goleiro_id && !(pos.length > 0 && pos.every((x) => x === "goleiro"));
    })
    .map(([id, minutos]) => ({ id, minutos, nome: resultado.jogadores[id]?.nome ?? id }))
    .sort((a, b) => b.minutos - a.minutos || a.nome.localeCompare(b.nome));

  // Trocas agrupadas por minuto (linha do tempo).
  const trocasPorMinuto = useMemo(() => {
    const grupos = new Map<number, ResultadoEscalacao["trocas"]>();
    for (const t of resultado.trocas) {
      const lista = grupos.get(t.minuto) ?? [];
      lista.push(t);
      grupos.set(t.minuto, lista);
    }
    return [...grupos.entries()];
  }, [resultado.trocas]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className={TITULO_SECAO}>Escalação {resultado.formacao}</h2>
          {resultado.mudancas_formacao && resultado.mudancas_formacao.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {resultado.mudancas_formacao.map((m) => `→ ${m.formacao} aos ${m.minuto}'`).join(" ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11 rounded-[10px] bg-card" onClick={pdf}>
            <Download aria-hidden="true" /> Baixar PDF
          </Button>
          {acoes}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <section aria-label="Campo" className={cn(SECAO, "space-y-4")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={TITULO_SECAO}>Momento do jogo</h3>
            <span className="num text-xl text-primary">
              {janela.formacao ?? resultado.formacao}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Momento do jogo">
            {resultado.janelas.map((j, i) => (
              <button
                key={j.inicio}
                type="button"
                role="tab"
                aria-selected={i === idx}
                onClick={() => setIndice(i)}
                className={cn(
                  "min-h-11 min-w-16 rounded-[10px] border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === idx
                    ? "border-accent bg-accent font-extrabold text-accent-foreground"
                    : "bg-card font-semibold hover:border-accent",
                )}
              >
                {j.inicio}'–{j.fim}'
                {j.formacao && j.formacao !== resultado.formacao ? ` · ${j.formacao}` : ""}
              </button>
            ))}
          </div>
          <CampoEscalacao
            lugares={janela.lugares}
            formacao={janela.formacao ?? resultado.formacao}
            jogadores={resultado.jogadores}
            destaque={quemEntrou}
            className="mx-auto block w-full max-w-sm"
          />
          {quemEntrou.size > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Contorno dourado: quem acabou de entrar.
            </p>
          )}
        </section>

        <div className="min-w-0 space-y-6">
          <section aria-label="Banco neste momento" className={cn(SECAO, "space-y-3")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className={TITULO_SECAO}>Banco neste momento</h3>
              <span className="text-[13px] text-muted-foreground">
                {banco.length} {banco.length === 1 ? "reserva" : "reservas"}
              </span>
            </div>
            {banco.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem reservas.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {banco.map((id) => (
                  <li
                    key={id}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-raised px-3 py-1 text-sm font-medium"
                  >
                    {resultado.jogadores[id].numero_camisa != null && (
                      <span className="num text-base text-primary">
                        {resultado.jogadores[id].numero_camisa}
                      </span>
                    )}
                    {resultado.jogadores[id].nome}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Substituições" className={cn(SECAO, "space-y-4")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className={TITULO_SECAO}>Substituições</h3>
              <span className="text-[13px] text-muted-foreground">
                {trocasPorMinuto.length} {trocasPorMinuto.length === 1 ? "momento" : "momentos"} ·{" "}
                {resultado.trocas.length} {resultado.trocas.length === 1 ? "troca" : "trocas"} ·
                jogo de {resultado.duracao} min
              </span>
            </div>
            {trocasPorMinuto.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem substituições.</p>
            ) : (
              <ol className="space-y-2.5" aria-label="Linha do tempo das trocas">
                {trocasPorMinuto.map(([minuto, lista]) => (
                  <li
                    key={minuto}
                    className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-xl border bg-raised px-4 py-3.5"
                  >
                    <span className="num min-w-14 text-3xl text-primary">{minuto}'</span>
                    <ul className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 text-sm">
                      {lista.map((t, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <span>
                            <strong className="text-primary">Entra</strong> {t.entra_nome}
                          </span>
                          <span className="text-muted-foreground">
                            <strong>Sai</strong> {t.sai_nome}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {FUNCAO_LABELS[t.funcao]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
            {resultado.ajustes_de_posicao.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {resultado.ajustes_de_posicao.map((a, i) => (
                  <li key={i}>
                    <span className="num text-sm text-foreground">{a.minuto}'</span> · {a.nome} muda
                    de {FUNCAO_LABELS[a.de]} para {FUNCAO_LABELS[a.para]}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section aria-label="Minutos por jogador" className={cn(SECAO, "space-y-4")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={TITULO_SECAO}>Minutos por jogador</h3>
          <span className="text-[13px] text-muted-foreground">Goleiro fora do rodízio</span>
        </div>
        <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {minutosOrdenados.map((m) => (
            <li key={m.id} className="flex items-center gap-3 text-sm">
              <span className="w-28 truncate font-medium">{m.nome}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(m.minutos / resultado.duracao) * 100}%` }}
                />
              </div>
              <span className="num w-10 text-right text-lg">{m.minutos}'</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
function limparRegras(regras: Record<string, RegraJogador>, ids: Set<string>) {
  const saida: Record<string, RegraJogador> = {};
  for (const [id, r] of Object.entries(regras)) {
    if (!ids.has(id)) continue;
    const limpa: RegraJogador = {};
    if (r.minutos_max) limpa.minutos_max = r.minutos_max;
    if (r.so_segundo_tempo) limpa.so_segundo_tempo = true;
    if (r.comeca) limpa.comeca = r.comeca;
    if (r.nao_sai) limpa.nao_sai = true;
    if (r.grupo_fixo) limpa.grupo_fixo = true;
    if (Object.keys(limpa).length) saida[id] = limpa;
  }
  return saida;
}

function PainelAdmin({ partida }: { partida: Match }) {
  const qc = useQueryClient();

  const { data: convocadosApi, isLoading: carregandoConvocados } = useQuery({
    queryKey: ["escalacao-convocados", partida.id],
    queryFn: () => fetchConvocados(partida.id),
  });
  const { data: salva, isLoading: carregandoSalva } = useQuery({
    queryKey: ["escalacao", partida.id],
    queryFn: () => fetchEscalacaoSalva(partida.id),
  });

  if (carregandoConvocados || carregandoSalva || !convocadosApi) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }
  return (
    <FormularioAdmin
      partida={partida}
      convocadosApi={convocadosApi}
      salva={salva ?? null}
      aoSalvar={() => qc.invalidateQueries({ queryKey: ["escalacao", partida.id] })}
    />
  );
}

/** Quanto o time joga de verdade: diferença entre quem mais e quem menos joga (sem goleiro e sem fixos). */
function diferencaDeMinutos(res: ResultadoEscalacao, fixos: string[]) {
  const valores = Object.entries(res.minutos)
    .filter(([id]) => id !== res.goleiro_id && !fixos.includes(id))
    .map(([, m]) => m);
  return valores.length ? Math.max(...valores) - Math.min(...valores) : 0;
}

/** Legendinha com a posição principal do jogador (a segunda, se houver, vai no balãozinho). */
function Sigla({ posicoes }: { posicoes: string[] }) {
  const sigla = siglaPosicao(posicoes);
  if (!sigla) return null;
  return (
    <span
      title={posicoes.map((p) => p.replace(/_/g, " ")).join(" / ")}
      className="ml-1.5 rounded-[5px] border px-1.5 py-px align-middle text-[11px] font-bold uppercase text-muted-foreground"
    >
      {sigla}
    </span>
  );
}

function tituloDaOpcao(o: OpcaoDeTrocas): string {
  if (o.tipo === "formacao") {
    const m = o.mudancas_formacao[0];
    return m ? `Muda de formação aos ${m.minuto}'` : "Muda de formação";
  }
  // Se alguém joga o jogo todo, não é "todo mundo igual": diz quantos jogam o jogo todo.
  const n = Math.max(quemJogaTudo(o.resultado).length, o.tipo === "fixos" ? o.quantos_fixos : 0);
  if (n > 0) return n === 1 ? "1 jogador joga o jogo todo" : `${n} jogadores jogam o jogo todo`;
  return o.aceitavel ? "Todo mundo joga o mesmo tempo" : "Tentativa de tempo igual";
}

const OpcoesDeTempo = memo(function OpcoesDeTempo({
  opcoes,
  selecionada,
  aoEscolher,
  aoTrocarFixo,
  avaliar,
  linha,
  refazendo,
}: {
  opcoes: OpcaoDeTrocas[];
  selecionada: number;
  aoEscolher: (i: number) => void;
  aoTrocarFixo: (indice: number, fixos: string[]) => void;
  avaliar: (quantos: number) => Promise<GrupoDeFixos[]>;
  linha: Convocado[];
  refazendo: boolean;
}) {
  const [escolhendo, setEscolhendo] = useState<number | null>(null);
  const [soEsses, setSoEsses] = useState<number | null>(null);
  return (
    <section aria-label="Como dividir o tempo" className={cn(SECAO, "space-y-4")}>
      <div>
        <h2 className={TITULO_SECAO}>Como dividir o tempo?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O sistema comparou jeitos de fazer as trocas. Só aparecem os que funcionam. Escolha um — a
          escalação abaixo muda junto.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {opcoes.map((o, i) => {
          const ativa = i === selecionada;
          return (
            <div
              key={`${o.tipo}-${o.quantos_fixos}-${i}`}
              className={cn(
                "rounded-xl border-2 p-4 transition-colors",
                ativa ? "border-accent bg-accent/10" : "bg-raised hover:border-accent/60",
              )}
            >
              <button
                type="button"
                onClick={() => aoEscolher(i)}
                aria-pressed={ativa}
                className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block text-base font-bold leading-snug">{tituloDaOpcao(o)}</span>
                <span className="mt-1 block text-sm">
                  <strong>{o.momentos}</strong> momento{o.momentos === 1 ? "" : "s"} de troca ·{" "}
                  <strong>{o.trocas}</strong> substituições
                </span>
                {o.tipo === "formacao" && o.mudancas_formacao[0] && (
                  <span className="block text-xs">
                    {o.mudancas_formacao[0].formacao}: ajuda a igualar o tempo
                  </span>
                )}
                <span
                  className={cn(
                    "block text-xs",
                    o.aceitavel ? "text-muted-foreground" : "font-semibold text-destructive",
                  )}
                >
                  {o.diferenca_minutos === 0
                    ? "Todos jogam exatamente o mesmo tempo"
                    : `Diferença de tempo: até ${o.diferenca_minutos} min`}
                  {!o.aceitavel && " — grande demais, não recomendado"}
                </span>
              </button>
              {(() => {
                const todos = quemJogaTudo(o.resultado);
                if (todos.length === 0) return null;
                return (
                  <p className="mt-2 text-xs">
                    <span className="text-muted-foreground">
                      {todos.length === 1 ? "Joga o jogo todo: " : "Jogam o jogo todo: "}
                    </span>
                    <strong>
                      {todos.map((id) => o.resultado.jogadores[id]?.nome ?? id).join(", ")}
                    </strong>
                  </p>
                );
              })()}
              {o.tipo === "igual" && quemJogaTudo(o.resultado).length > 0 && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-[10px] bg-card"
                    onClick={() => setSoEsses(i)}
                  >
                    Escolher quem joga o jogo todo
                  </Button>
                </div>
              )}
              {o.tipo === "fixos" && o.fixos.length > 0 && (
                <div className="mt-3 space-y-1">
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-[10px] bg-card"
                    disabled={refazendo}
                    onClick={() => setEscolhendo(i)}
                  >
                    Escolher quem joga o jogo todo
                  </Button>
                  {refazendo && ativa && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Refazendo as
                      trocas…
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {soEsses !== null && opcoes[soEsses] && (
        <Dialog open onOpenChange={(v) => !v && setSoEsses(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Quem joga o jogo todo</DialogTitle>
              <DialogDescription>
                Nesta opção só{" "}
                {quemJogaTudo(opcoes[soEsses].resultado)
                  .map((id) => opcoes[soEsses].resultado.jogadores[id]?.nome ?? id)
                  .join(", ")}{" "}
                {quemJogaTudo(opcoes[soEsses].resultado).length === 1 ? "joga" : "jogam"} o jogo
                todo. Não há outra escolha válida aqui: as outras passam de 5 minutos de diferença
                ou não são possíveis pela organização do time. Veja as outras opções.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}
      {escolhendo !== null && opcoes[escolhendo] && (
        <QuemJogaTudo
          quantos={opcoes[escolhendo].fixos.length}
          atuais={opcoes[escolhendo].fixos}
          tambem={quemJogaTudo(opcoes[escolhendo].resultado)
            .filter((id) => !opcoes[escolhendo].fixos.includes(id))
            .map((id) => opcoes[escolhendo].resultado.jogadores[id]?.nome ?? id)}
          linha={linha}
          carregar={() => avaliar(opcoes[escolhendo].fixos.length)}
          aoEscolher={(ids) => {
            aoEscolher(escolhendo);
            aoTrocarFixo(escolhendo, ids);
          }}
          aoFechar={() => setEscolhendo(null)}
        />
      )}
    </section>
  );
});

function FormularioAdmin({
  partida,
  convocadosApi,
  salva,
  aoSalvar,
}: {
  partida: Match;
  convocadosApi: Awaited<ReturnType<typeof fetchConvocados>>;
  salva: EscalacaoSalva | null;
  aoSalvar: () => void;
}) {
  const cfg = salva?.config;
  const [incluir, setIncluir] = useState<Set<string>>(new Set(cfg?.incluir ?? []));
  const [remover, setRemover] = useState<Set<string>>(new Set(cfg?.remover ?? []));
  const [goleiroId, setGoleiroId] = useState(cfg?.goleiro_id ?? "");
  const [duracao, setDuracao] = useState(String(cfg?.duracao ?? 90));
  const [automatico, setAutomatico] = useState(cfg?.automatico ?? true);
  const [formacao, setFormacao] = useState(cfg?.formacao ?? "4-4-2");
  const [mudancasForm, setMudancasForm] = useState<MudancaFormacaoForm[]>(
    (cfg?.mudancas_formacao ?? []).map((m) => ({ minuto: String(m.minuto), formacao: m.formacao })),
  );
  const [composicao, setComposicao] = useState<RegraComposicao[]>(cfg?.composicao ?? []);
  const [nSubs, setNSubs] = useState(String(cfg?.n_substituicoes ?? 5));
  const [trocas, setTrocas] = useState(String(cfg?.trocas_por_vez ?? 2));
  const [regras, setRegras] = useState<Record<string, RegraJogador>>(cfg?.regras ?? {});
  const [restricoes, setRestricoes] = useState<Restricao[]>(cfg?.restricoes ?? []);
  const [semente, setSemente] = useState(cfg?.semente ?? 0);
  const [previa, setPrevia] = useState<PreviaEscalacao | null>(
    salva
      ? {
          partida_id: partida.id,
          convocados: [],
          config: salva.config,
          resultado: salva.resultado,
        }
      : null,
  );
  const [opcaoSel, setOpcaoSel] = useState(0);
  const [mostrarAvancado, setMostrarAvancado] = useState(false);
  const [mostrarAjuste, setMostrarAjuste] = useState(false);
  const [novaRestricao, setNovaRestricao] = useState<{ jogador: string; tipo: string }>({
    jogador: "",
    tipo: "comeca_dentro",
  });

  // Lista de convocados efetiva = padrão (presença) − removidos + incluídos.
  const todosPorId = useMemo(() => {
    const mapa = new Map<string, Convocado>();
    for (const j of [
      ...convocadosApi.convocados,
      ...convocadosApi.bloqueados,
      ...convocadosApi.outros_ativos,
    ])
      mapa.set(j.id, j);
    return mapa;
  }, [convocadosApi]);

  const elenco = useMemo(() => {
    const ids = [
      ...convocadosApi.convocados.map((j) => j.id).filter((id) => !remover.has(id)),
      ...[...incluir],
    ];
    return ids.map((id) => todosPorId.get(id)!).filter(Boolean);
  }, [convocadosApi, remover, incluir, todosPorId]);

  // Goleiro: sugere o primeiro com posição de goleiro; refaz se o escolhido saiu da lista.
  useEffect(() => {
    if (elenco.some((j) => j.id === goleiroId)) return;
    const sugerido = elenco.find((j) => j.posicoes.includes("goleiro")) ?? elenco[0];
    setGoleiroId(sugerido?.id ?? "");
  }, [elenco, goleiroId]);

  const alternarPadrao = (id: string) =>
    setRemover((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  const alternarExtra = (id: string, marcado: boolean) =>
    setIncluir((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  const mudarRegra = (id: string, mudanca: Partial<RegraJogador>) =>
    setRegras((atual) => ({ ...atual, [id]: { ...atual[id], ...mudanca } }));

  const montarPayload = (
    sementeUsada: number,
    restr: Restricao[],
    opcoes?: {
      comparar?: boolean;
      fixos?: string[];
      mudancas?: { minuto: number; formacao: string }[];
    },
  ): GerarPayload => {
    const regrasBase = limparRegras(regras, new Set(elenco.map((j) => j.id)));
    for (const id of opcoes?.fixos ?? []) regrasBase[id] = { ...regrasBase[id], grupo_fixo: true };
    return {
      goleiro_id: goleiroId,
      incluir: [...incluir],
      remover: [...remover],
      duracao: Number(duracao) || 90,
      automatico,
      tatica: null,
      estrategia: "uniforme",
      forca_tatica: 100,
      formacao,
      mudancas_formacao:
        opcoes?.mudancas ??
        mudancasForm
          .filter((m) => Number(m.minuto) > 0)
          .map((m) => ({ minuto: Number(m.minuto), formacao: m.formacao })),
      composicao,
      // O computador decide as trocas sozinho: tempo quase igual (até 1 min de diferença).
      intervalo_minimo: 3,
      tolerancia_minutos: 1,
      max_momentos: null,
      max_trocas_por_vez: null,
      quantos_fixos: 0,
      comparar_opcoes: opcoes?.comparar ?? false,
      n_substituicoes: Number(nSubs) || 0,
      trocas_por_vez: Number(trocas) || 1,
      regras: regrasBase,
      restricoes: restr,
      semente: sementeUsada,
    };
  };

  const gerar = useMutation({
    mutationFn: (p: GerarPayload) => gerarEscalacao(partida.id, p),
    onSuccess: (resposta) => {
      cacheGrupos.current.clear();
      setPrevia(resposta);
      setOpcaoSel((atual) => {
        const antiga = previa?.opcoes?.[atual];
        const achada =
          resposta.opcoes?.findIndex(
            (o) => o.tipo === antiga?.tipo && o.quantos_fixos === antiga?.quantos_fixos,
          ) ?? -1;
        return achada >= 0 ? achada : 0;
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Trocar quem joga o jogo todo dentro de uma opção.
  const trocarFixo = useMutation({
    mutationFn: async ({ indice, fixos }: { indice: number; fixos: string[] }) => ({
      indice,
      fixos,
      resposta: await gerarEscalacao(
        partida.id,
        montarPayload(semente, restricoes, { fixos, comparar: false }),
      ),
    }),
    onSuccess: ({ indice, fixos, resposta }) => {
      setPrevia((p) => {
        if (!p?.opcoes) return p;
        const opcoes = p.opcoes.map((o, i) =>
          i === indice
            ? {
                ...o,
                fixos,
                fixos_nomes: fixos.map((f) => resposta.resultado.jogadores[f]?.nome ?? f),
                momentos: resposta.resultado.janelas.length - 1,
                trocas: resposta.resultado.trocas.length,
                diferenca_minutos:
                  resposta.diferenca_minutos ?? diferencaDeMinutos(resposta.resultado, fixos),
                resultado: resposta.resultado,
              }
            : o,
        );
        return { ...p, opcoes };
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Grupos que podem jogar o jogo todo: guarda o resultado até gerar de novo.
  const montarRef = useRef(montarPayload);
  montarRef.current = montarPayload;
  const cacheGrupos = useRef(new Map<number, GrupoDeFixos[]>());
  const avaliar = useCallback(
    async (quantos: number) => {
      const guardado = cacheGrupos.current.get(quantos);
      if (guardado) return guardado;
      const r = await avaliarGrupos(partida.id, {
        ...montarRef.current(semente, restricoes, { comparar: false }),
        avaliar_fixos: quantos,
      });
      cacheGrupos.current.set(quantos, r.grupos);
      return r.grupos;
    },
    [partida.id, semente, restricoes],
  );

  const escolherOpcao = useCallback((i: number) => startTransition(() => setOpcaoSel(i)), []);
  const aoTrocarFixo = useCallback(
    (indice: number, fixos: string[]) => trocarFixo.mutate({ indice, fixos }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trocarFixo.mutate],
  );

  const opcaoAtual: OpcaoDeTrocas | null = previa?.opcoes?.[opcaoSel] ?? null;
  const resultadoAtual = opcaoAtual?.resultado ?? previa?.resultado ?? null;

  const salvar = useMutation({
    mutationFn: () =>
      salvarEscalacao(
        partida.id,
        {
          config: montarPayload(semente, restricoes, {
            fixos: opcaoAtual?.fixos,
            mudancas: opcaoAtual?.tipo === "formacao" ? opcaoAtual.mudancas_formacao : undefined,
          }),
          resultado: resultadoAtual!,
        },
        !!salva,
      ),
    onSuccess: () => {
      toast.success("Escalação salva! Todos já podem ver.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rodar = (sementeUsada = semente, restr = restricoes) => {
    if (!goleiroId) {
      toast.error("Escolha o goleiro.");
      return;
    }
    gerar.mutate(montarPayload(sementeUsada, restr, { comparar: automatico }));
  };

  const adicionarRestricao = () => {
    if (!novaRestricao.jogador) return;
    const tipo = novaRestricao.tipo;
    const nova: Restricao =
      tipo === "comeca_dentro" || tipo === "comeca_fora"
        ? { jogador_id: novaRestricao.jogador, tipo }
        : { jogador_id: novaRestricao.jogador, tipo: "funcao", funcao: tipo as Funcao };
    // Uma restrição do mesmo tipo para o mesmo jogador substitui a anterior.
    const resto = restricoes.filter(
      (r) =>
        !(
          r.jogador_id === nova.jogador_id &&
          (r.tipo === nova.tipo || (r.tipo !== "funcao" && nova.tipo !== "funcao"))
        ),
    );
    const lista = [...resto, nova];
    setRestricoes(lista);
    rodar(semente, lista);
  };

  const removerRestricao = (i: number) => {
    const lista = restricoes.filter((_, k) => k !== i);
    setRestricoes(lista);
    rodar(semente, lista);
  };

  const nomeDe = (id: string) =>
    todosPorId.get(id)?.nome ?? previa?.resultado.jogadores[id]?.nome ?? id;
  const linha = elenco.filter((j) => j.id !== goleiroId);

  return (
    <Tabs defaultValue="escalacao" className="space-y-6">
      <ListaDeAbas aria-label="Seções da escalação">
        <Aba value="escalacao">Escalação</Aba>
        <Aba value="tatica">Tática e estratégia</Aba>
      </ListaDeAbas>

      <TabsContent value="tatica" className="mt-0 space-y-4">
        <AbaTatica
          partidaId={partida.id}
          formacao={formacao}
          setFormacao={setFormacao}
          composicao={composicao}
          setComposicao={setComposicao}
        />
      </TabsContent>

      <TabsContent value="escalacao" className="mt-0 space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Quem joga */}
          <section aria-label="Quem joga" className={cn(SECAO, "space-y-4")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className={TITULO_SECAO}>Quem joga</h2>
              <span className="text-[13px] text-muted-foreground">
                {elenco.length} convocados · vêm da lista de presença
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {convocadosApi.convocados.map((j) => {
                const dentro = !remover.has(j.id);
                return (
                  <button
                    key={j.id}
                    type="button"
                    aria-pressed={dentro}
                    onClick={() => alternarPadrao(j.id)}
                    className={cn(
                      "min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      dentro
                        ? "border-accent bg-accent/15 font-semibold"
                        : "text-muted-foreground line-through opacity-60 hover:opacity-100",
                    )}
                  >
                    {j.nome}
                    <Sigla posicoes={j.posicoes} />
                  </button>
                );
              })}
              {convocadosApi.bloqueados.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  aria-pressed={incluir.has(j.id)}
                  onClick={() => alternarExtra(j.id, !incluir.has(j.id))}
                  title={`Indisponível: ${j.motivo}. Clique para incluir mesmo assim.`}
                  className={cn(
                    "min-h-11 rounded-full border border-dashed px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    incluir.has(j.id)
                      ? "border-accent bg-accent/15 font-semibold"
                      : "opacity-60 hover:opacity-100",
                  )}
                >
                  {j.nome} <Sigla posicoes={j.posicoes} />{" "}
                  <span className="text-xs font-normal text-muted-foreground">({j.motivo})</span>
                </button>
              ))}
              {convocadosApi.outros_ativos
                .filter((j) => incluir.has(j.id))
                .map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => alternarExtra(j.id, false)}
                    aria-label={`Tirar ${j.nome}`}
                    className="flex min-h-11 items-center gap-1.5 rounded-full border border-accent bg-accent/15 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {j.nome} <Sigla posicoes={j.posicoes} />
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ))}
              {convocadosApi.outros_ativos.filter((j) => !incluir.has(j.id)).length > 0 && (
                <Select value="" onValueChange={(id) => alternarExtra(id, true)}>
                  <SelectTrigger
                    aria-label="Adicionar outro jogador"
                    className="h-11 w-auto gap-1.5 rounded-full border-dashed px-4 text-sm"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <SelectValue placeholder="Adicionar outro" />
                  </SelectTrigger>
                  <SelectContent>
                    {convocadosApi.outros_ativos
                      .filter((j) => !incluir.has(j.id))
                      .map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.nome}
                          <Sigla posicoes={j.posicoes} />
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {convocadosApi.convocados.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ninguém confirmou presença ainda — adicione jogadores abaixo.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Clique em um nome para tirar ou devolver o jogador da lista.
            </p>

            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Goleiro (joga o jogo todo)</Label>
                <Select value={goleiroId} onValueChange={setGoleiroId}>
                  <SelectTrigger aria-label="Goleiro" className="h-11">
                    <SelectValue placeholder="Escolha o goleiro" />
                  </SelectTrigger>
                  <SelectContent>
                    {elenco.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.nome}
                        {j.posicoes.includes("goleiro") && (
                          <span className="ml-1.5 rounded-[5px] border px-1.5 py-px align-middle text-[11px] font-bold uppercase text-muted-foreground">
                            GOL
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="duracao">Duração (minutos)</Label>
                <NumberInput
                  id="duracao"
                  value={duracao}
                  onChange={setDuracao}
                  min={10}
                  max={120}
                />
              </div>
            </div>
          </section>

          {/* Formação */}
          <section aria-label="Formação" className={cn(SECAO, "space-y-4")}>
            <h2 className={TITULO_SECAO}>Formação</h2>
            <FormacaoDoJogo
              formacao={formacao}
              setFormacao={setFormacao}
              mudancas={mudancasForm}
              setMudancas={setMudancasForm}
              tatica={null}
              duracao={Number(duracao) || 90}
            />
            <p className="text-xs text-muted-foreground">
              As regras de montagem do time ficam na aba “Tática e estratégia”. A tática em si é só
              orientação (PDF separado) e não muda a escalação.
            </p>
          </section>
        </div>

        {/* Avançado */}
        <section aria-label="Regras por jogador" className={cn(SECAO, "space-y-4")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className={TITULO_SECAO}>Regras por jogador</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Opcional. Aqui você escolhe, por exemplo, quem joga o jogo todo. O sistema ajusta as
                trocas em volta.
              </p>
            </div>
            <Button
              variant="outline"
              className="min-h-11 rounded-[10px] bg-card"
              aria-expanded={mostrarAvancado}
              onClick={() => setMostrarAvancado((v) => !v)}
            >
              {mostrarAvancado ? "Esconder" : "Mostrar"} regras
              <ChevronDown
                aria-hidden="true"
                className={cn("transition-transform", mostrarAvancado && "rotate-180")}
              />
            </Button>
          </div>
          {mostrarAvancado && (
            <div className="space-y-5">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.06em] text-muted-foreground">
                      <th scope="col" className="py-2 pr-2 font-semibold">
                        Jogador
                      </th>
                      <th scope="col" className="px-2 py-2 font-semibold">
                        Começa
                      </th>
                      <th scope="col" className="px-2 py-2 font-semibold">
                        Só X min
                      </th>
                      <th scope="col" className="px-2 py-2 text-center font-semibold">
                        Só 2º tempo
                      </th>
                      <th scope="col" className="py-2 pl-2 text-right font-semibold">
                        Jogo todo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {linha.map((j) => {
                      const r = regras[j.id] ?? {};
                      return (
                        <tr key={j.id} className="border-t">
                          <th scope="row" className="py-2 pr-2 text-left font-semibold">
                            {j.nome}
                            <Sigla posicoes={j.posicoes} />
                          </th>
                          <td className="px-2 py-2">
                            <Select
                              value={r.comeca ?? "livre"}
                              onValueChange={(v) =>
                                mudarRegra(j.id, {
                                  comeca: v === "livre" ? undefined : (v as "titular" | "reserva"),
                                })
                              }
                            >
                              <SelectTrigger className="h-11 w-32" aria-label={`${j.nome} começa`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="livre">Tanto faz</SelectItem>
                                <SelectItem value="titular">Titular</SelectItem>
                                <SelectItem value="reserva">Reserva</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-2">
                            <NumberInput
                              value={r.minutos_max ? String(r.minutos_max) : ""}
                              onChange={(v) =>
                                mudarRegra(j.id, { minutos_max: Number(v) || undefined })
                              }
                              min={1}
                              max={120}
                              placeholder="—"
                              className="w-24"
                              aria-label={`${j.nome}: máximo de minutos`}
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <Switch
                              className={CLASSE_CHAVE}
                              checked={!!r.so_segundo_tempo}
                              onCheckedChange={(v) => mudarRegra(j.id, { so_segundo_tempo: v })}
                              aria-label={`${j.nome} entra só no segundo tempo`}
                            />
                          </td>
                          <td className="py-2 pl-2 text-right">
                            <Switch
                              className={CLASSE_CHAVE}
                              checked={!!r.grupo_fixo}
                              onCheckedChange={(v) => mudarRegra(j.id, { grupo_fixo: v })}
                              aria-label={`${j.nome} joga o jogo todo`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="space-y-4 rounded-xl border bg-raised p-4">
                <label className="flex items-start gap-3 text-sm">
                  <Switch
                    className={cn(CLASSE_CHAVE, "mt-0.5")}
                    checked={!automatico}
                    onCheckedChange={(v) => setAutomatico(!v)}
                    aria-label="Escolher as substituições na mão"
                  />
                  <span>
                    <strong>Escolher as substituições na mão</strong>
                    <span className="block text-muted-foreground">
                      Por padrão o computador decide tudo. Ligue só se quiser definir você mesmo.
                    </span>
                  </span>
                </label>
                {!automatico && (
                  <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="subs">Momentos de substituição</Label>
                      <NumberInput id="subs" value={nSubs} onChange={setNSubs} min={0} max={20} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="trocas">Quantos trocam por vez</Label>
                      <NumberInput
                        id="trocas"
                        value={trocas}
                        onChange={setTrocas}
                        min={1}
                        max={10}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => rodar()}
            disabled={gerar.isPending}
            className="min-h-11 rounded-[10px] px-6 font-bold"
          >
            {gerar.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            {gerar.isPending
              ? "Pensando nas melhores trocas…"
              : previa
                ? "Gerar novamente"
                : "Gerar escalação"}
          </Button>
          {gerar.isError && (
            <p role="alert" className="text-sm text-destructive">
              {gerar.error.message}
            </p>
          )}
        </div>

        {/* Resultado */}
        {previa && resultadoAtual && (
          <div className="space-y-6">
            {[
              ...(previa.avisos ?? []),
              ...(resultadoAtual.plano?.aviso ? [resultadoAtual.plano.aviso] : []),
            ].length > 0 && (
              <div
                role="note"
                className="rounded-[10px] border border-warn-border bg-warn px-4 py-3 text-sm leading-relaxed text-warn-foreground"
              >
                <p className="mb-1 font-bold">Atenção</p>
                <ul className="list-disc space-y-1 pl-5">
                  {[
                    ...(previa.avisos ?? []),
                    ...(resultadoAtual.plano?.aviso ? [resultadoAtual.plano.aviso] : []),
                  ].map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {previa.opcoes && previa.opcoes.length > 0 && (
              <OpcoesDeTempo
                opcoes={previa.opcoes}
                selecionada={opcaoSel}
                aoEscolher={escolherOpcao}
                aoTrocarFixo={aoTrocarFixo}
                avaliar={avaliar}
                linha={linha}
                refazendo={trocarFixo.isPending}
              />
            )}

            <div
              className={cn(
                "transition-opacity",
                (trocarFixo.isPending || gerar.isPending) && "pointer-events-none opacity-60",
              )}
              aria-busy={trocarFixo.isPending || gerar.isPending}
            >
              <VisaoEscalacao
                resultado={resultadoAtual}
                partida={partida}
                acoes={
                  <>
                    <Button
                      variant="outline"
                      className="min-h-11 rounded-[10px] bg-card"
                      disabled={gerar.isPending}
                      onClick={() => {
                        const proxima = semente + 1;
                        setSemente(proxima);
                        rodar(proxima);
                      }}
                    >
                      <Shuffle aria-hidden="true" /> Outra opção
                    </Button>
                    <Button
                      className="min-h-11 rounded-[10px] px-5 font-bold"
                      onClick={() => salvar.mutate()}
                      disabled={salvar.isPending}
                    >
                      <Save aria-hidden="true" />
                      {salva ? "Atualizar escalação salva" : "Salvar escalação"}
                    </Button>
                  </>
                }
              />
            </div>

            <section aria-label="Ajustar um jogador" className={cn(SECAO, "space-y-4")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className={TITULO_SECAO}>Ajustar um jogador</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Começa jogando, começa no banco ou joga numa posição específica.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="min-h-11 rounded-[10px] bg-card"
                  aria-expanded={mostrarAjuste}
                  onClick={() => setMostrarAjuste((v) => !v)}
                >
                  {mostrarAjuste ? "Esconder" : "Ajustar"}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn("transition-transform", mostrarAjuste && "rotate-180")}
                  />
                </Button>
              </div>
              {mostrarAjuste && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                      <Label>Jogador</Label>
                      <Select
                        value={novaRestricao.jogador}
                        onValueChange={(v) => setNovaRestricao((s) => ({ ...s, jogador: v }))}
                      >
                        <SelectTrigger className="h-11 w-48" aria-label="Jogador do ajuste">
                          <SelectValue placeholder="Escolha" />
                        </SelectTrigger>
                        <SelectContent>
                          {linha.map((j) => (
                            <SelectItem key={j.id} value={j.id}>
                              {j.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Regra</Label>
                      <Select
                        value={novaRestricao.tipo}
                        onValueChange={(v) => setNovaRestricao((s) => ({ ...s, tipo: v }))}
                      >
                        <SelectTrigger className="h-11 w-56" aria-label="Tipo de ajuste">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="comeca_dentro">Começa jogando</SelectItem>
                          <SelectItem value="comeca_fora">Começa no banco</SelectItem>
                          {FUNCOES.map((f) => (
                            <SelectItem key={f} value={f}>
                              Joga de {FUNCAO_LABELS[f].toLowerCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="secondary"
                      className="min-h-11 rounded-[10px]"
                      onClick={adicionarRestricao}
                      disabled={!novaRestricao.jogador || gerar.isPending}
                    >
                      <Plus aria-hidden="true" /> Aplicar e regerar
                    </Button>
                  </div>
                  {restricoes.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {restricoes.map((r, i) => (
                        <li
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full border bg-raised py-0.5 pl-3 pr-0.5 text-sm"
                        >
                          <span>
                            <strong className="font-semibold">{nomeDe(r.jogador_id)}:</strong>{" "}
                            {r.tipo === "comeca_dentro"
                              ? "começa jogando"
                              : r.tipo === "comeca_fora"
                                ? "começa no banco"
                                : `joga de ${FUNCAO_LABELS[r.funcao!].toLowerCase()}`}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remover ajuste de ${nomeDe(r.jogador_id)}`}
                            onClick={() => removerRestricao(i)}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
