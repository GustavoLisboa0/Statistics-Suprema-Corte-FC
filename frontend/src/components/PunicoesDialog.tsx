import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createPunishment,
  deletePunishment,
  fetchPunishments,
  formatDate,
  isPunishmentActive,
  updatePunishment,
  type Player,
  type PunishmentType,
} from "@/lib/football";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/DatePicker";
import { NumberInput } from "@/components/NumberInput";
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
  type: PunishmentType;
  endsOn: string;
  gamesTotal: string;
};

const emptyForm: FormState = { reason: "", type: "dias", endsOn: "", gamesTotal: "" };

/**
 * Gestão de punições de um jogador — inteiramente admin-only. A rota do
 * backend nem aceita `usuario_atual` sozinho, só `exige_editor`, então isso
 * nunca vaza pra quem não é editor por engano.
 */
export function PunicoesDialog({ player, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const queryKey = ["punishments", player?.id];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchPunishments(player!.id),
    enabled: !!player && open,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!player) return;
      await createPunishment(player.id, {
        reason: form.reason.trim(),
        type: form.type,
        endsOn: form.type === "dias" ? form.endsOn || null : null,
        gamesTotal: form.type === "jogos" ? Number(form.gamesTotal) || null : null,
      });
    },
    onSuccess: () => {
      toast.success("Punição registrada");
      qc.invalidateQueries({ queryKey });
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error("Erro ao registrar: " + e.message),
  });

  const ajustarJogos = useMutation({
    mutationFn: async ({ id, gamesServed }: { id: string; gamesServed: number }) => {
      if (!player) return;
      await updatePunishment(player.id, id, { gamesServed });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error("Erro ao ajustar: " + e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!player) return;
      await deletePunishment(player.id, id);
    },
    onSuccess: () => {
      toast.success("Punição removida");
      qc.invalidateQueries({ queryKey });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error("Erro ao remover: " + e.message),
  });

  const submit = () => {
    const reason = form.reason.trim();
    if (!reason) return toast.error("Informe o motivo da punição");
    if (reason.length > MAX_REASON_LENGTH)
      return toast.error(`O motivo deve ter no máximo ${MAX_REASON_LENGTH} caracteres`);
    if (form.type === "dias" && !form.endsOn)
      return toast.error("Informe até quando vale a punição");
    if (form.type === "jogos" && !Number(form.gamesTotal))
      return toast.error("Informe o número de jogos da punição");
    create.mutate();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Punições — {player?.name}
            </DialogTitle>
          </DialogHeader>

          <p className="rounded-md border border-accent/40 bg-accent/10 p-3 text-xs text-muted-foreground">
            Só admins veem esta tela. O jogador não sabe que está com uma punição registrada — só
            descobre, com o motivo e o prazo, se tentar confirmar presença enquanto ela valer.
          </p>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (data ?? []).length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Nenhuma punição registrada.
            </p>
          ) : (
            <div className="space-y-2">
              {(data ?? []).map((p) => {
                const ativa = isPunishmentActive(p);
                return (
                  <Card key={p.id} className={ativa ? "border-destructive/40" : undefined}>
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Badge variant={ativa ? "destructive" : "secondary"} className="mb-1">
                            {ativa ? "Ativa" : "Encerrada"}
                          </Badge>
                          <p className="text-sm">{p.reason}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {p.type === "dias"
                              ? `Até ${formatDate(p.ends_on)}`
                              : `${p.games_served} de ${p.games_total} jogos cumpridos`}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={() => setToDelete(p.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                      {p.type === "jogos" && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-6 w-6"
                            disabled={p.games_served <= 0 || ajustarJogos.isPending}
                            onClick={() =>
                              ajustarJogos.mutate({ id: p.id, gamesServed: p.games_served - 1 })
                            }
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-xs text-muted-foreground">jogos cumpridos</span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-6 w-6"
                            disabled={
                              p.games_served >= (p.games_total ?? 0) || ajustarJogos.isPending
                            }
                            onClick={() =>
                              ajustarJogos.mutate({ id: p.id, gamesServed: p.games_served + 1 })
                            }
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm font-medium">Nova punição</Label>
            <div>
              <Label htmlFor="motivo-punicao" className="text-xs">
                Motivo
              </Label>
              <Textarea
                id="motivo-punicao"
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
                  onValueChange={(v) => setForm({ ...form, type: v as PunishmentType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dias">Por prazo</SelectItem>
                    <SelectItem value="jogos">Por número de jogos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                {form.type === "dias" ? (
                  <>
                    <Label className="text-xs">Até quando</Label>
                    <DatePicker
                      value={form.endsOn}
                      onChange={(v) => setForm({ ...form, endsOn: v })}
                      startMonth={new Date()}
                      disabled={{ before: new Date() }}
                    />
                  </>
                ) : (
                  <>
                    <Label className="text-xs">Número de jogos</Label>
                    <NumberInput
                      value={form.gamesTotal}
                      onChange={(v) => setForm({ ...form, gamesTotal: v })}
                      min={1}
                      max={99}
                    />
                  </>
                )}
              </div>
            </div>
            <Button onClick={submit} disabled={create.isPending} className="w-full">
              {create.isPending ? "Registrando..." : "Registrar punição"}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover punição?</AlertDialogTitle>
            <AlertDialogDescription>
              O jogador volta a poder confirmar presença normalmente, se essa for a única punição
              ativa dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && remove.mutate(toDelete)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
