import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  POSITION_LABELS,
  feePerPlayer,
  formatMoney,
  matchTitle,
  savePresence,
  type Match,
  type Player,
  type Position,
  type Presence,
  type PresenceStatus,
} from "@/lib/football";
import { gerarPixCopiaECola } from "@/lib/pix";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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

const PIX_CHAVE = import.meta.env.VITE_PIX_CHAVE ?? "";
const PIX_BANCO = import.meta.env.VITE_PIX_BANCO ?? "";
const PIX_TITULAR = import.meta.env.VITE_PIX_TITULAR ?? "";
const PIX_CIDADE = import.meta.env.VITE_PIX_CIDADE ?? "";

/** Regras do time, aceitas junto com a confirmação. */
const TERMOS = [
  "Proibido o uso de chuteira com trava de alumínio.",
  "O cancelamento de jogos deve ocorrer no máximo 4 dias antes do jogo, caso contrário o jogador fica sujeito a pagamento para não prejudicar os demais.",
  "Chegar com 20 minutos de antecedência para as orientações do árbitro e evitar atrasos.",
  "Cartão vermelho: apenas o jogador expulso deixa a partida (por enquanto).",
  "Tolerância zero para brigas ou ofensas discriminatórias.",
];

type Props = {
  match: Match;
  /** Jogador correspondente à conta logada; null se a conta não está vinculada. */
  player: Player | null;
  /** Presença já registrada, se houver. */
  current: Presence | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ConfirmarPresenca({ match, player, current, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const principal = player?.positions[0] ?? null;

  const [intencao, setIntencao] = useState<"sim" | "nao">("sim");
  const [posicao, setPosicao] = useState<Position | null>(principal);
  const [aceitou, setAceitou] = useState(false);
  const [salvo, setSalvo] = useState<Presence | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Reabrir o modal recomeça do estado atual do jogador, não do último uso.
  useEffect(() => {
    if (!open) return;
    setIntencao(current?.status === "ausente" ? "nao" : "sim");
    setPosicao(current?.position ?? principal);
    setAceitou(current?.terms_accepted ?? false);
    setSalvo(null);
    setCopiado(false);
  }, [open, current, principal]);

  const valor = feePerPlayer(match);

  // Gerado na hora: o QR do banco não carrega valor, e o valor muda por
  // partida. `useMemo` evita recalcular o CRC a cada digitação de outro campo.
  const pixCode = useMemo(() => {
    if (!PIX_CHAVE) return "";
    return gerarPixCopiaECola({
      chave: PIX_CHAVE,
      nome: PIX_TITULAR,
      cidade: PIX_CIDADE,
      valor,
    });
  }, [valor]);

  const salvar = useMutation({
    mutationFn: async () => {
      const status: PresenceStatus = intencao === "sim" ? "confirmado" : "ausente";
      return savePresence(match.id, {
        status,
        position: intencao === "sim" ? posicao : null,
        termsAccepted: intencao === "sim" ? aceitou : false,
      });
    },
    onSuccess: (presenca) => {
      qc.invalidateQueries({ queryKey: ["presences", match.id] });
      if (presenca.status === "ausente") {
        toast.success("Tudo certo, avisamos que você não vai");
        onOpenChange(false);
        return;
      }
      setSalvo(presenca);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não consegui copiar. Selecione o código e copie manualmente.");
    }
  };

  const podeSalvar =
    intencao === "nao" || (!!posicao && aceitou && (player?.positions.length ?? 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{salvo ? "Presença confirmada!" : "Confirmar presença"}</DialogTitle>
        </DialogHeader>

        {!player ? (
          <p className="py-4 text-sm text-muted-foreground">
            Sua conta ainda não está vinculada a um jogador do elenco. Peça para o responsável
            cadastrar seu email no seu perfil de jogador.
          </p>
        ) : salvo ? (
          // ----- Passo 3: sucesso + PIX -----
          // min-w-0: DialogContent é `display: grid`, e sem isso este item de
          // grid nunca encolhe abaixo da largura do código PIX (que não quebra
          // linha), o que empurra o diálogo inteiro e gera a barra horizontal —
          // mesmo com truncate na caixinha lá embaixo.
          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border bg-raised p-3.5 text-sm">
              <div className="font-semibold">{matchTitle(match)}</div>
              {salvo.status === "espera" ? (
                <p className="mt-1 text-muted-foreground">
                  As vagas de linha já estavam cheias, então você entrou na{" "}
                  <span className="font-medium text-foreground">lista de espera</span>. Se alguém
                  desistir, o organizador te promove.
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  Você está confirmado como{" "}
                  <span className="font-medium text-foreground">
                    {salvo.position ? POSITION_LABELS[salvo.position] : "—"}
                  </span>
                  .
                </p>
              )}
            </div>

            {PIX_CHAVE ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Pagamento via PIX</Label>
                  {valor !== null && (
                    <span className="num text-2xl leading-none text-primary">
                      {formatMoney(valor)}
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-center gap-3 rounded-xl border p-4">
                  <div className="rounded-md bg-white p-2">
                    <QRCodeSVG value={pixCode} size={176} marginSize={0} />
                  </div>
                  <div className="text-center text-xs text-muted-foreground">
                    {[PIX_TITULAR, PIX_BANCO].filter(Boolean).join(" · ")}
                  </div>
                </div>

                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">
                    Pix copia e cola
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate rounded-md border bg-raised px-2.5 py-2.5 font-mono text-xs">
                      {pixCode}
                    </div>
                    <Button
                      variant="outline"
                      onClick={copiarCodigo}
                      className="min-h-11 shrink-0 bg-transparent"
                    >
                      {copiado ? (
                        <>
                          <Check aria-hidden="true" className="mr-1 h-4 w-4" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy aria-hidden="true" className="mr-1 h-4 w-4" /> Copiar
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Depois de pagar, o organizador dá baixa e o status muda para pago.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                A chave PIX ainda não foi configurada no sistema.
              </p>
            )}
          </div>
        ) : (
          // ----- Passos 1 e 2 -----
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Você vai jogar?</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  aria-pressed={intencao === "sim"}
                  variant={intencao === "sim" ? "default" : "outline"}
                  onClick={() => setIntencao("sim")}
                  className={cn("min-h-11 rounded-[10px]", intencao === "sim" && "font-bold")}
                >
                  Vou jogar
                </Button>
                <Button
                  type="button"
                  aria-pressed={intencao === "nao"}
                  variant={intencao === "nao" ? "default" : "outline"}
                  onClick={() => setIntencao("nao")}
                  className={cn("min-h-11 rounded-[10px]", intencao === "nao" && "font-bold")}
                >
                  Não vou
                </Button>
              </div>
            </div>

            {intencao === "sim" && (
              <>
                <div>
                  <Label htmlFor="posicao-presenca">Posição neste jogo</Label>
                  <Select
                    value={posicao ?? undefined}
                    onValueChange={(v) => setPosicao(v as Position)}
                  >
                    <SelectTrigger id="posicao-presenca">
                      <SelectValue placeholder="Escolha a posição" />
                    </SelectTrigger>
                    <SelectContent>
                      {player.positions.map((pos) => (
                        <SelectItem key={pos} value={pos}>
                          {POSITION_LABELS[pos]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Só as posições do seu perfil. Goleiro não ocupa vaga de linha.
                  </p>
                </div>

                {valor !== null && (
                  <div className="flex items-center justify-between rounded-xl border bg-raised p-3.5 text-sm">
                    <span className="text-muted-foreground">Sua parte no rateio</span>
                    <span className="num text-2xl leading-none text-primary">
                      {formatMoney(valor)}
                    </span>
                  </div>
                )}

                <Separator />

                <div>
                  <Label className="mb-2 block">Orientações</Label>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {TERMOS.map((termo) => (
                      <li key={termo} className="flex gap-2">
                        <span aria-hidden="true" className="text-accent">
                          •
                        </span>
                        <span>{termo}</span>
                      </li>
                    ))}
                  </ul>
                  <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
                    <Checkbox
                      checked={aceitou}
                      onCheckedChange={(v) => setAceitou(v === true)}
                      className="mt-0.5"
                    />
                    <span>Li e aceito as orientações acima</span>
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {salvo ? (
            <Button onClick={() => onOpenChange(false)} className="min-h-11 rounded-[10px] px-5">
              Fechar
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="min-h-11 rounded-[10px] bg-transparent px-5"
              >
                Cancelar
              </Button>
              {player && (
                <Button
                  onClick={() => salvar.mutate()}
                  disabled={!podeSalvar || salvar.isPending}
                  className="min-h-11 rounded-[10px] px-5 font-extrabold"
                >
                  {salvar.isPending && (
                    <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" />
                  )}
                  {salvar.isPending ? "Salvando..." : "Salvar"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Tag de status de presença, reaproveitada na lista. */
export function PresenceBadge({ status }: { status: PresenceStatus }) {
  // Por token (redesign 2026-11): confirmado no dourado cheio, espera só com
  // contorno dourado, "não vai" apagado. O `hover:` repete a base porque a tag
  // não é clicável e o `Badge` traz hover próprio.
  if (status === "confirmado") {
    return (
      <Badge className="border-accent bg-accent text-accent-foreground hover:bg-accent">
        Confirmado
      </Badge>
    );
  }
  if (status === "espera") {
    return (
      <Badge variant="outline" className="border-accent bg-transparent text-foreground">
        Espera
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-raised font-normal text-muted-foreground">
      Não vai
    </Badge>
  );
}
