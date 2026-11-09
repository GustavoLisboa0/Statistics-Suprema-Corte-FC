import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  FORMACOES,
  FUNCAO_LABELS,
  FUNCOES,
  fetchCatalogo,
  fetchSugestaoFormacao,
  type Funcao,
  type RegraComposicao,
} from "@/lib/escalacao";
import { NumberInput } from "@/components/NumberInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Controles do administrador: formação, trocas, regras de composição.
// ---------------------------------------------------------------------------

export type MudancaFormacaoForm = { minuto: string; formacao: string };

export function CartaoFormacao({
  formacao,
  setFormacao,
  mudancas,
  setMudancas,
  tatica,
  duracao,
}: {
  formacao: string;
  setFormacao: (v: string) => void;
  mudancas: MudancaFormacaoForm[];
  setMudancas: (v: MudancaFormacaoForm[]) => void;
  tatica: string | null;
  duracao: number;
}) {
  const [buscando, setBuscando] = useState(false);

  const sugerir = async () => {
    setBuscando(true);
    try {
      const s = await fetchSugestaoFormacao(tatica ?? "equilibrada", duracao);
      setFormacao(s.formacao);
      setMudancas(s.mudancas.map((m) => ({ minuto: String(m.minuto), formacao: m.formacao })));
      toast.success(s.motivo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível sugerir");
    } finally {
      setBuscando(false);
    }
  };

  const nomes = Object.keys(FORMACOES);
  const mudar = (i: number, parte: Partial<MudancaFormacaoForm>) =>
    setMudancas(mudancas.map((m, k) => (k === i ? { ...m, ...parte } : m)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Formação</CardTitle>
        <p className="text-sm text-muted-foreground">
          Escolha como o time começa e, se quiser, em que minuto ele muda de formação (ex.: começa
          no 4-4-2 e aos 60' vai para o 4-5-1).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Formação inicial</Label>
            <Select value={formacao} onValueChange={setFormacao}>
              <SelectTrigger className="w-40" aria-label="Formação inicial">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {nomes.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="secondary" size="sm" onClick={sugerir} disabled={buscando}>
            <Lightbulb className="mr-1 h-4 w-4" />
            {buscando ? "Pensando…" : "Sugerir formação"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setMudancas([
                ...mudancas,
                { minuto: String(Math.round(duracao * 0.67)), formacao: nomes[0] },
              ])
            }
            disabled={mudancas.length >= 3}
          >
            <Plus className="mr-1 h-4 w-4" /> Mudar de formação durante o jogo
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A sugestão usa a tática escolhida abaixo ({tatica ? "a que você marcou" : "equilibrada"}).
        </p>

        {mudancas.map((m, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor={`mud-min-${i}`}>No minuto</Label>
              <NumberInput
                id={`mud-min-${i}`}
                value={m.minuto}
                onChange={(v) => mudar(i, { minuto: v })}
                min={1}
                max={duracao - 1}
                className="w-24"
              />
            </div>
            <div className="space-y-1">
              <Label>Passa para</Label>
              <Select value={m.formacao} onValueChange={(v) => mudar(i, { formacao: v })}>
                <SelectTrigger className="w-40" aria-label="Nova formação">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nomes.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remover mudança de formação"
              onClick={() => setMudancas(mudancas.filter((_, k) => k !== i))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export type ControleTrocas = {
  intervalo: string;
  tolerancia: string;
  maxMomentos: string;
  maxPorVez: string;
  fixos: string;
};

/** Quanto o computador pode mexer nas trocas (só aparece no modo automático). */
export function CamposTrocas({
  valores,
  setValores,
}: {
  valores: ControleTrocas;
  setValores: (v: ControleTrocas) => void;
}) {
  const campo = (k: keyof ControleTrocas, v: string) => setValores({ ...valores, [k]: v });
  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">Ajustes das trocas (opcional)</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="fixos">Jogadores que não saem</Label>
          <NumberInput
            id="fixos"
            value={valores.fixos}
            onChange={(v) => campo("fixos", v)}
            min={0}
            max={5}
          />
          <p className="text-xs text-muted-foreground">
            Jogam o jogo todo. Com isso há menos trocas e elas ficam mais fáceis.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="maxmom">Máximo de momentos de troca</Label>
          <NumberInput
            id="maxmom"
            value={valores.maxMomentos}
            onChange={(v) => campo("maxMomentos", v)}
            min={0}
            max={20}
            placeholder="Sem limite"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="maxvez">Máximo de jogadores por troca</Label>
          <NumberInput
            id="maxvez"
            value={valores.maxPorVez}
            onChange={(v) => campo("maxPorVez", v)}
            min={1}
            max={10}
            placeholder="Sem limite"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intervalo">Minutos mínimos entre trocas</Label>
          <NumberInput
            id="intervalo"
            value={valores.intervalo}
            onChange={(v) => campo("intervalo", v)}
            min={3}
            max={45}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tolerancia">Diferença de tempo aceita (min)</Label>
          <NumberInput
            id="tolerancia"
            value={valores.tolerancia}
            onChange={(v) => campo("tolerancia", v)}
            min={0}
            max={30}
          />
          <p className="text-xs text-muted-foreground">
            Quanto um jogador pode jogar a mais que outro. 0 = tempo exatamente igual.
          </p>
        </div>
      </div>
    </div>
  );
}

const CARACS_MODO_PADRAO = "pelo_menos_um";

/** Regras de composição: ex. "nos volantes, um rápido e um lento". */
export function CartaoComposicao({
  regras,
  setRegras,
}: {
  regras: RegraComposicao[];
  setRegras: (v: RegraComposicao[]) => void;
}) {
  const { data: catalogo } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  const [nova, setNova] = useState<RegraComposicao>({
    funcao: "VOL",
    tipo: "atributo",
    chave: "pace",
    modo: "misto",
  });

  const nomeAtributo = (id: string) => catalogo?.atributos.find((a) => a.id === id)?.nome ?? id;
  const nomeCarac = (id: string) => catalogo?.caracteristicas.find((a) => a.id === id)?.nome ?? id;
  const nomeModo = (r: RegraComposicao) =>
    (r.tipo === "atributo" ? catalogo?.modos_atributo : catalogo?.modos_caracteristica)?.find(
      (m) => m.id === r.modo,
    )?.nome ?? r.modo;

  const mudarTipo = (tipo: "atributo" | "carac") =>
    setNova({
      ...nova,
      tipo,
      chave: tipo === "atributo" ? "pace" : (catalogo?.caracteristicas[0]?.id ?? "canhoto"),
      modo: tipo === "atributo" ? "misto" : CARACS_MODO_PADRAO,
    });

  const adicionar = () => {
    if (regras.some((r) => JSON.stringify(r) === JSON.stringify(nova))) return;
    setRegras([...regras, nova]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Regras de composição <Badge variant="outline">só administrador</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Defina como cada setor deve ser formado. Exemplo: nos volantes, “um com mais velocidade e
          outro com menos”, ou “dois canhotos nos zagueiros”. Quem tem atributos e características
          preenchidos na aba Jogadores entra na conta. São <strong>preferências</strong>: o sistema
          tenta respeitar, mas o tempo igual para todos continua mandando.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Setor</Label>
            <Select
              value={nova.funcao}
              onValueChange={(v) => setNova({ ...nova, funcao: v as Funcao })}
            >
              <SelectTrigger className="w-40" aria-label="Setor da regra">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUNCOES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FUNCAO_LABELS[f]}s
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Baseada em</Label>
            <Select value={nova.tipo} onValueChange={(v) => mudarTipo(v as "atributo" | "carac")}>
              <SelectTrigger className="w-44" aria-label="Tipo de regra">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="atributo">Um atributo (nota)</SelectItem>
                <SelectItem value="carac">Uma característica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{nova.tipo === "atributo" ? "Atributo" : "Característica"}</Label>
            <Select value={nova.chave} onValueChange={(v) => setNova({ ...nova, chave: v })}>
              <SelectTrigger className="w-44" aria-label="Atributo ou característica">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(nova.tipo === "atributo" ? catalogo?.atributos : catalogo?.caracteristicas)?.map(
                  (a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Como</Label>
            <Select value={nova.modo} onValueChange={(v) => setNova({ ...nova, modo: v })}>
              <SelectTrigger className="w-64" aria-label="Modo da regra">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(nova.tipo === "atributo"
                  ? catalogo?.modos_atributo
                  : catalogo?.modos_caracteristica
                )?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="secondary" onClick={adicionar}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar regra
          </Button>
        </div>

        {regras.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma regra: o sistema não se preocupa com isso.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {regras.map((r, i) => (
              <Badge key={i} variant="secondary" className="gap-1 py-1">
                {FUNCAO_LABELS[r.funcao]}s ·{" "}
                {r.tipo === "atributo" ? nomeAtributo(r.chave) : nomeCarac(r.chave)}: {nomeModo(r)}
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
        )}
      </CardContent>
    </Card>
  );
}

/** Mostra, em linguagem simples, as contas que o sistema faz (transparência). */
export function CartaoComoFunciona() {
  const [aberto, setAberto] = useState(false);
  const { data: c } = useQuery({
    queryKey: ["escalacao-catalogo"],
    queryFn: fetchCatalogo,
    enabled: aberto,
  });
  const nomeAttr = (id: string) => c?.atributos.find((a) => a.id === id)?.nome ?? id;
  const nomeCarac = (id: string) => c?.caracteristicas.find((a) => a.id === id)?.nome ?? id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Como o sistema decide <Badge variant="outline">só administrador</Badge>
        </CardTitle>
        <Button variant="link" className="h-auto w-fit p-0" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Esconder" : "Ver"} as regras que ele usa
        </Button>
      </CardHeader>
      {aberto && c && (
        <CardContent className="space-y-5 text-sm">
          <section className="space-y-1">
            <h3 className="font-semibold">1. Tempo igual primeiro</h3>
            <p className="text-muted-foreground">
              O sistema primeiro faz todo mundo jogar o mesmo tempo (ou o mais perto possível,
              dentro da diferença aceita). Depois escolhe, entre as opções com tempo parecido, a que
              tem menos trocas e o time mais forte. Tática, estratégia e regras de composição só
              decidem <em>quem</em> joga e <em>quando</em>.
            </p>
          </section>
          <section className="space-y-2">
            <h3 className="font-semibold">2. Nota de cada jogador por posição</h3>
            <p className="text-muted-foreground">
              Cada posição pesa os atributos de um jeito (a soma dá 100%):
            </p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {Object.entries(c.pesos_funcao).map(([f, pesos]) => (
                <li key={f}>
                  <strong>{FUNCAO_LABELS[f as keyof typeof FUNCAO_LABELS] ?? f}:</strong>{" "}
                  {Object.entries(pesos)
                    .map(([a, p]) => `${nomeAttr(a)} ${Math.round(p * 100)}%`)
                    .join(", ")}
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h3 className="font-semibold">3. O que cada tática muda</h3>
            <ul className="space-y-1">
              {c.taticas
                .filter((t) => t.id !== "equilibrada")
                .map((t) => (
                  <li key={t.id}>
                    <strong>{t.nome}:</strong> {t.descricao}{" "}
                    <span className="text-muted-foreground">
                      {Object.entries(t.funcao)
                        .map(([f, m]) => `${f} ×${m}`)
                        .join(", ")}
                      {Object.keys(c.bonus_caracteristica[t.id] ?? {}).length > 0 &&
                        ` · bônus: ${Object.entries(c.bonus_caracteristica[t.id])
                          .map(([k, v]) => `${nomeCarac(k)} +${v}`)
                          .join(", ")}`}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
          <section className="space-y-1">
            <h3 className="font-semibold">4. Regras de composição</h3>
            <p className="text-muted-foreground">
              Você define no cartão “Regras de composição”. Elas valem em cada momento do jogo para
              o setor escolhido.
            </p>
          </section>
        </CardContent>
      )}
    </Card>
  );
}
