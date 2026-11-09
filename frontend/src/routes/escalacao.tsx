import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, RefreshCw, Save, Shuffle, X } from "lucide-react";
import { toast } from "sonner";

import { isAutenticado } from "@/lib/auth";
import { useUsuario } from "@/lib/useUsuario";
import { fetchMatches, formatDate, matchTitle, VENUE_LABELS, type Match } from "@/lib/football";
import {
  FUNCAO_LABELS,
  FUNCOES,
  escalacaoDaJanela,
  fetchConvocados,
  fetchEscalacaoSalva,
  gerarEscalacao,
  salvarEscalacao,
  type Convocado,
  type EscalacaoSalva,
  type Funcao,
  type GerarPayload,
  type PreviaEscalacao,
  type RegraComposicao,
  type RegraJogador,
  type Restricao,
  type ResultadoEscalacao,
} from "@/lib/escalacao";
import { exportarEscalacaoPdf } from "@/lib/escalacaoPdf";
import { CampoEscalacao } from "@/components/CampoEscalacao";
import { CartaoAnalise, CartaoNota, CartaoTatica } from "@/components/EscalacaoInterna";
import {
  CamposTrocas,
  CartaoComoFunciona,
  CartaoComposicao,
  CartaoFormacao,
  type ControleTrocas,
  type MudancaFormacaoForm,
} from "@/components/EscalacaoControles";
import { NumberInput } from "@/components/NumberInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
// Página: escolher o jogo
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
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-foreground">Escalação</h1>
        <p className="text-sm text-muted-foreground">
          {podeEditar
            ? "Monte a escalação do jogo (4-4-2, 4-3-3, 4-5-1…): o sistema divide os minutos e as trocas para você."
            : "Veja a escalação montada para cada jogo."}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6 sm:max-w-md">
          <Label htmlFor="jogo">1. Escolha o jogo</Label>
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : !partidas?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma partida cadastrada ainda.</p>
          ) : (
            <Select value={partidaId} onValueChange={setPartidaId}>
              <SelectTrigger id="jogo">
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
        </CardContent>
      </Card>

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
function VisaoEscalacao({
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-display text-2xl tracking-wide">
            Escalação {resultado.formacao}
            {resultado.mudancas_formacao && resultado.mudancas_formacao.length > 0 && (
              <span className="ml-2 text-base text-muted-foreground">
                {resultado.mudancas_formacao
                  .map((m) => `→ ${m.formacao} aos ${m.minuto}'`)
                  .join(" ")}
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
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl tracking-wide">Minutos por jogador</CardTitle>
          {resultado.plano && (
            <p className="text-sm text-muted-foreground">
              O sistema escolheu {resultado.plano.n_substituicoes} momento(s) de troca, com até{" "}
              {resultado.plano.trocas_por_vez} jogador(es) saindo por vez (minutos{" "}
              {resultado.plano.cortes.join(", ") || "—"})
              {resultado.plano.fixos && resultado.plano.fixos.length > 0
                ? `; ${resultado.plano.fixos
                    .map((id) => resultado.jogadores[id]?.nome ?? id)
                    .join(", ")} joga(m) o jogo todo`
                : ""}
              .
            </p>
          )}
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
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
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: convocados → goleiro → parâmetros → gerar → ajustar → salvar
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
  const [tatica, setTatica] = useState<string | null>(cfg?.tatica ?? null);
  const [estrategia, setEstrategia] = useState(cfg?.estrategia ?? "uniforme");
  const [forca, setForca] = useState(cfg?.forca_tatica ?? 50);
  const [formacao, setFormacao] = useState(cfg?.formacao ?? "4-4-2");
  const [mudancasForm, setMudancasForm] = useState<MudancaFormacaoForm[]>(
    (cfg?.mudancas_formacao ?? []).map((m) => ({ minuto: String(m.minuto), formacao: m.formacao })),
  );
  const [composicao, setComposicao] = useState<RegraComposicao[]>(cfg?.composicao ?? []);
  const [ctlTrocas, setCtlTrocas] = useState<ControleTrocas>({
    intervalo: String(cfg?.intervalo_minimo ?? 10),
    tolerancia: String(cfg?.tolerancia_minutos ?? 5),
    maxMomentos: cfg?.max_momentos != null ? String(cfg.max_momentos) : "",
    maxPorVez: cfg?.max_trocas_por_vez != null ? String(cfg.max_trocas_por_vez) : "",
    fixos: String(cfg?.quantos_fixos ?? 0),
  });
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
  const [mostrarRegras, setMostrarRegras] = useState(false);
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

  const alternarPadrao = (id: string, marcado: boolean) =>
    setRemover((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.delete(id);
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

  const montarPayload = (sementeUsada: number, restr: Restricao[]): GerarPayload => ({
    goleiro_id: goleiroId,
    incluir: [...incluir],
    remover: [...remover],
    duracao: Number(duracao) || 90,
    automatico,
    tatica,
    estrategia,
    forca_tatica: forca,
    formacao,
    mudancas_formacao: mudancasForm
      .filter((m) => Number(m.minuto) > 0)
      .map((m) => ({ minuto: Number(m.minuto), formacao: m.formacao })),
    composicao,
    intervalo_minimo: Number(ctlTrocas.intervalo) || 10,
    tolerancia_minutos: ctlTrocas.tolerancia === "" ? 5 : Number(ctlTrocas.tolerancia),
    max_momentos: ctlTrocas.maxMomentos === "" ? null : Number(ctlTrocas.maxMomentos),
    max_trocas_por_vez: Number(ctlTrocas.maxPorVez) || null,
    quantos_fixos: Number(ctlTrocas.fixos) || 0,
    n_substituicoes: Number(nSubs) || 0,
    trocas_por_vez: Number(trocas) || 1,
    regras: limparRegras(regras, new Set(elenco.map((j) => j.id))),
    restricoes: restr,
    semente: sementeUsada,
  });

  const gerar = useMutation({
    mutationFn: (p: GerarPayload) => gerarEscalacao(partida.id, p),
    onSuccess: (resposta) => setPrevia(resposta),
    onError: (e: Error) => toast.error(e.message),
  });

  const salvar = useMutation({
    mutationFn: () =>
      salvarEscalacao(
        partida.id,
        { config: previa!.config, resultado: previa!.resultado },
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
    gerar.mutate(montarPayload(sementeUsada, restr));
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
    <div className="space-y-6">
      {/* 2. Convocados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Convocados</CardTitle>
          <p className="text-sm text-muted-foreground">
            Vêm da lista de presença confirmada (sem quem está punido ou lesionado). Desmarque quem
            não vai ou adicione outros jogadores.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {convocadosApi.convocados.map((j) => (
              <label key={j.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!remover.has(j.id)}
                  onCheckedChange={(v) => alternarPadrao(j.id, v === true)}
                />
                <span className="truncate">{j.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {j.posicoes
                    .slice(0, 1)
                    .map((p) => p.replace("_", " "))
                    .join("")}
                </span>
              </label>
            ))}
            {convocadosApi.convocados.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ninguém confirmou presença ainda — adicione jogadores abaixo.
              </p>
            )}
          </div>

          {convocadosApi.bloqueados.length > 0 && (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Confirmados, mas indisponíveis
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {convocadosApi.bloqueados.map((j) => (
                  <label key={j.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={incluir.has(j.id)}
                      onCheckedChange={(v) => alternarExtra(j.id, v === true)}
                    />
                    <span className="truncate">{j.nome}</span>
                    <Badge variant="outline">{j.motivo}</Badge>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:max-w-sm">
            <Label>Adicionar outro jogador</Label>
            <Select value="" onValueChange={(id) => alternarExtra(id, true)}>
              <SelectTrigger>
                <SelectValue placeholder="Escolher jogador do elenco" />
              </SelectTrigger>
              <SelectContent>
                {convocadosApi.outros_ativos
                  .filter((j) => !incluir.has(j.id))
                  .map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.nome}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {convocadosApi.outros_ativos
              .filter((j) => incluir.has(j.id))
              .map((j) => (
                <div key={j.id} className="flex items-center justify-between text-sm">
                  <span>{j.nome}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Tirar ${j.nome}`}
                    onClick={() => alternarExtra(j.id, false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
          </div>
          <p className="text-sm font-medium">{elenco.length} jogadores convocados.</p>
        </CardContent>
      </Card>

      {/* 3. Goleiro */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Goleiro</CardTitle>
          <p className="text-sm text-muted-foreground">
            O goleiro joga o jogo todo — ele nunca é trocado.
          </p>
        </CardHeader>
        <CardContent className="sm:max-w-sm">
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
        </CardContent>
      </Card>

      {/* 4. Parâmetros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">4. Parâmetros do jogo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="duracao">Duração (minutos)</Label>
              <NumberInput id="duracao" value={duracao} onChange={setDuracao} min={10} max={120} />
            </div>
            {!automatico && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="subs">Momentos de substituição</Label>
                  <NumberInput id="subs" value={nSubs} onChange={setNSubs} min={0} max={20} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="trocas">Quantos trocam por vez</Label>
                  <NumberInput id="trocas" value={trocas} onChange={setTrocas} min={1} max={10} />
                </div>
              </>
            )}
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Switch
              checked={automatico}
              onCheckedChange={setAutomatico}
              aria-label="Deixar o computador decidir as substituições"
            />
            <span>
              <strong>Deixar o computador decidir as substituições</strong>
              <span className="block text-muted-foreground">
                Ele escolhe quantas trocas e quantos saem por vez para todo mundo jogar o mesmo
                tempo. Os minutos das trocas são arredondados para cima (por causa do acréscimo).
              </span>
            </span>
          </label>

          {automatico && <CamposTrocas valores={ctlTrocas} setValores={setCtlTrocas} />}

          <Button variant="link" className="h-auto p-0" onClick={() => setMostrarRegras((v) => !v)}>
            {mostrarRegras ? "Esconder" : "Mostrar"} regras opcionais por jogador
          </Button>
          {mostrarRegras && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Jogador</th>
                    <th className="px-2 font-medium">Só X min</th>
                    <th className="px-2 font-medium">Só 2º tempo</th>
                    <th className="px-2 font-medium">Começa</th>
                    <th className="px-2 font-medium">Não sai</th>
                    <th className="px-2 font-medium">Grupo fixo</th>
                  </tr>
                </thead>
                <tbody>
                  {linha.map((j) => {
                    const r = regras[j.id] ?? {};
                    return (
                      <tr key={j.id} className="border-t">
                        <td className="py-1 pr-2">{j.nome}</td>
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
                        <td className="px-2">
                          <Select
                            value={r.comeca ?? "livre"}
                            onValueChange={(v) =>
                              mudarRegra(j.id, {
                                comeca: v === "livre" ? undefined : (v as "titular" | "reserva"),
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-32" aria-label={`${j.nome} começa`}>
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
                          <Switch
                            checked={!!r.nao_sai}
                            onCheckedChange={(v) => mudarRegra(j.id, { nao_sai: v })}
                            aria-label={`${j.nome} não sai depois que entra`}
                          />
                        </td>
                        <td className="px-2">
                          <Switch
                            checked={!!r.grupo_fixo}
                            onCheckedChange={(v) => mudarRegra(j.id, { grupo_fixo: v })}
                            aria-label={`${j.nome} no grupo que não roda`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CartaoFormacao
        formacao={formacao}
        setFormacao={setFormacao}
        mudancas={mudancasForm}
        setMudancas={setMudancasForm}
        tatica={tatica}
        duracao={Number(duracao) || 90}
      />

      <CartaoTatica
        partidaId={partida.id}
        tatica={tatica}
        setTatica={setTatica}
        estrategia={estrategia}
        setEstrategia={setEstrategia}
        forca={forca}
        setForca={setForca}
      />
      <CartaoComposicao regras={composicao} setRegras={setComposicao} />
      <CartaoComoFunciona />
      <p className="text-sm text-muted-foreground">
        Atributos e características dos jogadores ficam na aba <strong>Jogadores</strong> (menu “⋮”
        do jogador → Atributos).
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => rodar()} disabled={gerar.isPending} size="lg">
          <RefreshCw className={`mr-2 h-4 w-4 ${gerar.isPending ? "animate-spin" : ""}`} />
          {previa ? "Gerar novamente" : "Gerar escalação"}
        </Button>
        {gerar.isError && (
          <p role="alert" className="text-sm text-destructive">
            {gerar.error.message}
          </p>
        )}
      </div>

      {/* 5. Prévia */}
      {previa && (
        <div className="space-y-6">
          {previa.avisos && previa.avisos.length > 0 && (
            <Card className="border-accent">
              <CardHeader>
                <CardTitle className="text-base">Atenção</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {previa.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {previa.dica_fixos && (
            <Card className="border-accent">
              <CardHeader>
                <CardTitle className="text-base">Dica para simplificar as trocas</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3 text-sm">
                <span>{previa.dica_fixos.texto}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={gerar.isPending}
                  onClick={() => {
                    const novo = { ...ctlTrocas, fixos: String(previa.dica_fixos!.quantos_fixos) };
                    setCtlTrocas(novo);
                    gerar.mutate({
                      ...montarPayload(semente, restricoes),
                      quantos_fixos: previa.dica_fixos!.quantos_fixos,
                    });
                  }}
                >
                  Usar esta dica
                </Button>
              </CardContent>
            </Card>
          )}
          <VisaoEscalacao
            resultado={previa.resultado}
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

          {previa.analise && <CartaoAnalise analise={previa.analise} />}
          <CartaoNota partidaId={partida.id} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ajustar e gerar de novo</CardTitle>
              <p className="text-sm text-muted-foreground">
                Não gostou de algo? Fixe uma regra e o sistema refaz a escalação respeitando ela.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  Aplicar e regerar
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
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
