import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createInjury,
  deleteInjury,
  fetchInjuries,
  formatDate,
  isInjuryActiveByDate,
  type InjuryType,
  type Player,
} from "@/lib/football";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/DatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MAX_REASON_LENGTH = 300;

type FormState = {
  reason: string;
  type: InjuryType;
  endsOn: string;
};

const emptyForm: FormState = { reason: "", type: "proximo_jogo", endsOn: "" };

/**
 * Gestão de lesões de um jogador, do lado do admin — mesma lista que o
 * jogador vê em `/meu-jogador`, só que aqui o editor pode registrar/remover
 * em nome de qualquer um (útil pra quem avisou por fora do app).
 */
export function LesaoDialog({ player, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const queryKey = ["injuries", player?.id];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchInjuries(player!.id),
    enabled: !!player && open,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!player) return;
      await createInjury(player.id, {
        reason: form.reason.trim(),
        type: form.type,
        endsOn: form.type === "data" ? form.endsOn || null : null,
      });
    },
    onSuccess: () => {
      toast.success("Lesão registrada");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["active-injuries"] });
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error("Erro ao registrar: " + e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!player) return;
      await deleteInjury(player.id, id);
    },
    onSuccess: () => {
      toast.success("Lesão removida");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["active-injuries"] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error("Erro ao remover: " + e.message),
  });

  const submit = () => {
    const reason = form.reason.trim();
    if (!reason) return toast.error("Informe o motivo da lesão");
    if (reason.length > MAX_REASON_LENGTH)
      return toast.error(`O motivo deve ter no máximo ${MAX_REASON_LENGTH} caracteres`);
    if (form.type === "data" && !form.endsOn) return toast.error("Informe até quando vale a lesão");
    create.mutate();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-lg sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base leading-snug">
              <HeartPulse className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              Lesões — {player?.name}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (data ?? []).length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Nenhuma lesão registrada.
            </p>
          ) : (
            <div className="space-y-2">
              {(data ?? []).map((i) => {
                // Tipo "próximo jogo" depende do status da partida travada,
                // que essa tela não carrega — mostra sempre como está no
                // banco (o card do elenco já resolve isso via /lesoes/ativas).
                const ativa = i.type === "data" ? isInjuryActiveByDate(i) : true;
                return (
                  <Card
                    key={i.id}
                    className={cn(
                      "rounded-xl bg-raised shadow-none",
                      ativa && "border-destructive/40",
                    )}
                  >
                    <CardContent className="flex items-start justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="text-sm">{i.reason}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {i.type === "data"
                            ? `Até ${formatDate(i.ends_on)}`
                            : "Até a próxima partida agendada"}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="-mr-1 -mt-1 h-11 w-11 shrink-0 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => setToDelete(i.id)}
                        aria-label="Remover lesão"
                        title="Remover lesão"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm font-medium">Nova lesão</Label>
            <div>
              <Label htmlFor="motivo-lesao" className="text-xs">
                Motivo
              </Label>
              <Textarea
                id="motivo-lesao"
                maxLength={MAX_REASON_LENGTH}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v as InjuryType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proximo_jogo">Só o próximo jogo</SelectItem>
                    <SelectItem value="data">Até uma data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.type === "data" && (
                <div>
                  <Label className="text-xs">Até quando</Label>
                  <DatePicker
                    value={form.endsOn}
                    onChange={(v) => setForm({ ...form, endsOn: v })}
                    startMonth={new Date()}
                    disabled={{ before: new Date() }}
                  />
                </div>
              )}
            </div>
            <Button onClick={submit} disabled={create.isPending} className="min-h-11 w-full">
              {create.isPending ? "Registrando..." : "Registrar lesão"}
            </Button>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-card sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Remover lesão?</AlertDialogTitle>
            <AlertDialogDescription>
              O jogador volta a poder confirmar presença normalmente, se essa for a única lesão
              ativa dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
