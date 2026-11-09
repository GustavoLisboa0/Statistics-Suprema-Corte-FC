import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Lightbulb, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

import {
  FUNCAO_LABELS,
  fetchCatalogo,
  fetchContraEstrategia,
  salvarAdversario,
  type Adversario,
  type Funcao,
  type RegraComposicao,
} from "@/lib/escalacao";
import { CampoFormacao } from "@/components/CampoFormacao";
import { SeletorFormacao } from "@/components/EscalacaoControles";
import { NumberInput } from "@/components/NumberInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Aba "Tática e estratégia" — só administrador.
// Nada daqui entra no PDF nem aparece para usuário comum.
// ---------------------------------------------------------------------------

type PropsAba = {
  partidaId: string;
  formacao: string;
  setFormacao: (v: string) => void;
  tatica: string | null;
  setTatica: (v: string | null) => void;
  estrategia: string;
  setEstrategia: (v: string) => void;
  forca: number;
  setForca: (v: number) => void;
  composicao: RegraComposicao[];
  setComposicao: (v: RegraComposicao[]) => void;
};

/** Pílulas de escolha (uma só selecionada). */
function Pilulas({
  opcoes,
  valor,
  onChange,
  desabilitado,
  rotulo,
}: {
  opcoes: { id: string; nome: string }[];
  valor: string;
  onChange: (v: string) => void;
  desabilitado?: boolean;
  rotulo: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          disabled={desabilitado}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
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

export function AbaTatica({
  partidaId,
  formacao,
  setFormacao,
  tatica,
  setTatica,
  estrategia,
  setEstrategia,
  forca,
  setForca,
  composicao,
  setComposicao,
}: PropsAba) {
  const { data: catalogo } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  const [verSugestao, setVerSugestao] = useState(false);
  const sugestao = useQuery({
    queryKey: ["contra-estrategia", partidaId],
    queryFn: () => fetchContraEstrategia(partidaId),
    enabled: verSugestao,
  });
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [setor, setSetor] = useState<Funcao | null>(null);

  const taticaAtual = catalogo?.taticas.find((t) => t.id === tatica);
  const estrategiaAtual = catalogo?.estrategias.find((e) => e.id === estrategia);
  const comRegra = new Set(composicao.map((r) => r.funcao as string));

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-3">
          <Label className="text-base">Tática</Label>
          <Pilulas
            rotulo="Tática"
            valor={tatica ?? "nenhuma"}
            onChange={(v) => setTatica(v === "nenhuma" ? null : v)}
            opcoes={[
              { id: "nenhuma", nome: "Sem tática" },
              ...(catalogo?.taticas.map((t) => ({ id: t.id, nome: t.nome })) ?? []),
            ]}
          />
          <p className="min-h-5 text-sm text-muted-foreground">
            {taticaAtual
              ? taticaAtual.descricao
              : "Sem tática, o sistema só se preocupa em dividir o tempo igual."}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Label className="text-base">Estratégia (quando os melhores jogam)</Label>
            <Pilulas
              rotulo="Estratégia"
              valor={estrategia}
              onChange={setEstrategia}
              desabilitado={!tatica}
              opcoes={catalogo?.estrategias.map((e) => ({ id: e.id, nome: e.nome })) ?? []}
            />
            {estrategiaAtual && tatica && (
              <p className="text-sm text-muted-foreground">{estrategiaAtual.descricao}</p>
            )}
          </div>
          <div className="space-y-3">
            <Label className="text-base">Quanto a tática pesa: {forca}%</Label>
            <Slider
              min={10}
              max={100}
              step={10}
              value={[forca]}
              onValueChange={(v) => setForca(v[0])}
              disabled={!tatica}
              aria-label="Quanto a tática pesa"
            />
            <p className="text-xs text-muted-foreground">
              Quanto mais peso, mais a tática manda em quem joga onde. O tempo igual continua
              valendo.
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
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
                As regras são preferências: o sistema tenta respeitar, mas o tempo igual para todos
                continua mandando. Dependem dos atributos e características preenchidos na aba
                Jogadores.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setVerSugestao(true)}>
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
                <strong>{sugestao.data.sugestao.tatica_nome}</strong>, estratégia{" "}
                <strong>{sugestao.data.sugestao.estrategia_nome}</strong>.
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
                  setEstrategia(sugestao.data!.sugestao!.estrategia);
                  toast.success("Sugestão aplicada. Volte e clique em Gerar.");
                }}
              >
                Usar esta sugestão
              </Button>
            </div>
          )}
          <PerfilAdversario
            partidaId={partidaId}
            aoSalvar={() => sugestao.refetch()}
            ativo={verSugestao}
          />
        </div>
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
