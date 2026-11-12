import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { siglaPosicao, type Convocado, type GrupoDeFixos } from "@/lib/escalacao";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const NOME_DO_GRUPO: Record<number, string> = { 1: "jogador", 2: "dupla", 3: "trio" };

function Pessoa({ j }: { j: Convocado | undefined }) {
  if (!j) return null;
  const sigla = siglaPosicao(j.posicoes);
  return (
    <span className="whitespace-nowrap">
      {j.nome}
      {sigla && (
        <span className="ml-1.5 rounded-[5px] border px-1.5 py-px align-middle text-[11px] font-bold uppercase text-muted-foreground">
          {sigla}
        </span>
      )}
    </span>
  );
}

function Diferenca({ min }: { min: number }) {
  return (
    <span className="shrink-0 text-sm text-muted-foreground">
      {min === 0 ? (
        "sem diferença"
      ) : (
        <>
          diferença de <span className="num text-base text-foreground">{min}</span> min
        </>
      )}
    </span>
  );
}

/**
 * Janela para escolher quem joga o jogo todo. Mostra só o que fica dentro do limite
 * de tempo, com a diferença de cada escolha. Dois jeitos de olhar: por grupo
 * (dupla/trio inteiro) ou por pessoa (escolhe uma e vê com quem).
 */
export function QuemJogaTudo({
  quantos,
  atuais,
  tambem = [],
  linha,
  carregar,
  aoEscolher,
  aoFechar,
}: {
  quantos: number;
  atuais: string[];
  /** Quem já joga o jogo todo por outro motivo e fica de fora da escolha. */
  tambem?: string[];
  linha: Convocado[];
  carregar: () => Promise<GrupoDeFixos[]>;
  aoEscolher: (ids: string[]) => void;
  aoFechar: () => void;
}) {
  const [grupos, setGrupos] = useState<GrupoDeFixos[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<"grupo" | "pessoa">(quantos > 1 ? "grupo" : "pessoa");
  const porId = useMemo(() => new Map(linha.map((j) => [j.id, j])), [linha]);

  useEffect(() => {
    let vivo = true;
    carregar()
      .then((g) => vivo && setGrupos(g))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
    // carrega uma vez ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bons = useMemo(() => (grupos ?? []).filter((g) => g.aceitavel), [grupos]);
  const escondidos = (grupos?.length ?? 0) - bons.length;
  const atual = [...atuais].sort().join("|");

  // Por pessoa: o melhor grupo em que ela aparece.
  const pessoas = useMemo(() => {
    const melhor = new Map<string, GrupoDeFixos>();
    for (const g of bons)
      for (const id of g.fixos) {
        const m = melhor.get(id);
        if (!m || g.diferenca_minutos < m.diferenca_minutos) melhor.set(id, g);
      }
    return [...melhor.entries()].sort((a, b) => a[1].diferenca_minutos - b[1].diferenca_minutos);
  }, [bons]);

  const escolher = (ids: string[]) => {
    aoEscolher(ids);
    aoFechar();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Quem joga o jogo todo ({quantos} {quantos === 1 ? "jogador" : "jogadores"})
          </DialogTitle>
          <DialogDescription>
            Só aparecem as escolhas em que a diferença de tempo entre os outros jogadores fica em
            até 5 minutos.
            {tambem.length > 0 &&
              ` ${tambem.join(", ")} ${tambem.length === 1 ? "também joga" : "também jogam"} o jogo todo e ${tambem.length === 1 ? "não entra" : "não entram"} nessa escolha.`}
          </DialogDescription>
        </DialogHeader>

        {quantos > 1 && (
          <div
            role="radiogroup"
            aria-label="Como ver as escolhas"
            className="inline-flex w-fit gap-1 rounded-[12px] border p-1 text-sm"
          >
            {(
              [
                ["grupo", `Por ${NOME_DO_GRUPO[quantos] ?? "grupo"}`],
                ["pessoa", "Por pessoa"],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={modo === id}
                onClick={() => setModo(id)}
                className={cn(
                  "min-h-11 rounded-[9px] px-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  modo === id
                    ? "bg-accent font-bold text-accent-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}

        {!grupos && !erro && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Calculando as
            combinações… pode levar uns 15 segundos.
          </p>
        )}
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {grupos && bons.length === 0 && (
          <p className="rounded-xl border border-dashed bg-raised p-4 text-sm text-muted-foreground">
            Nenhuma escolha deixa o tempo dentro de 5 minutos com {quantos}{" "}
            {quantos === 1 ? "jogador" : "jogadores"} o jogo todo.
          </p>
        )}

        {grupos && bons.length > 0 && modo === "grupo" && (
          <ul className="space-y-2">
            {bons.map((g) => {
              const escolhido = [...g.fixos].sort().join("|") === atual;
              return (
                <li
                  key={g.fixos.join("|")}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-xl border bg-raised p-3",
                    escolhido && "border-accent bg-accent/15",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1 font-medium">
                    {g.fixos.map((id) => (
                      <Pessoa key={id} j={porId.get(id)} />
                    ))}
                  </span>
                  <Diferenca min={g.diferenca_minutos} />
                  <Button
                    className="min-h-11 min-w-14 rounded-[10px] font-bold"
                    variant={escolhido ? "secondary" : "default"}
                    aria-label={`Escolher ${g.fixos.map((id) => porId.get(id)?.nome).join(" e ")}`}
                    onClick={() => escolher(g.fixos)}
                  >
                    {escolhido ? <Check className="h-4 w-4" aria-hidden="true" /> : "OK"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {grupos && bons.length > 0 && modo === "pessoa" && (
          <ul className="space-y-2">
            {pessoas.map(([id, g]) => {
              const escolhido = atuais.includes(id);
              const outros = g.fixos.filter((x) => x !== id);
              return (
                <li
                  key={id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-xl border bg-raised p-3",
                    escolhido && "border-accent bg-accent/15",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      <Pessoa j={porId.get(id)} />
                    </span>
                    {outros.length > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        com {outros.map((o) => porId.get(o)?.nome).join(" e ")}
                      </span>
                    )}
                  </span>
                  <Diferenca min={g.diferenca_minutos} />
                  <Button
                    className="min-h-11 min-w-14 rounded-[10px] font-bold"
                    variant={escolhido ? "secondary" : "default"}
                    aria-label={`Escolher ${porId.get(id)?.nome}`}
                    onClick={() => escolher(g.fixos)}
                  >
                    {escolhido ? <Check className="h-4 w-4" aria-hidden="true" /> : "OK"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {grupos && escondidos > 0 && (
          <p className="text-xs text-muted-foreground">
            {escondidos} {escondidos === 1 ? "combinação ficou" : "combinações ficaram"} de fora por
            passar de 5 minutos de diferença.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
