import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, Loader2, RefreshCw, Save, Shuffle, Plus, X } from "lucide-react";
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
} from "@/lib/escalacao";
import { exportarEscalacaoPdf } from "@/lib/escalacaoPdf";
import { CampoEscalacao } from "@/components/CampoEscalacao";
import { AbaTatica } from "@/components/EscalacaoInterna";
import {
  AjudaSistema,
  FormacaoDoJogo,
  type MudancaFormacaoForm,
} from "@/components/EscalacaoControles";
import { NumberInput } from "@/components/NumberInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/escalacao")({
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
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-wide text-foreground">Escalação</h1>
          <p className="text-sm text-muted-foreground">
            {podeEditar
              ? "Escolha o jogo e o sistema divide os minutos e as trocas para você."
              : "Veja a escalação montada para cada jogo."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isLoading ? (
            <Skeleton className="h-10 w-72" />
          ) : !partidas?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma partida cadastrada ainda.</p>
          ) : (
            <Select value={partidaId} onValueChange={setPartidaId}>
              <SelectTrigger className="w-72" aria-label="Jogo">
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

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!salva) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <ClipboardList className="h-5 w-5" />A escalação deste jogo ainda não foi divulgada.
        </CardContent>
      </Card>
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

  const minutosOrdenados = Object.entries(resultado.minutos)
    .map(([id, minutos]) => ({ id, minutos, nome: resultado.jogadores[id]?.nome ?? id }))
    .sort((a, b) => b.minutos - a.minutos || a.nome.localeCompare(b.nome));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="font-display text-2xl tracking-wide">
          Escalação {resultado.formacao}
          {resultado.mudancas_formacao && resultado.mudancas_formacao.length > 0 && (
            <span className="ml-2 text-base text-muted-foreground">
              {resultado.mudancas_formacao.map((m) => `→ ${m.formacao} aos ${m.minuto}'`).join(" ")}
            </span>
          )}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          {acoes}
          <Button variant="outline" size="sm" onClick={pdf}>
            <Download className="mr-1 h-4 w-4" /> Exportar PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Momento do jogo"
        >
          {resultado.janelas.map((j, i) => (
            <Button
              key={j.inicio}
              role="tab"
              aria-selected={i === idx}
              size="sm"
              variant={i === idx ? "default" : "outline"}
              onClick={() => setIndice(i)}
            >
              {j.inicio}'–{j.fim}'
              {j.formacao && j.formacao !== resultado.formacao ? ` · ${j.formacao}` : ""}
            </Button>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
          <CampoEscalacao
            lugares={janela.lugares}
            formacao={janela.formacao ?? resultado.formacao}
            jogadores={resultado.jogadores}
            destaque={quemEntrou}
            className="w-full max-w-sm justify-self-center"
          />
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Banco neste momento
              </h3>
              {banco.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem reservas.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {banco.map((id) => (
                    <Badge key={id} variant="secondary">
                      {resultado.jogadores[id].numero_camisa != null
                        ? `${resultado.jogadores[id].numero_camisa} · `
                        : ""}
                      {resultado.jogadores[id].nome}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Linha do tempo das trocas
              </h3>
              {resultado.trocas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem substituições.</p>
              ) : (
                <ol className="space-y-1 text-sm">
                  {resultado.trocas.map((t, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-2">
                      <span className="w-10 font-semibold tabular-nums">{t.minuto}'</span>
                      <span className="text-destructive">↓ {t.sai_nome}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        ↑ {t.entra_nome}
                      </span>
                      <span className="text-muted-foreground">({FUNCAO_LABELS[t.funcao]})</span>
                    </li>
                  ))}
                </ol>
              )}
              {resultado.ajustes_de_posicao.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {resultado.ajustes_de_posicao.map((a, i) => (
                    <li key={i}>
                      {a.minuto}' · {a.nome} muda de {FUNCAO_LABELS[a.de]} para{" "}
                      {FUNCAO_LABELS[a.para]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Minutos por jogador
          </h3>
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {minutosOrdenados.map((m) => (
              <div key={m.id} className="flex items-center gap-3 text-sm">
                <span className="w-28 truncate">{m.nome}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(m.minutos / resultado.duracao) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right tabular-nums">{m.minutos}'</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
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
    return <Skeleton className="h-96 w-full" />;
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

/** Só quem de fato funciona como "jogo todo" naquele lugar (dado o(s) outro(s) fixo(s)). */
function candidatosDoFixo(o: OpcaoDeTrocas, k: number, linha: Convocado[]): Convocado[] {
  const permitidos = new Set<string>(o.fixos[k] ? [o.fixos[k]] : []);
  for (const combo of o.combinacoes ?? []) {
    const outros = o.fixos.every((f, kk) => kk === k || combo.includes(f));
    if (outros && combo.length === o.fixos.length) {
      for (const id of combo)
        if (!o.fixos.some((f, kk) => kk !== k && f === id)) permitidos.add(id);
    }
  }
  return linha.filter((j) => permitidos.has(j.id));
}

/** Legendinha com a posição principal do jogador (a segunda, se houver, vai no balãozinho). */
function Sigla({ posicoes }: { posicoes: string[] }) {
  const sigla = siglaPosicao(posicoes);
  if (!sigla) return null;
  return (
    <span
      title={posicoes.map((p) => p.replace(/_/g, " ")).join(" / ")}
      className="ml-1.5 rounded bg-muted px-1 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
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
  if (o.tipo === "fixos")
    return o.quantos_fixos === 1
      ? "1 jogador joga o jogo todo"
      : `${o.quantos_fixos} jogadores jogam o jogo todo`;
  return o.aceitavel ? "Todo mundo joga o mesmo tempo" : "Tentativa de tempo igual";
}

const OpcoesDeTempo = memo(function OpcoesDeTempo({
  opcoes,
  selecionada,
  aoEscolher,
  aoTrocarFixo,
  linha,
  refazendo,
}: {
  opcoes: OpcaoDeTrocas[];
  selecionada: number;
  aoEscolher: (i: number) => void;
  aoTrocarFixo: (indice: number, fixos: string[]) => void;
  linha: Convocado[];
  refazendo: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold">Como dividir o tempo?</h2>
        <p className="text-sm text-muted-foreground">
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
                ativa ? "border-primary bg-primary/5" : "bg-card hover:border-primary/50",
              )}
            >
              <button
                type="button"
                onClick={() => aoEscolher(i)}
                aria-pressed={ativa}
                className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block font-display text-xl leading-tight tracking-wide">
                  {tituloDaOpcao(o)}
                </span>
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
              {o.fixos.length > 0 && (
                <div className="mt-3 space-y-2">
                  {o.fixos.map((fid, k) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-xs">
                        {o.fixos.length > 1
                          ? `Jogador ${k + 1} o jogo todo`
                          : "Quem joga o jogo todo"}
                      </Label>
                      <Select
                        value={fid}
                        onValueChange={(novo) => {
                          if (novo === fid) return;
                          aoEscolher(i);
                          aoTrocarFixo(
                            i,
                            o.fixos.map((x, kk) => (kk === k ? novo : x)),
                          );
                        }}
                        disabled={refazendo}
                      >
                        <SelectTrigger className="h-8" aria-label="Quem joga o jogo todo">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {candidatosDoFixo(o, k, linha).map((j) => (
                            <SelectItem key={j.id} value={j.id}>
                              {j.nome}
                              <Sigla posicoes={j.posicoes} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {refazendo && ativa && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Refazendo as trocas…
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
                diferenca_minutos: diferencaDeMinutos(resposta.resultado, fixos),
                resultado: resposta.resultado,
              }
            : o,
        );
        return { ...p, opcoes };
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
    <Tabs defaultValue="escalacao" className="space-y-4">
      <TabsList>
        <TabsTrigger value="escalacao">Escalação</TabsTrigger>
        <TabsTrigger value="tatica">Tática e estratégia</TabsTrigger>
      </TabsList>

      <TabsContent value="tatica" className="space-y-4">
        <AbaTatica
          partidaId={partida.id}
          formacao={formacao}
          setFormacao={setFormacao}
          composicao={composicao}
          setComposicao={setComposicao}
        />
      </TabsContent>

      <TabsContent value="escalacao" className="space-y-6">
        {/* Tudo que define a escalação, num cartão só */}
        <Card>
          <CardContent className="space-y-6 pt-6">
            {/* Quem joga */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">Quem joga</h2>
                <span className="text-sm text-muted-foreground">
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
                        "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        dentro
                          ? "border-primary bg-primary/10 font-medium"
                          : "text-muted-foreground line-through opacity-60",
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
                      "rounded-full border border-dashed px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      incluir.has(j.id) ? "border-primary bg-primary/10" : "opacity-60",
                    )}
                  >
                    {j.nome} <Sigla posicoes={j.posicoes} />
                    <span className="text-xs text-muted-foreground">({j.motivo})</span>
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
                      className="flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm"
                    >
                      {j.nome} <Sigla posicoes={j.posicoes} /> <X className="h-3 w-3" />
                    </button>
                  ))}
                {convocadosApi.outros_ativos.filter((j) => !incluir.has(j.id)).length > 0 && (
                  <Select value="" onValueChange={(id) => alternarExtra(id, true)}>
                    <SelectTrigger
                      aria-label="Adicionar outro jogador"
                      className="h-8 w-auto gap-1 rounded-full border-dashed px-3 text-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
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

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Goleiro (joga o jogo todo)</Label>
                  <Select value={goleiroId} onValueChange={setGoleiroId}>
                    <SelectTrigger aria-label="Goleiro">
                      <SelectValue placeholder="Escolha o goleiro" />
                    </SelectTrigger>
                    <SelectContent>
                      {elenco.map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.nome}
                          {j.posicoes.includes("goleiro") ? " 🧤" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
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

            <Separator />

            {/* Formação */}
            <section className="space-y-3">
              <h2 className="font-semibold">Formação</h2>
              <FormacaoDoJogo
                formacao={formacao}
                setFormacao={setFormacao}
                mudancas={mudancasForm}
                setMudancas={setMudancasForm}
                tatica={null}
                duracao={Number(duracao) || 90}
              />
              <p className="text-xs text-muted-foreground">
                As regras de montagem do time ficam na aba “Tática e estratégia”. A tática em si é
                só orientação (PDF separado) e não muda a escalação.
              </p>
            </section>

            <Separator />

            {/* Avançado */}
            <section className="space-y-3">
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() => setMostrarAvancado((v) => !v)}
              >
                {mostrarAvancado ? "Esconder" : "Mostrar"} regras por jogador (opcional)
              </Button>
              {mostrarAvancado && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Aqui você escolhe, por exemplo, quem joga o jogo todo. O sistema ajusta as
                    trocas em volta.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-muted-foreground">
                          <th className="py-1 pr-2 font-medium">Jogador</th>
                          <th className="px-2 font-medium">Joga o jogo todo</th>
                          <th className="px-2 font-medium">Começa</th>
                          <th className="px-2 font-medium">Só X min</th>
                          <th className="px-2 font-medium">Só 2º tempo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linha.map((j) => {
                          const r = regras[j.id] ?? {};
                          return (
                            <tr key={j.id} className="border-t">
                              <td className="py-1 pr-2">{j.nome}</td>
                              <td className="px-2">
                                <Switch
                                  checked={!!r.grupo_fixo}
                                  onCheckedChange={(v) => mudarRegra(j.id, { grupo_fixo: v })}
                                  aria-label={`${j.nome} joga o jogo todo`}
                                />
                              </td>
                              <td className="px-2">
                                <Select
                                  value={r.comeca ?? "livre"}
                                  onValueChange={(v) =>
                                    mudarRegra(j.id, {
                                      comeca:
                                        v === "livre" ? undefined : (v as "titular" | "reserva"),
                                    })
                                  }
                                >
                                  <SelectTrigger
                                    className="h-8 w-32"
                                    aria-label={`${j.nome} começa`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="livre">Tanto faz</SelectItem>
                                    <SelectItem value="titular">Titular</SelectItem>
                                    <SelectItem value="reserva">Reserva</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-2">
                                <NumberInput
                                  value={r.minutos_max ? String(r.minutos_max) : ""}
                                  onChange={(v) =>
                                    mudarRegra(j.id, { minutos_max: Number(v) || undefined })
                                  }
                                  min={1}
                                  max={120}
                                  placeholder="—"
                                  className="w-24"
                                />
                              </td>
                              <td className="px-2">
                                <Switch
                                  checked={!!r.so_segundo_tempo}
                                  onCheckedChange={(v) => mudarRegra(j.id, { so_segundo_tempo: v })}
                                  aria-label={`${j.nome} entra só no segundo tempo`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <label className="flex items-start gap-3 text-sm">
                    <Switch
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
                      <div className="space-y-1">
                        <Label htmlFor="subs">Momentos de substituição</Label>
                        <NumberInput id="subs" value={nSubs} onChange={setNSubs} min={0} max={20} />
                      </div>
                      <div className="space-y-1">
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
              )}
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => rodar()} disabled={gerar.isPending} size="lg">
                {gerar.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
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
          </CardContent>
        </Card>

        {/* Resultado */}
        {previa && resultadoAtual && (
          <div className="space-y-6">
            {[
              ...(previa.avisos ?? []),
              ...(resultadoAtual.plano?.aviso ? [resultadoAtual.plano.aviso] : []),
            ].length > 0 && (
              <div className="rounded-lg border border-accent bg-accent/10 p-4 text-sm">
                <p className="mb-1 font-semibold">Atenção</p>
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
                      size="sm"
                      disabled={gerar.isPending}
                      onClick={() => {
                        const proxima = semente + 1;
                        setSemente(proxima);
                        rodar(proxima);
                      }}
                    >
                      <Shuffle className="mr-1 h-4 w-4" /> Outra opção
                    </Button>
                    <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                      <Save className="mr-1 h-4 w-4" />
                      {salva ? "Atualizar escalação salva" : "Salvar escalação"}
                    </Button>
                  </>
                }
              />
            </div>

            <section className="space-y-3">
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() => setMostrarAjuste((v) => !v)}
              >
                {mostrarAjuste ? "Esconder" : "Ajustar um jogador"} (começa jogando, posição…)
              </Button>
              {mostrarAjuste && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <Label>Jogador</Label>
                      <Select
                        value={novaRestricao.jogador}
                        onValueChange={(v) => setNovaRestricao((s) => ({ ...s, jogador: v }))}
                      >
                        <SelectTrigger className="w-48" aria-label="Jogador do ajuste">
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
                    <div className="space-y-1">
                      <Label>Regra</Label>
                      <Select
                        value={novaRestricao.tipo}
                        onValueChange={(v) => setNovaRestricao((s) => ({ ...s, tipo: v }))}
                      >
                        <SelectTrigger className="w-56" aria-label="Tipo de ajuste">
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
                      onClick={adicionarRestricao}
                      disabled={!novaRestricao.jogador || gerar.isPending}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Aplicar e regerar
                    </Button>
                  </div>
                  {restricoes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {restricoes.map((r, i) => (
                        <Badge key={i} variant="secondary" className="gap-1">
                          {nomeDe(r.jogador_id)}:{" "}
                          {r.tipo === "comeca_dentro"
                            ? "começa jogando"
                            : r.tipo === "comeca_fora"
                              ? "começa no banco"
                              : `joga de ${FUNCAO_LABELS[r.funcao!].toLowerCase()}`}
                          <button
                            type="button"
                            aria-label="Remover ajuste"
                            onClick={() => removerRestricao(i)}
                            className="rounded-full hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
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
