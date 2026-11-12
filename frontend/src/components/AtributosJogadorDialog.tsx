import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";

import {
  ATRIBUTOS,
  fetchAtributos,
  fetchCatalogo,
  salvarAtributos,
  type AtributoId,
} from "@/lib/escalacao";
import type { Player } from "@/lib/football";
import { NumberInput } from "@/components/NumberInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Atributos (notas de 1 a 100), características e nota interna de um jogador.
 * Só administrador abre isto — a API recusa quem não é editor.
 */
export function AtributosJogadorDialog({ player, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { data: todos, isLoading } = useQuery({
    queryKey: ["atributos"],
    queryFn: fetchAtributos,
    enabled: open,
  });
  const { data: catalogo } = useQuery({
    queryKey: ["escalacao-catalogo"],
    queryFn: fetchCatalogo,
    enabled: open,
  });
  const atual = todos?.find((a) => a.jogador_id === player?.id);

  const [valores, setValores] = useState<Record<AtributoId, string>>(
    Object.fromEntries(ATRIBUTOS.map((a) => [a.id, ""])) as Record<AtributoId, string>,
  );
  const [carac, setCarac] = useState<string[]>([]);
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (!open) return;
    setValores(
      Object.fromEntries(
        ATRIBUTOS.map((a) => [a.id, atual?.[a.id] ? String(atual[a.id]) : ""]),
      ) as Record<AtributoId, string>,
    );
    setCarac(atual?.caracteristicas ?? []);
    setNota(atual?.nota ?? "");
  }, [open, atual]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarAtributos(player!.id, {
        ...(Object.fromEntries(
          ATRIBUTOS.map((a) => [a.id, Number(valores[a.id]) || null]),
        ) as Record<AtributoId, number | null>),
        caracteristicas: carac,
        nota: nota.trim() || null,
      }),
    onSuccess: () => {
      toast.success(`Atributos de ${player?.nickname || player?.name} salvos.`);
      qc.invalidateQueries({ queryKey: ["atributos"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternar = (id: string) =>
    setCarac((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">
            Atributos de {player?.nickname || player?.name}
          </DialogTitle>
          <DialogDescription>
            Só administradores veem isto. Serve para o escalador montar o time; nada disto aparece
            no PDF. Campo vazio vale 50.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ATRIBUTOS.map((a) => (
                <div key={a.id} className="space-y-1">
                  <Label htmlFor={`attr-${a.id}`}>{a.nome}</Label>
                  <NumberInput
                    id={`attr-${a.id}`}
                    value={valores[a.id]}
                    onChange={(v) => setValores((s) => ({ ...s, [a.id]: v }))}
                    min={1}
                    max={100}
                    maxDigits={3}
                    placeholder="50"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Características</Label>
              <p className="text-xs text-muted-foreground">
                Clique para marcar. O sistema usa para escolher quem joga onde e para as regras de
                composição (ex.: um volante canhoto).
              </p>
              <div className="flex flex-wrap gap-2">
                {(catalogo?.caracteristicas ?? []).map((c) => {
                  const marcada = carac.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={marcada}
                      onClick={() => alternar(c.id)}
                      className={cn(
                        "min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        marcada
                          ? "border-accent bg-accent font-bold text-accent-foreground"
                          : "bg-card text-muted-foreground hover:bg-raised",
                      )}
                    >
                      {c.nome}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="attr-nota">Anotação (opcional)</Label>
              <Textarea
                id="attr-nota"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Ex.: rende mais jogando pela direita."
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="min-h-11"
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending || isLoading}
          >
            <Save aria-hidden="true" /> Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
