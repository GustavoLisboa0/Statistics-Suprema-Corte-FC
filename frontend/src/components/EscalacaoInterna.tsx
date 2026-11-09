import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Lightbulb, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  FUNCAO_LABELS,
  FUNCOES,
  apagarTatica,
  criarTatica,
  editarTatica,
  fetchCatalogo,
  fetchContraEstrategia,
  fetchTaticas,
  salvarAdversario,
  type Adversario,
  type Catalogo,
  type Funcao,
  type Instrucoes,
  type RegraComposicao,
} from "@/lib/escalacao";
import { CampoFormacao } from "@/components/CampoFormacao";
import { SeletorFormacao } from "@/components/EscalacaoControles";
import { NumberInput } from "@/components/NumberInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Aba "Tática e estratégia" — só administrador.
// Nada daqui entra no PDF (só o nome da tática) nem aparece para usuário comum.
// ---------------------------------------------------------------------------

type PropsAba = {
  partidaId: string;
  formacao: string;
  setFormacao: (v: string) => void;
  tatica: string | null;
  setTatica: (v: string | null) => void;
  composicao: RegraComposicao[];
  setComposicao: (v: RegraComposicao[]) => void;
};

/** Pílulas de escolha (uma só selecionada). */
function Pilulas({
  opcoes,
  valor,
  onChange,
  rotulo,
  pequeno,
}: {
  opcoes: { id: string; nome: string }[];
  valor: string;
  onChange: (v: string) => void;
  rotulo: string;
  pequeno?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            pequeno ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
            valor === o.id
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card hover:border-primary",
          )}
        >
          {o.nome}
        </button>
      ))}
    </div>
  );
}

const CURTO: Record<string, string> = {
  fica: "fica",
  sobe: "sobe",
  apoia: "apoia",
  recua: "recua",
  pressiona: "pressiona",
  abre: "abre",
  fecha: "fecha",
  infiltra: "infiltra",
};

/** Palavra que resume o que a posição faz (a mais repetida entre as situações). */
function resumoDaFuncao(instr: Record<string, string> | undefined): string | null {
  const valores = Object.values(instr ?? {});
  if (valores.length === 0) return null;
  const contagem = new Map<string, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  const [melhor] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  return CURTO[melhor] ?? melhor;
}

// ---------------------------------------------------------------------------
// Montador de táticas: clique no jogador no campinho e diga o que ele faz
// em cada situação do jogo (como no FIFA / eFootball).
// ---------------------------------------------------------------------------
function ConstrutorTatica({
  formacao,
  catalogo,
  inicial,
  aoSalvar,
  aoCancelar,
}: {
  formacao: string;
  catalogo: Catalogo;
  inicial: { id?: string; nome: string; descricao: string; instrucoes: Instrucoes };
  aoSalvar: (t: { id?: string; nome: string; descricao: string; instrucoes: Instrucoes }) => void;
  aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [instrucoes, setInstrucoes] = useState<Instrucoes>(inicial.instrucoes);
  const [funcao, setFuncao] = useState<Funcao | null>("LAT");
  const [salvando, setSalvando] = useState(false);

  const marcas = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of FUNCOES) {
      const r = resumoDaFuncao(instrucoes[f]);
      if (r) m[f] = r;
    }
    return m;
  }, [instrucoes]);
  const comInstrucao = useMemo(() => new Set<string>(Object.keys(marcas)), [marcas]);

  const mudar = (f: Funcao, situacao: string, comportamento: string) =>
    setInstrucoes((atual) => {
      const dessa = { ...(atual[f] ?? {}) };
      if (comportamento === "fica") delete dessa[situacao];
      else dessa[situacao] = comportamento;
      const novo = { ...atual, [f]: dessa };
      if (Object.keys(dessa).length === 0) delete novo[f];
      return novo;
    });

  const nomeComp = (id: string) => catalogo.comportamentos.find((c) => c.id === id)?.nome ?? id;

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Dê um nome para a tática.");
      return;
    }
    setSalvando(true);
    try {
      await aoSalvar({ id: inicial.id, nome: nome.trim(), descricao, instrucoes });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="nome-tatica">Nome da tática</Label>
          <Input
            id="nome-tatica"
            value={nome}
            maxLength={60}
            placeholder="Ex.: Laterais voando"
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="desc-tatica">Ideia da tática (opcional)</Label>
          <Input
            id="desc-tatica"
            value={descricao}
            maxLength={300}
            placeholder="Ex.: Laterais sobem e os volantes protegem"
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,300px)_1fr]">
        <div className="space-y-2">
          <CampoFormacao
            formacao={formacao}
            comRegra={comInstrucao}
            marcas={marcas}
            selecionada={funcao}
            onClickFuncao={setFuncao}
            className="w-full max-w-[300px] justify-self-center"
          />
          <p className="text-center text-xs text-muted-foreground">
            Clique em um jogador do campinho. Contorno dourado = já tem instrução.
          </p>
        </div>

        <div className="space-y-3">
          {funcao ? (
            <>
              <div className="flex items-center justify-between">
                <p className="font-semibold">
                  {FUNCAO_LABELS[funcao]}s — o que fazem em cada momento
                </p>
                {instrucoes[funcao] && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setInstrucoes((a) => {
                        const n = { ...a };
                        delete n[funcao];
                        return n;
                      })
                    }
                  >
                    Limpar
                  </Button>
                )}
              </div>
              <div className="space-y-3">
                {catalogo.situacoes.map((s) => (
                  <div key={s.id} className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {s.nome}
                    </p>
                    <Pilulas
                      pequeno
                      rotulo={`${FUNCAO_LABELS[funcao]} — ${s.nome}`}
                      valor={instrucoes[funcao]?.[s.id] ?? "fica"}
                      onChange={(v) => mudar(funcao, s.id, v)}
                      opcoes={(catalogo.comportamentos_por_funcao[funcao] ?? ["fica"]).map(
                        (id) => ({
                          id,
                          nome: nomeComp(id),
                        }),
                      )}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Vale para todos os {FUNCAO_LABELS[funcao].toLowerCase()}s do time. O sistema usa
                isso para preferir quem combina com a tática — sempre que possível. O tempo igual
                para todos continua mandando.
              </p>
            </>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Escolha uma posição no campinho.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={salvar} disabled={salvando}>
          <Save className="mr-1 h-4 w-4" /> {inicial.id ? "Salvar alterações" : "Salvar tática"}
        </Button>
        <Button variant="outline" onClick={aoCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** Texto curto com o que a tática manda fazer (para a lista). */
function ResumoTatica({ instrucoes, catalogo }: { instrucoes: Instrucoes; catalogo: Catalogo }) {
  const linhas = FUNCOES.flatMap((f) => {
    const entradas = Object.entries(instrucoes[f] ?? {});
    if (entradas.length === 0) return [];
    const nomeSit = (id: string) => catalogo.situacoes.find((s) => s.id === id)?.nome ?? id;
    return [
      <li key={f}>
        <strong>{FUNCAO_LABELS[f]}s:</strong>{" "}
        {entradas.map(([s, c]) => `${CURTO[c] ?? c} (${nomeSit(s).toLowerCase()})`).join(", ")}
      </li>,
    ];
  });
  if (linhas.length === 0)
    return <p className="text-sm text-muted-foreground">Sem instruções: todo mundo na posição.</p>;
  return <ul className="space-y-0.5 text-sm text-muted-foreground">{linhas}</ul>;
}

function SecaoTaticas({
  tatica,
  setTatica,
  formacao,
}: {
  tatica: string | null;
  setTatica: (v: string | null) => void;
  formacao: string;
}) {
  const qc = useQueryClient();
  const { data: catalogo } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  const { data: minhas = [] } = useQuery({ queryKey: ["taticas"], queryFn: fetchTaticas });
  const [editando, setEditando] = useState<null | {
    id?: string;
    nome: string;
    descricao: string;
    instrucoes: Instrucoes;
  }>(null);

  const salvar = useMutation({
    mutationFn: (t: { id?: string; nome: string; descricao: string; instrucoes: Instrucoes }) => {
      const corpo = { nome: t.nome, descricao: t.descricao || null, instrucoes: t.instrucoes };
      return t.id ? editarTatica(t.id, corpo) : criarTatica(corpo);
    },
    onSuccess: (salva) => {
      qc.invalidateQueries({ queryKey: ["taticas"] });
      setTatica(salva.id);
      setEditando(null);
      toast.success("Tática salva e escolhida para este jogo.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => apagarTatica(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["taticas"] });
      if (tatica === id) setTatica(null);
      setEditando(null);
      toast.success("Tática apagada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!catalogo) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const minha = minhas.find((t) => t.id === tatica);
  const modelo = catalogo.modelos.find((m) => m.id === tatica);
  const atual = minha ?? modelo;
  const instrucoesAtuais: Instrucoes = (minha?.instrucoes ??
    modelo?.instrucoes ??
    {}) as Instrucoes;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-base">Tática deste jogo</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={tatica ?? "nenhuma"}
            onValueChange={(v) => {
              setEditando(null);
              setTatica(v === "nenhuma" ? null : v);
            }}
          >
            <SelectTrigger className="w-full sm:w-72" aria-label="Tática deste jogo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhuma">Sem tática</SelectItem>
              {minhas.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Minhas táticas</SelectLabel>
                  {minhas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              <SelectGroup>
                <SelectLabel>Modelos prontos</SelectLabel>
                {catalogo.modelos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            onClick={() => setEditando({ nome: "", descricao: "", instrucoes: {} })}
          >
            <Plus className="mr-1 h-4 w-4" /> Nova tática
          </Button>
          {minha && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  setEditando({
                    id: minha.id,
                    nome: minha.nome,
                    descricao: minha.descricao ?? "",
                    instrucoes: minha.instrucoes,
                  })
                }
              >
                <Pencil className="mr-1 h-4 w-4" /> Editar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (window.confirm(`Apagar a tática “${minha.nome}”?`)) apagar.mutate(minha.id);
                }}
                aria-label="Apagar tática"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          {modelo && (
            <Button
              variant="outline"
              onClick={() =>
                setEditando({
                  nome: `${modelo.nome} (minha)`,
                  descricao: modelo.descricao,
                  instrucoes: modelo.instrucoes as Instrucoes,
                })
              }
            >
              <Copy className="mr-1 h-4 w-4" /> Copiar para editar
            </Button>
          )}
        </div>
        {!editando && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {atual
                ? atual.descricao || "Tática sem descrição."
                : "Sem tática, o sistema só se preocupa em dividir o tempo igual."}
            </p>
            {atual && <ResumoTatica instrucoes={instrucoesAtuais} catalogo={catalogo} />}
          </div>
        )}
      </div>

      {editando && (
        <ConstrutorTatica
          key={editando.id ?? "nova"}
          formacao={formacao}
          catalogo={catalogo}
          inicial={editando}
          aoSalvar={(t) => salvar.mutateAsync(t)}
          aoCancelar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

export function AbaTatica({
  partidaId,
  formacao,
  setFormacao,
  tatica,
  setTatica,
  composicao,
  setComposicao,
}: PropsAba) {
  const [verSugestao, setVerSugestao] = useState(false);
  const sugestao = useQuery({
    queryKey: ["contra-estrategia", partidaId],
    queryFn: () => fetchContraEstrategia(partidaId),
    enabled: verSugestao,
  });
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [setor, setSetor] = useState<Funcao | null>(null);
  const comRegra = new Set(composicao.map((r) => r.funcao as string));

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs defaultValue="taticas" className="space-y-5">
          <TabsList>
            <TabsTrigger value="taticas">Táticas</TabsTrigger>
            <TabsTrigger value="montagem">Montagem do time</TabsTrigger>
            <TabsTrigger value="adversario">Adversário</TabsTrigger>
          </TabsList>

          <TabsContent value="taticas" className="space-y-4">
            <SecaoTaticas tatica={tatica} setTatica={setTatica} formacao={formacao} />
          </TabsContent>

          <TabsContent value="montagem" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label className="text-base">Montagem do time</Label>
                <p className="text-sm text-muted-foreground">
                  Clique em uma bolinha para definir como aquele setor deve ser formado (ex.: um
                  volante rápido e um lento).
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSeletorAberto(true)}>
                Formação: {formacao}
              </Button>
            </div>
            <SeletorFormacao
              aberto={seletorAberto}
              onAbertoChange={setSeletorAberto}
              valor={formacao}
              onEscolher={setFormacao}
            />

            <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
              <CampoFormacao
                formacao={formacao}
                comRegra={comRegra}
                selecionada={setor}
                onClickFuncao={setSetor}
                className="w-full max-w-xs justify-self-center"
              />
              <div className="space-y-4">
                {setor ? (
                  <EditorRegra
                    setor={setor}
                    regras={composicao}
                    setRegras={setComposicao}
                    aoFechar={() => setSetor(null)}
                  />
                ) : (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    Escolha um setor no campinho para editar as regras dele. Bolinhas com contorno
                    dourado já têm regra.
                  </p>
                )}
                <ListaRegras regras={composicao} setRegras={setComposicao} />
                <p className="text-xs text-muted-foreground">
                  As regras são preferências: o sistema tenta respeitar, mas o tempo igual para
                  todos continua mandando. Dependem dos atributos e características preenchidos na
                  aba Jogadores.
                </p>
              </div>
            </div>
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
                  Contra <strong>{sugestao.data.adversario}</strong>: tática{" "}
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
                    setTatica(sugestao.data!.sugestao!.tatica);
                    toast.success("Modelo aplicado. Veja na aba Táticas e depois clique em Gerar.");
                  }}
                >
                  Usar o modelo “{sugestao.data.sugestao.tatica_nome}”
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

function useNomes() {
  const { data: c } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  return {
    c,
    chave: (r: RegraComposicao) =>
      (r.tipo === "atributo" ? c?.atributos : c?.caracteristicas)?.find((a) => a.id === r.chave)
        ?.nome ?? r.chave,
    modo: (r: RegraComposicao) =>
      (r.tipo === "atributo" ? c?.modos_atributo : c?.modos_caracteristica)?.find(
        (m) => m.id === r.modo,
      )?.nome ?? r.modo,
  };
}

function ListaRegras({
  regras,
  setRegras,
}: {
  regras: RegraComposicao[];
  setRegras: (v: RegraComposicao[]) => void;
}) {
  const n = useNomes();
  if (regras.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhuma regra definida.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {regras.map((r, i) => (
        <Badge key={i} variant="secondary" className="gap-1 py-1">
          {FUNCAO_LABELS[r.funcao]}s · {n.chave(r)}: {n.modo(r)}
          <button
            type="button"
            aria-label="Remover regra"
            onClick={() => setRegras(regras.filter((_, k) => k !== i))}
            className="rounded-full hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

/** Editor da regra do setor clicado no campinho. */
function EditorRegra({
  setor,
  regras,
  setRegras,
  aoFechar,
}: {
  setor: Funcao;
  regras: RegraComposicao[];
  setRegras: (v: RegraComposicao[]) => void;
  aoFechar: () => void;
}) {
  const n = useNomes();
  const [tipo, setTipo] = useState<"atributo" | "carac">("atributo");
  const [chave, setChave] = useState("pace");
  const [modo, setModo] = useState("misto");

  const mudarTipo = (t: "atributo" | "carac") => {
    setTipo(t);
    setChave(t === "atributo" ? "pace" : (n.c?.caracteristicas[0]?.id ?? "canhoto"));
    setModo(t === "atributo" ? "misto" : "pelo_menos_um");
  };
  const adicionar = () => {
    const nova: RegraComposicao = { funcao: setor, tipo, chave, modo };
    if (regras.some((r) => JSON.stringify(r) === JSON.stringify(nova))) return;
    setRegras([...regras, nova]);
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{FUNCAO_LABELS[setor]}s</p>
        <Button variant="ghost" size="icon" onClick={aoFechar} aria-label="Fechar editor">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Baseada em</Label>
          <Select value={tipo} onValueChange={(v) => mudarTipo(v as "atributo" | "carac")}>
            <SelectTrigger aria-label="Tipo de regra">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="atributo">Um atributo</SelectItem>
              <SelectItem value="carac">Uma característica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{tipo === "atributo" ? "Atributo" : "Característica"}</Label>
          <Select value={chave} onValueChange={setChave}>
            <SelectTrigger aria-label="Atributo ou característica">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(tipo === "atributo" ? n.c?.atributos : n.c?.caracteristicas)?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Como</Label>
          <Select value={modo} onValueChange={setModo}>
            <SelectTrigger aria-label="Modo da regra">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(tipo === "atributo" ? n.c?.modos_atributo : n.c?.modos_caracteristica)?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button size="sm" onClick={adicionar}>
        <Plus className="mr-1 h-4 w-4" /> Adicionar regra
      </Button>
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
