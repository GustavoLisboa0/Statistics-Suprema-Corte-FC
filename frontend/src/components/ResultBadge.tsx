import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { matchResult, RESULT_LABELS, type Result, type Status } from "@/lib/football";

/**
 * Cores do resultado (redesign 2026-11, aprovado na prévia): vitória no
 * dourado do time, empate só com contorno, derrota num roxo apagado. Antes
 * a vitória era verde e a derrota vermelha; o redesign trocou pelo par
 * dourado/roxo da marca. As três variantes também diferem em
 * luminosidade/preenchimento, não só em cor, e sempre têm o texto ao lado
 * (letra ou palavra).
 *
 * O `hover:` repete a cor de base de propósito: a tag é informativa, não
 * clicável, e o `Badge` traz um hover próprio que precisa ser neutralizado.
 */
const RESULT_CLASSES: Record<Result, string> = {
  vitoria: "border-accent bg-accent text-accent-foreground hover:bg-accent",
  empate: "border-muted-foreground/70 bg-transparent text-foreground hover:bg-transparent",
  derrota: "border-transparent bg-chart-neg/30 text-foreground hover:bg-chart-neg/30",
};

const RESULT_LETTER: Record<Result, string> = {
  vitoria: "V",
  empate: "E",
  derrota: "D",
};

type MatchLike = { status: Status; goals_for: number | null; goals_against: number | null };

type ResultBadgeProps = {
  match: MatchLike;
  className?: string;
};

/** Tag automática de Vitória / Empate / Derrota. Some se a partida não foi realizada. */
export function ResultBadge({ match, className }: ResultBadgeProps) {
  const result = matchResult(match);
  if (!result) return null;

  return <Badge className={cn(RESULT_CLASSES[result], className)}>{RESULT_LABELS[result]}</Badge>;
}

/**
 * Versão compacta: quadradinho com a letra V/E/D (listas de resultados e
 * "últimos 5 jogos"). O nome completo vai no `title` e no texto acessível.
 */
export function ResultChip({ match, className }: ResultBadgeProps) {
  const result = matchResult(match);
  if (!result) return null;

  return (
    <span
      title={RESULT_LABELS[result]}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-extrabold",
        RESULT_CLASSES[result],
        className,
      )}
    >
      <span aria-hidden="true">{RESULT_LETTER[result]}</span>
      <span className="sr-only">{RESULT_LABELS[result]}</span>
    </span>
  );
}
