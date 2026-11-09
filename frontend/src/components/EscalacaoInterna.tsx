import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileDown, Lightbulb, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  apagarJogada,
  apagarTatica,
  criarJogada,
  criarTatica,
  editarJogada,
  editarTatica,
  fetchCatalogo,
  fetchJogadas,
  fetchContraEstrategia,
  fetchTaticas,
  layoutDaFormacao,
  salvarAdversario,
  type Adversario,
  type Catalogo,
  type JogadaEnsaiada,
  type RegraComposicao,
  type TaticaSalva,
} from "@/lib/escalacao";
import { SITUACAO_CURTA, jogadaVazia } from "@/lib/jogadaEnsaiada";
import { frasesDoTime, nomeDoLugar, planoDoModelo, planoVazio } from "@/lib/quadroTatico";
import { exportarTaticaPdf, type EscopoPdf } from "@/lib/taticaPdf";
import { CampoFormacao } from "@/components/CampoFormacao";
import { MontagemDoTime } from "@/components/MontagemTime";
import { NumberInput } from "@/components/NumberInput";
import { EditorJogada, type RascunhoJogada } from "@/components/JogadaEnsaiada";
import { QuadroTatico, type RascunhoTatica } from "@/components/QuadroTatico";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Aba "Tática e estratégia" — só administrador.
//   Táticas: quadro tático (orientação do time + PDF). NÃO mexe na escalação.
//   Montagem do time: regras que mexem na escalação.
//   Adversário: perfil e sugestão de modelo.
// ---------------------------------------------------------------------------

type PropsAba = {
  partidaId: string;
  formacao: string;
  setFormacao: (v: string) => void;
  composicao: RegraComposicao[];
  setComposicao: (v: RegraComposicao[]) => void;
};

/** Janela para escolher o que vai no PDF: tudo, só o geral ou só um lugar. */
function DialogoPdf({
  tatica,
  catalogo,
  jogadasSalvas,
  aoFechar,
}: {
  tatica: TaticaSalva;
  catalogo: Catalogo;
  jogadasSalvas: JogadaEnsaiada[];
  aoFechar: () => void;
}) {
  const [escolha, setEscolha] = useState("tudo");
  const [gerando, setGerando] = useState(false);
  const lista = lugaresDaFormacao(tatica.plano.formacao);
  const incluidas = jogadasSalvas.filter((j) => (tatica.plano.jogadas ?? []).includes(j.id));

  const gerar = async () => {
    setGerando(true);
    try {
      const escopo: EscopoPdf =
        escolha === "tudo" || escolha === "geral" || escolha === "jogadas"
          ? escolha
          : { lugar: escolha };
      await exportarTaticaPdf({
        nome: tatica.nome,
        descricao: tatica.descricao ?? "",
        plano: tatica.plano,
        catalogo,
        escopo,
        jogadas: incluidas,
      });
      aoFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>PDF da tática “{tatica.nome}”</DialogTitle>
          <DialogDescription>
            O PDF de táticas é separado da escalação: você escolhe se manda ou não. Leva as jogadas
            ensaiadas escolhidas para esta tática, e nada de atributos ou notas dos jogadores.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>O que incluir</Label>
          <Select value={escolha} onValueChange={setEscolha}>
            <SelectTrigger aria-label="O que incluir no PDF">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tudo">
                Tudo: geral{incluidas.length ? " + jogadas ensaiadas" : ""} + uma página por posição
              </SelectItem>
              <SelectItem value="geral">
                Só o geral{incluidas.length ? " e as jogadas" : ""} (para o grupo todo)
              </SelectItem>
              {incluidas.length > 0 && (
                <SelectItem value="jogadas">
                  Só as jogadas ensaiadas ({incluidas.length})
                </SelectItem>
              )}
              {lista.map((l) => (
                <SelectItem key={l} value={l}>
                  Só: {nomeDoLugar(tatica.plano.formacao, l)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={gerar} disabled={gerando}>
          <FileDown className="mr-1 h-4 w-4" /> {gerando ? "Gerando…" : "Baixar PDF"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function lugaresDaFormacao(formacao: string): string[] {
  return Object.keys(layoutDaFormacao(formacao)).filter((l) => l !== "GOL");
}

function SecaoTaticas({
  formacao,
  rascunho,
  setRascunho,
}: {
  formacao: string;
  rascunho: RascunhoTatica | null;
  setRascunho: (r: RascunhoTatica | null) => void;
}) {
  const qc = useQueryClient();
  const { data: catalogo } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  const { data: todas = [] } = useQuery({ queryKey: ["taticas"], queryFn: fetchTaticas });
  // Ignora táticas de versões antigas (sem quadro tático).
  const minhas = todas.filter((t) => t.plano?.formacao);
  const { data: jogadas = [] } = useQuery({ queryKey: ["jogadas"], queryFn: fetchJogadas });
  const [paraPdf, setParaPdf] = useState<TaticaSalva | null>(null);

  const salvar = useMutation({
    mutationFn: (t: RascunhoTatica) => {
      const corpo = { nome: t.nome, descricao: t.descricao || null, plano: t.plano };
      return t.id ? editarTatica(t.id, corpo) : criarTatica(corpo);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taticas"] });
      setRascunho(null);
      toast.success("Tática salva.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => apagarTatica(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taticas"] });
      toast.success("Tática apagada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!catalogo) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  if (rascunho) {
    return (
      <QuadroTatico
        key={rascunho.id ?? "nova"}
        catalogo={catalogo}
        inicial={rascunho}
        jogadas={jogadas}
        aoSalvar={(t) => salvar.mutateAsync(t)}
        aoCancelar={() => setRascunho(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 className="text-base font-semibold">Suas táticas</h3>
          <p className="text-sm text-muted-foreground">
            O quadro tático é a orientação do time para o treino e o jogo: onde cada um se posiciona
            com e sem a bola e o papel de cada um. Ele <strong>não muda a escalação</strong> — e
            gera um PDF separado, para você mandar só se quiser.
          </p>
        </div>
        <Button
          onClick={() => setRascunho({ nome: "", descricao: "", plano: planoVazio(formacao) })}
        >
          <Plus className="mr-1 h-4 w-4" /> Nova tática
        </Button>
      </div>

      {minhas.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Você ainda não criou nenhuma tática. Clique em “Nova tática” ou comece de um modelo
          abaixo.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {minhas.map((t) => (
            <div key={t.id} className="flex gap-3 rounded-xl border bg-card p-3">
              <CampoFormacao
                formacao={t.plano.formacao}
                mini
                className="w-16 shrink-0 self-start"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-display text-xl leading-tight tracking-wide">
                  {t.nome}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.plano.formacao}
                  {t.descricao ? ` · ${t.descricao}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {frasesDoTime(t.plano.time)[3]}
                  {(() => {
                    const n = jogadas.filter((j) => (t.plano.jogadas ?? []).includes(j.id)).length;
                    return n
                      ? ` · ${n} jogada${n === 1 ? "" : "s"} ensaiada${n === 1 ? "" : "s"}`
                      : "";
                  })()}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setRascunho({
                        id: t.id,
                        nome: t.nome,
                        descricao: t.descricao ?? "",
                        plano: t.plano,
                      })
                    }
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setParaPdf(t)}>
                    <FileDown className="mr-1 h-3.5 w-3.5" /> PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Duplicar ${t.nome}`}
                    onClick={() =>
                      setRascunho({
                        nome: `${t.nome} (cópia)`,
                        descricao: t.descricao ?? "",
                        plano: t.plano,
                      })
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Apagar ${t.nome}`}
                    onClick={() => {
                      if (window.confirm(`Apagar a tática “${t.nome}”?`)) apagar.mutate(t.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Modelos prontos
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {catalogo.modelos.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                setRascunho({
                  nome: m.nome,
                  descricao: m.descricao,
                  plano: planoDoModelo(m, formacao),
                })
              }
              className="rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block font-semibold">{m.nome}</span>
              <span className="block text-xs text-muted-foreground">{m.descricao}</span>
            </button>
          ))}
        </div>
      </div>

      {paraPdf && (
        <DialogoPdf
          tatica={paraPdf}
          catalogo={catalogo}
          jogadasSalvas={jogadas}
          aoFechar={() => setParaPdf(null)}
        />
      )}
    </div>
  );
}

function SecaoJogadas({ formacao }: { formacao: string }) {
  const qc = useQueryClient();
  const { data: catalogo } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  const { data: jogadas = [] } = useQuery({ queryKey: ["jogadas"], queryFn: fetchJogadas });
  const [rascunho, setRascunho] = useState<RascunhoJogada | null>(null);

  const salvar = useMutation({
    mutationFn: (j: RascunhoJogada) => {
      const corpo = {
        nome: j.nome,
        descricao: j.descricao || null,
        situacao: j.situacao,
        plano: j.plano,
      };
      return j.id ? editarJogada(j.id, corpo) : criarJogada(corpo);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jogadas"] });
      setRascunho(null);
      toast.success("Jogada salva.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => apagarJogada(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jogadas"] });
      // as táticas guardam só o id; as que usavam esta jogada simplesmente deixam de listá-la
      toast.success("Jogada apagada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!catalogo) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  if (rascunho) {
    return (
      <EditorJogada
        key={rascunho.id ?? "nova"}
        catalogo={catalogo}
        inicial={rascunho}
        aoSalvar={(j) => salvar.mutateAsync(j)}
        aoCancelar={() => setRascunho(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 className="text-base font-semibold">Jogadas ensaiadas</h3>
          <p className="text-sm text-muted-foreground">
            A tática diz como cada um age em geral. A jogada ensaiada é combinada para um momento
            específico: escanteio, falta, saída de bola… Monte passo a passo e depois escolha,
            dentro de cada tática, quais jogadas entram. Elas saem no mesmo PDF da tática.
          </p>
        </div>
        <Button
          onClick={() =>
            setRascunho({
              nome: "",
              descricao: "",
              situacao: "escanteio_ataque",
              plano: jogadaVazia(formacao),
            })
          }
        >
          <Plus className="mr-1 h-4 w-4" /> Nova jogada
        </Button>
      </div>

      {jogadas.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Você ainda não criou nenhuma jogada ensaiada. Clique em “Nova jogada” para começar.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {jogadas.map((j) => (
            <div key={j.id} className="flex gap-3 rounded-xl border bg-card p-3">
              <CampoFormacao
                formacao={j.plano.formacao}
                mini
                className="w-16 shrink-0 self-start"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-display text-xl leading-tight tracking-wide">
                  {j.nome}
                </p>
                <p className="text-xs text-muted-foreground">
                  {SITUACAO_CURTA[j.situacao] ?? j.situacao} · {j.plano.passos.length} passo
                  {j.plano.passos.length === 1 ? "" : "s"}
                  {j.descricao ? ` · ${j.descricao}` : ""}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setRascunho({
                        id: j.id,
                        nome: j.nome,
                        descricao: j.descricao ?? "",
                        situacao: j.situacao,
                        plano: j.plano,
                      })
                    }
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Duplicar ${j.nome}`}
                    onClick={() =>
                      setRascunho({
                        nome: `${j.nome} (cópia)`,
                        descricao: j.descricao ?? "",
                        situacao: j.situacao,
                        plano: j.plano,
                      })
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Apagar ${j.nome}`}
                    onClick={() => {
                      if (window.confirm(`Apagar a jogada “${j.nome}”?`)) apagar.mutate(j.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AbaTatica({
  partidaId,
  formacao,
  setFormacao,
  composicao,
  setComposicao,
}: PropsAba) {
  const { data: catalogo } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  const [aba, setAba] = useState("taticas");
  const [rascunho, setRascunho] = useState<RascunhoTatica | null>(null);
  const [verSugestao, setVerSugestao] = useState(false);
  const sugestao = useQuery({
    queryKey: ["contra-estrategia", partidaId],
    queryFn: () => fetchContraEstrategia(partidaId),
    enabled: verSugestao,
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs value={aba} onValueChange={setAba} className="space-y-5">
          <TabsList>
            <TabsTrigger value="taticas">Táticas</TabsTrigger>
            <TabsTrigger value="jogadas">Jogadas ensaiadas</TabsTrigger>
            <TabsTrigger value="montagem">Montagem do time</TabsTrigger>
            <TabsTrigger value="adversario">Adversário</TabsTrigger>
          </TabsList>

          <TabsContent value="taticas" className="space-y-4">
            <SecaoTaticas formacao={formacao} rascunho={rascunho} setRascunho={setRascunho} />
          </TabsContent>

          <TabsContent value="jogadas">
            <SecaoJogadas formacao={formacao} />
          </TabsContent>

          <TabsContent value="montagem">
            <MontagemDoTime
              formacao={formacao}
              setFormacao={setFormacao}
              composicao={composicao}
              setComposicao={setComposicao}
            />
          </TabsContent>

          <TabsContent value="adversario" className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setVerSugestao(true);
                  if (verSugestao) sugestao.refetch();
                }}
              >
                <Lightbulb className="mr-1 h-4 w-4" /> Sugerir contra o adversário
              </Button>
              {sugestao.isFetching && (
                <span className="text-sm text-muted-foreground">Pensando…</span>
              )}
            </div>
            {sugestao.data?.aviso && (
              <p className="text-sm text-muted-foreground">{sugestao.data.aviso}</p>
            )}
            {sugestao.data?.sugestao && (
              <div className="space-y-2 text-sm">
                <p>
                  Contra <strong>{sugestao.data.adversario}</strong>: modelo{" "}
                  <strong>{sugestao.data.sugestao.tatica_nome}</strong>.
                </p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {sugestao.data.sugestao.motivos.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                {sugestao.data.historico.jogos > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Histórico: {sugestao.data.historico.jogos} jogo(s),{" "}
                    {sugestao.data.historico.vitorias}V {sugestao.data.historico.empates}E{" "}
                    {sugestao.data.historico.derrotas}D, gols {sugestao.data.historico.gols_pro}x
                    {sugestao.data.historico.gols_contra}.
                  </p>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    const m = catalogo?.modelos.find(
                      (x) => x.id === sugestao.data!.sugestao!.tatica,
                    );
                    if (!m) return;
                    setRascunho({
                      nome: `${m.nome} contra ${sugestao.data!.adversario}`,
                      descricao: m.descricao,
                      plano: planoDoModelo(m, formacao),
                    });
                    setAba("taticas");
                  }}
                >
                  Montar tática a partir deste modelo
                </Button>
              </div>
            )}
            <PerfilAdversario
              partidaId={partidaId}
              aoSalvar={() => sugestao.refetch()}
              ativo={verSugestao}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function PerfilAdversario({
  partidaId,
  aoSalvar,
  ativo,
}: {
  partidaId: string;
  aoSalvar: () => void;
  ativo: boolean;
}) {
  const { data: catalogo } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  const { data } = useQuery({
    queryKey: ["contra-estrategia", partidaId],
    queryFn: () => fetchContraEstrategia(partidaId),
    enabled: ativo,
  });
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ ataque: "", meio: "", defesa: "", estilo: "equilibrado", obs: "" });

  useEffect(() => {
    const p = data?.perfil;
    if (p)
      setF({
        ataque: p.ataque ? String(p.ataque) : "",
        meio: p.meio ? String(p.meio) : "",
        defesa: p.defesa ? String(p.defesa) : "",
        estilo: p.estilo ?? "equilibrado",
        obs: p.observacoes ?? "",
      });
  }, [data?.perfil]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarAdversario({
        nome: data?.adversario ?? "",
        ataque: Number(f.ataque) || null,
        meio: Number(f.meio) || null,
        defesa: Number(f.defesa) || null,
        estilo: f.estilo,
        observacoes: f.obs || null,
      } as Adversario),
    onSuccess: () => {
      toast.success("Perfil do adversário salvo.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!ativo || !data) return null;
  return (
    <div className="space-y-3">
      <Button variant="link" className="h-auto p-0" onClick={() => setAberto((v) => !v)}>
        {aberto ? "Esconder" : "Cadastrar/editar"} perfil de {data.adversario}
      </Button>
      {aberto && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Notas de 1 (fraco) a 10 (muito forte).</p>
          <div className="grid gap-3 sm:grid-cols-4">
            {(["ataque", "meio", "defesa"] as const).map((k) => (
              <div key={k} className="space-y-1">
                <Label className="capitalize">{k}</Label>
                <NumberInput
                  value={f[k]}
                  onChange={(v) => setF((s) => ({ ...s, [k]: v }))}
                  min={1}
                  max={10}
                  maxDigits={2}
                  placeholder="—"
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label>Estilo</Label>
              <Select value={f.estilo} onValueChange={(v) => setF((s) => ({ ...s, estilo: v }))}>
                <SelectTrigger aria-label="Estilo do adversário">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalogo?.estilos.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            value={f.obs}
            onChange={(e) => setF((s) => ({ ...s, obs: e.target.value }))}
            placeholder="Observações sobre o adversário (opcional)"
            maxLength={1000}
          />
          <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            <Save className="mr-1 h-4 w-4" /> Salvar perfil
          </Button>
        </div>
      )}
    </div>
  );
}
