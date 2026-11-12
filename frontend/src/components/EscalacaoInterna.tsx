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
import { Aba, ListaDeAbas } from "@/components/EscalacaoControles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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

/** Botão de ação dentro dos cartões de tática/jogada (alvo de 44px). */
const BOTAO_CARTAO = "min-h-11 rounded-[10px] bg-card";

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
            <SelectTrigger aria-label="O que incluir no PDF" className="h-11">
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
        <Button onClick={gerar} disabled={gerando} className="min-h-11 rounded-[10px] font-bold">
          <FileDown aria-hidden="true" /> {gerando ? "Gerando…" : "Baixar PDF"}
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
          <h3 className="text-[15px] leading-tight">Suas táticas</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            O quadro tático é a orientação do time para o treino e o jogo: onde cada um se posiciona
            com e sem a bola e o papel de cada um. Ele <strong>não muda a escalação</strong> — e
            gera um PDF separado, para você mandar só se quiser.
          </p>
        </div>
        <Button
          className="min-h-11 rounded-[10px] font-bold"
          onClick={() => setRascunho({ nome: "", descricao: "", plano: planoVazio(formacao) })}
        >
          <Plus aria-hidden="true" /> Nova tática
        </Button>
      </div>

      {minhas.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-raised p-6 text-center text-sm text-muted-foreground">
          Você ainda não criou nenhuma tática. Clique em “Nova tática” ou comece de um modelo
          abaixo.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {minhas.map((t) => (
            <div key={t.id} className="flex gap-3 rounded-xl border bg-raised p-3.5">
              <CampoFormacao
                formacao={t.plano.formacao}
                mini
                className="w-16 shrink-0 self-start"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-base font-bold leading-tight">{t.nome}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="num text-sm text-primary">{t.plano.formacao}</span>
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
                    variant="outline"
                    className={BOTAO_CARTAO}
                    onClick={() =>
                      setRascunho({
                        id: t.id,
                        nome: t.nome,
                        descricao: t.descricao ?? "",
                        plano: t.plano,
                      })
                    }
                  >
                    <Pencil aria-hidden="true" /> Editar
                  </Button>
                  <Button variant="outline" className={BOTAO_CARTAO} onClick={() => setParaPdf(t)}>
                    <FileDown aria-hidden="true" /> PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    aria-label={`Duplicar ${t.nome}`}
                    onClick={() =>
                      setRascunho({
                        nome: `${t.nome} (cópia)`,
                        descricao: t.descricao ?? "",
                        plano: t.plano,
                      })
                    }
                  >
                    <Copy aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    aria-label={`Apagar ${t.nome}`}
                    onClick={() => {
                      if (window.confirm(`Apagar a tática “${t.nome}”?`)) apagar.mutate(t.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-[13px] leading-tight text-muted-foreground">Modelos prontos</h3>
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
              className="min-h-11 rounded-xl border bg-raised p-3.5 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <h3 className="text-[15px] leading-tight">Jogadas ensaiadas</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            A tática diz como cada um age em geral. A jogada ensaiada é combinada para um momento
            específico: escanteio, falta, saída de bola… Monte passo a passo e depois escolha,
            dentro de cada tática, quais jogadas entram. Elas saem no mesmo PDF da tática.
          </p>
        </div>
        <Button
          className="min-h-11 rounded-[10px] font-bold"
          onClick={() =>
            setRascunho({
              nome: "",
              descricao: "",
              situacao: "escanteio_ataque",
              plano: jogadaVazia(formacao),
            })
          }
        >
          <Plus aria-hidden="true" /> Nova jogada
        </Button>
      </div>

      {jogadas.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-raised p-6 text-center text-sm text-muted-foreground">
          Você ainda não criou nenhuma jogada ensaiada. Clique em “Nova jogada” para começar.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {jogadas.map((j) => (
            <div key={j.id} className="flex gap-3 rounded-xl border bg-raised p-3.5">
              <CampoFormacao
                formacao={j.plano.formacao}
                mini
                className="w-16 shrink-0 self-start"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-base font-bold leading-tight">{j.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {SITUACAO_CURTA[j.situacao] ?? j.situacao} · {j.plano.passos.length} passo
                  {j.plano.passos.length === 1 ? "" : "s"}
                  {j.descricao ? ` · ${j.descricao}` : ""}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  <Button
                    variant="outline"
                    className={BOTAO_CARTAO}
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
                    <Pencil aria-hidden="true" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
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
                    <Copy aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    aria-label={`Apagar ${j.nome}`}
                    onClick={() => {
                      if (window.confirm(`Apagar a jogada “${j.nome}”?`)) apagar.mutate(j.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
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
    <div className="rounded-2xl border bg-card p-5 md:p-6">
      <Tabs value={aba} onValueChange={setAba} className="space-y-6">
        <ListaDeAbas aria-label="Tática e estratégia">
          <Aba value="taticas">Táticas</Aba>
          <Aba value="jogadas">Jogadas ensaiadas</Aba>
          <Aba value="montagem">Montagem do time</Aba>
          <Aba value="adversario">Adversário</Aba>
        </ListaDeAbas>

        <TabsContent value="taticas" className="mt-0 space-y-4">
          <SecaoTaticas formacao={formacao} rascunho={rascunho} setRascunho={setRascunho} />
        </TabsContent>

        <TabsContent value="jogadas" className="mt-0">
          <SecaoJogadas formacao={formacao} />
        </TabsContent>

        <TabsContent value="montagem" className="mt-0">
          <MontagemDoTime
            formacao={formacao}
            setFormacao={setFormacao}
            composicao={composicao}
            setComposicao={setComposicao}
          />
        </TabsContent>

        <TabsContent value="adversario" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              className="min-h-11 rounded-[10px]"
              onClick={() => {
                setVerSugestao(true);
                if (verSugestao) sugestao.refetch();
              }}
            >
              <Lightbulb aria-hidden="true" /> Sugerir contra o adversário
            </Button>
            {sugestao.isFetching && (
              <span className="text-sm text-muted-foreground">Pensando…</span>
            )}
          </div>
          {sugestao.data?.aviso && (
            <p className="text-sm text-muted-foreground">{sugestao.data.aviso}</p>
          )}
          {sugestao.data?.sugestao && (
            <div className="space-y-3 rounded-xl border bg-raised p-4 text-sm">
              <p>
                Contra <strong>{sugestao.data.adversario}</strong>: modelo{" "}
                <strong className="text-primary">{sugestao.data.sugestao.tatica_nome}</strong>.
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
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
                className="min-h-11 rounded-[10px] font-bold"
                onClick={() => {
                  const m = catalogo?.modelos.find((x) => x.id === sugestao.data!.sugestao!.tatica);
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
    </div>
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
      <Button
        variant="outline"
        className="min-h-11 rounded-[10px] bg-card"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
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
                <SelectTrigger aria-label="Estilo do adversário" className="h-11">
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
          <Button
            className="min-h-11 rounded-[10px] font-bold"
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending}
          >
            <Save aria-hidden="true" /> Salvar perfil
          </Button>
        </div>
      )}
    </div>
  );
}
