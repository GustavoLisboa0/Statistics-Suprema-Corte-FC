import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, HelpCircle, Lightbulb, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  FORMACAO_DESCRICAO,
  FORMACOES,
  FUNCAO_LABELS,
  fetchCatalogo,
  fetchSugestaoFormacao,
} from "@/lib/escalacao";
import { CampoFormacao } from "@/components/CampoFormacao";
import { NumberInput } from "@/components/NumberInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Peças visuais compartilhadas pela tela de escalação
// ---------------------------------------------------------------------------

/** Chave (Switch) dourada quando ligada, com área de toque de 44px. */
export const CLASSE_CHAVE =
  "relative data-[state=checked]:bg-accent after:absolute after:-inset-3 after:content-['']";

/** Lista de abas sublinhadas (aba ativa com traço dourado). */
export function ListaDeAbas({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        // A linha de baixo é uma sombra interna: não some com o overflow e fica sob o traço dourado.
        "flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 shadow-[inset_0_-1px_0_var(--color-border)]",
        className,
      )}
      {...props}
    />
  );
}

export function Aba({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        "min-h-11 shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-4 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-none",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Formação: escolher olhando o desenho do campo (como num jogo de futebol)
// ---------------------------------------------------------------------------

export type MudancaFormacaoForm = { minuto: string; formacao: string };

/** Janela com todas as formações desenhadas; clica no campinho para escolher. */
export function SeletorFormacao({
  aberto,
  onAbertoChange,
  valor,
  onEscolher,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  valor: string;
  onEscolher: (formacao: string) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Escolha a formação</DialogTitle>
          <DialogDescription>
            As bolinhas mostram onde cada jogador fica. Repare que o mesmo número pode ter desenhos
            diferentes (ex.: dois 4-4-2).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Object.keys(FORMACOES).map((nome) => {
            const ativa = nome === valor;
            return (
              <button
                key={nome}
                type="button"
                onClick={() => {
                  onEscolher(nome);
                  onAbertoChange(false);
                }}
                aria-pressed={ativa}
                className={cn(
                  "group flex flex-col items-center gap-2 rounded-xl border-2 p-2.5 text-center transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativa ? "border-accent bg-accent/10" : "border-transparent bg-raised",
                )}
              >
                <CampoFormacao formacao={nome} mini className="w-full max-w-[120px]" />
                <span className="num flex items-center gap-1 text-xl">
                  {ativa && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                  {nome}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {FORMACAO_DESCRICAO[nome]}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Botão com o desenho e o nome da formação; abre o seletor. */
function BotaoFormacao({
  valor,
  onEscolher,
  rotulo,
}: {
  valor: string;
  onEscolher: (f: string) => void;
  rotulo: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`${rotulo}: ${valor}. Clique para mudar`}
        className="flex items-center gap-3 rounded-xl border bg-raised p-2 pr-4 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CampoFormacao formacao={valor} mini className="w-12 shrink-0" />
        <span>
          <span className="num block text-2xl text-primary">{valor}</span>
          <span className="text-xs text-muted-foreground">Trocar desenho</span>
        </span>
      </button>
      <SeletorFormacao
        aberto={aberto}
        onAbertoChange={setAberto}
        valor={valor}
        onEscolher={onEscolher}
      />
    </>
  );
}

/** Formação inicial + mudanças durante o jogo, tudo numa linha só. */
export function FormacaoDoJogo({
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

  const mudar = (i: number, parte: Partial<MudancaFormacaoForm>) =>
    setMudancas(mudancas.map((m, k) => (k === i ? { ...m, ...parte } : m)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <BotaoFormacao valor={formacao} onEscolher={setFormacao} rotulo="Formação inicial" />
        {mudancas.map((m, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-2"
          >
            <span className="text-xs text-muted-foreground">aos</span>
            <NumberInput
              value={m.minuto}
              onChange={(v) => mudar(i, { minuto: v })}
              min={1}
              max={duracao - 1}
              className="w-20"
              aria-label="Minuto da mudança de formação"
            />
            <span className="text-xs text-muted-foreground">min</span>
            <BotaoFormacao
              valor={m.formacao}
              onEscolher={(f) => mudar(i, { formacao: f })}
              rotulo="Nova formação"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              aria-label="Remover mudança de formação"
              onClick={() => setMudancas(mudancas.filter((_, k) => k !== i))}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="min-h-11 rounded-[10px] bg-card"
          onClick={() =>
            setMudancas([
              ...mudancas,
              { minuto: String(Math.round(duracao * 0.67)), formacao: formacao },
            ])
          }
          disabled={mudancas.length >= 3}
        >
          <Plus aria-hidden="true" /> Mudar de formação no jogo
        </Button>
        <Button
          variant="secondary"
          className="min-h-11 rounded-[10px]"
          onClick={sugerir}
          disabled={buscando}
        >
          <Lightbulb aria-hidden="true" />
          {buscando ? "Pensando…" : "Sugerir formação"}
        </Button>
      </div>
      {mudancas.length > 0 && (
        <p className="text-xs text-muted-foreground">
          A mudança de formação acontece junto com uma troca de jogadores: o sistema encaixa no
          momento de troca mais próximo do minuto que você escolheu.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ajuda: "como o sistema decide" (pequeno botão de interrogação)
// ---------------------------------------------------------------------------
export function AjudaSistema() {
  const [aberto, setAberto] = useState(false);
  const { data: c } = useQuery({
    queryKey: ["escalacao-catalogo"],
    queryFn: fetchCatalogo,
    enabled: aberto,
  });
  const nomeAttr = (id: string) => c?.atributos.find((a) => a.id === id)?.nome ?? id;
  const nomeCarac = (id: string) => c?.caracteristicas.find((a) => a.id === id)?.nome ?? id;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0"
        onClick={() => setAberto(true)}
        aria-label="Como o sistema decide"
        title="Como o sistema decide"
      >
        <HelpCircle className="!size-5" aria-hidden="true" />
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Como o sistema decide</DialogTitle>
            <DialogDescription>Só administradores veem esta explicação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 text-sm">
            <section className="space-y-1.5">
              <h3 className="text-[13px] leading-tight">1. Tempo igual primeiro</h3>
              <p className="text-muted-foreground">
                Todo mundo joga o mesmo tempo (no máximo 1 minuto de diferença). O sistema escolhe
                sozinho quantas trocas fazer e compara alternativas, como deixar 1 jogador o jogo
                todo para ter menos trocas. Tática, estratégia e regras só decidem <em>quem</em>{" "}
                joga e <em>quando</em>.
              </p>
            </section>
            {c && (
              <>
                <section className="space-y-1">
                  <h3 className="text-[13px] leading-tight">2. Nota de cada jogador por posição</h3>
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
                <section className="space-y-1">
                  <h3 className="text-[13px] leading-tight">3. O que cada tática muda</h3>
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
              </>
            )}
            <section className="space-y-1">
              <h3 className="text-[13px] leading-tight">4. Regras de composição</h3>
              <p className="text-muted-foreground">
                Na aba “Tática e estratégia”, clique numa bolinha do campo para definir como aquele
                setor deve ser formado (ex.: um volante rápido e um lento).
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
