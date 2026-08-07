import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { matchResult, RESULT_LABELS, type Result, type Status } from "@/lib/football";

/**
 * Cores do resultado. O tema do app é roxo + âmbar e não tem um token de
 * "sucesso", então a vitória usa o verde da paleta do Tailwind; empate e
 * derrota reaproveitam os tokens existentes.
 *
 * O `hover:` repete a cor de base de propósito: a tag é informativa, não
 * clicável, e o `Badge` traz um hover próprio que precisa ser neutralizado.
 */
const RESULT_CLASSES: Record<Result, string> = {
  vitoria:
    "border-transparent bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-500",
  empate: "border-transparent bg-muted text-muted-foreground hover:bg-muted",
  derrota: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive",
};

type ResultBadgeProps = {
  match: { status: Status; goals_for: number | null; goals_against: number | null };
  className?: string;
};

/** Tag automática de Vitória / Empate / Derrota. Some se a partida não foi realizada. */
export function ResultBadge({ match, className }: ResultBadgeProps) {
  const result = matchResult(match);
  if (!result) return null;

  return <Badge className={cn(RESULT_CLASSES[result], className)}>{RESULT_LABELS[result]}</Badge>;
}
