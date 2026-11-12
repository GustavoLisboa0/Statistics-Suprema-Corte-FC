import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { isAutenticado } from "@/lib/auth";
import { useUsuario } from "@/lib/useUsuario";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HeartPulse, Info } from "lucide-react";
import { toast } from "sonner";

import {
  POSITIONS,
  POSITION_LABELS,
  POSITION_ABBR,
  PHONE_REGEX,
  MAX_POSITIONS,
  MAX_NAME_LENGTH,
  MAX_NICKNAME_LENGTH,
  MAX_SHIRT_DIGITS,
  nameHasDigits,
  formatPhone,
  formatDate,
  fetchMeuJogador,
  fetchActiveInjuries,
  createInjury,
  deleteInjury,
  createMyPlayer,
  updatePlayer,
  type InjuryType,
  type PlayerInput,
  type Position,
} from "@/lib/football";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/DatePicker";
import { NumberInput } from "@/components/NumberInput";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/meu-jogador")({
  ssr: false, // depende da sessão do navegador (ver comentário em routes/index.tsx)
  beforeLoad: () => {
    if (!isAutenticado()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [{ title: "Meu cadastro — Suprema Corte FC" }],
  }),
  component: MeuJogadorPage,
});

type FormState = {
  name: string;
  nickname: string;
  phone: string;
  positions: Position[];
  shirt_number: string;
  birth_date: string;
};

const emptyForm: FormState = {
  name: "",
  nickname: "",
  phone: "",
  positions: [],
  shirt_number: "",
  birth_date: "",
};

function MeuJogadorPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const usuario = useUsuario();
  const { data, isLoading } = useQuery({ queryKey: ["meu-jogador"], queryFn: fetchMeuJogador });

  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialForm, setInitialForm] = useState<FormState>(emptyForm);
  const [initialized, setInitialized] = useState(false);

  // Pré-preenche assim que o GET volta: dados existentes em modo revisão, ou
  // formulário em branco em modo criação. Só uma vez — não sobrescrever o que
  // a pessoa já digitou se a query revalidar no meio da edição.
  useEffect(() => {
    if (isLoading || initialized) return;
    const inicial: FormState = data
      ? {
          name: data.name,
          nickname: data.nickname ?? "",
          phone: data.phone ?? "",
          positions: data.positions,
          shirt_number: data.shirt_number?.toString() ?? "",
          birth_date: data.birth_date ?? "",
        }
      : // Sem jogador ainda: repassa o que a pessoa já digitou no cadastro
        // (mesma ideia do email, que já vem automático da própria conta).
        { ...emptyForm, name: usuario?.nome ?? "", phone: usuario?.telefone ?? "" };
    setForm(inicial);
    setInitialForm(inicial);
    setInitialized(true);
  }, [isLoading, initialized, data, usuario]);

  // Salvar só faz sentido depois de alguma mudança de verdade.
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  // Lesão: visível pra todo mundo, então reaproveita o mesmo endpoint
  // agregado que a lista de jogadores usa — evita duplicar a lógica de
  // "essa lesão do tipo próximo jogo ainda tá valendo" (depende do status
  // da partida travada, que só o backend resolve).
  const { data: activeInjuries } = useQuery({
    queryKey: ["active-injuries"],
    queryFn: fetchActiveInjuries,
    enabled: !!data,
  });
  const minhaLesao = (activeInjuries ?? []).find((i) => i.player_id === data?.id) ?? null;

  const [lesaoFormAberto, setLesaoFormAberto] = useState(false);
  const [lesaoForm, setLesaoForm] = useState<{ reason: string; type: InjuryType; endsOn: string }>({
    reason: "",
    type: "proximo_jogo",
    endsOn: "",
  });

  const registrarLesao = useMutation({
    mutationFn: async () => {
      if (!data) return;
      await createInjury(data.id, {
        reason: lesaoForm.reason.trim(),
        type: lesaoForm.type,
        endsOn: lesaoForm.type === "data" ? lesaoForm.endsOn || null : null,
      });
    },
    onSuccess: () => {
      toast.success("Lesão registrada");
      qc.invalidateQueries({ queryKey: ["active-injuries"] });
      setLesaoForm({ reason: "", type: "proximo_jogo", endsOn: "" });
      setLesaoFormAberto(false);
    },
    onError: (e: Error) => toast.error("Erro ao registrar: " + e.message),
  });

  const recuperado = useMutation({
    mutationFn: async () => {
      if (!data || !minhaLesao) return;
      await deleteInjury(data.id, minhaLesao.id);
    },
    onSuccess: () => {
      toast.success("Marcado como recuperado");
      qc.invalidateQueries({ queryKey: ["active-injuries"] });
    },
    onError: (e: Error) => toast.error("Erro ao atualizar: " + e.message),
  });

  const submitLesao = () => {
    const reason = lesaoForm.reason.trim();
    if (!reason) return toast.error("Informe qual foi a lesão");
    if (lesaoForm.type === "data" && !lesaoForm.endsOn)
      return toast.error("Informe até quando você vai ficar fora");
    registrarLesao.mutate();
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: PlayerInput = {
        name: form.name.trim(),
        nickname: form.nickname.trim() || null,
        phone: form.phone.trim(),
        // Email é sempre o da própria conta — o backend força isso de
        // qualquer forma, o campo nem é editável aqui.
        email: usuario?.email ?? null,
        positions: form.positions,
        shirt_number: form.shirt_number ? Number(form.shirt_number) : null,
        birth_date: form.birth_date || null,
        active: true,
      };
      if (data) {
        await updatePlayer(data.id, payload);
      } else {
        await createMyPlayer(payload);
      }
    },
    onSuccess: () => {
      toast.success(data ? "Cadastro atualizado" : "Cadastro criado! Bem-vindo ao elenco.");
      qc.invalidateQueries({ queryKey: ["meu-jogador"] });
      qc.invalidateQueries({ queryKey: ["players"] });
      // Sem isso o botão continuaria "sujo" (habilitado) depois de salvar,
      // já que a query não refaz o pré-preenchimento (initialized já é true).
      setInitialForm(form);
      if (!data) navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error("Erro ao salvar: " + e.message),
  });

  const submit = () => {
    const name = form.name.trim();
    if (!name) return toast.error("Informe seu nome");
    if (nameHasDigits(name)) return toast.error("O nome não pode conter números");
    if (name.length > MAX_NAME_LENGTH)
      return toast.error(`O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres`);
    if (form.nickname.trim().length > MAX_NICKNAME_LENGTH)
      return toast.error(`O apelido deve ter no máximo ${MAX_NICKNAME_LENGTH} caracteres`);
    if (!PHONE_REGEX.test(form.phone))
      return toast.error("Informe um telefone válido: (DDD) 91234-1234");
    if (form.positions.length === 0) return toast.error("Selecione ao menos uma posição");
    if (form.positions.length > MAX_POSITIONS)
      return toast.error(`Selecione no máximo ${MAX_POSITIONS} posições`);
    save.mutate();
  };

  if (isLoading || !initialized) {
    return (
      <div className="mx-auto flex max-w-[880px] flex-col gap-6">
        <Skeleton className="h-14 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6">
      <div>
        <p className="mb-1.5 text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {data ? "Seu perfil de jogador" : "Complete seu cadastro"}
        </p>
        <h1 className="text-3xl leading-tight">Meu cadastro</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {data
            ? "Só você pode editar este cadastro."
            : "Falta só isso pra você aparecer no elenco."}
        </p>
      </div>

      {data && (
        <div
          role="note"
          className="flex gap-3 rounded-xl border bg-raised px-[18px] py-4 text-sm leading-relaxed"
        >
          <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <span>
            Este é o jogador vinculado à sua conta. Confira se os dados abaixo estão certos.
          </span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-5 rounded-2xl border bg-card p-4 text-card-foreground sm:p-6"
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              autoComplete="name"
              maxLength={MAX_NAME_LENGTH}
              className="h-12"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nickname">Apelido</Label>
            <Input
              id="nickname"
              maxLength={MAX_NICKNAME_LENGTH}
              className="h-12"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Telefone *</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="(11) 91234-5678"
              maxLength={15}
              className="h-12"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email da conta</Label>
            <Input
              id="email"
              type="email"
              readOnly
              aria-describedby="email-dica"
              className="h-12 border-dashed bg-raised text-muted-foreground"
              value={usuario?.email ?? ""}
            />
            <p id="email-dica" className="text-xs text-muted-foreground">
              O email da sua conta de login. Não dá pra alterar por aqui.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shirt">Número da camisa</Label>
            <NumberInput
              id="shirt"
              inputClassName="h-12"
              value={form.shirt_number}
              onChange={(v) => setForm({ ...form, shirt_number: v })}
              min={0}
              max={999}
              maxDigits={MAX_SHIRT_DIGITS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="birth">Data de nascimento</Label>
            <DatePicker
              id="birth"
              className="h-12 w-full"
              value={form.birth_date}
              onChange={(v) => setForm({ ...form, birth_date: v })}
              endMonth={new Date()}
              disabled={{ after: new Date() }}
            />
          </div>
        </div>

        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2.5 p-0 text-sm font-semibold">
            Posições *{" "}
            <span className="font-normal text-muted-foreground">(máximo {MAX_POSITIONS})</span>
          </legend>
          <ToggleGroup
            type="multiple"
            value={form.positions}
            onValueChange={(v) => {
              const mantidas = form.positions.filter((p) => v.includes(p));
              const novas = v.filter((p) => !form.positions.includes(p as Position)) as Position[];
              const todas = [...mantidas, ...novas];
              if (todas.length > MAX_POSITIONS) {
                toast.error(`Máximo de ${MAX_POSITIONS} posições`);
                return;
              }
              setForm({ ...form, positions: todas });
            }}
            className="flex flex-wrap justify-start gap-2"
          >
            {POSITIONS.map((pos) => (
              <ToggleGroupItem
                key={pos}
                value={pos}
                variant="outline"
                className="h-11 w-[52px] rounded-[10px] text-[13px] font-extrabold data-[state=on]:border-accent"
                aria-label={POSITION_LABELS[pos]}
                title={POSITION_LABELS[pos]}
              >
                {POSITION_ABBR[pos]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="mt-2.5 text-xs text-muted-foreground">
            {form.positions.length > 0 ? (
              <>
                Principal:{" "}
                <span className="font-medium text-foreground">
                  {POSITION_LABELS[form.positions[0]]}
                </span>{" "}
                — a primeira posição marcada é a principal.
              </>
            ) : (
              "A primeira posição marcada é a principal."
            )}
          </p>
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-[18px]">
          {!isDirty && !save.isPending && (
            <span className="text-[13px] text-muted-foreground">Nenhuma alteração para salvar</span>
          )}
          <Button
            type="submit"
            className="h-12 px-7 font-bold"
            disabled={save.isPending || !isDirty}
          >
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>

      {data && (
        <section
          aria-labelledby="lesao-titulo"
          className="flex flex-col gap-[18px] rounded-2xl border bg-card p-4 text-card-foreground sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
              >
                <HeartPulse className="h-[17px] w-[17px]" />
              </span>
              <h2 id="lesao-titulo" className="text-[15px] leading-tight">
                Departamento médico
              </h2>
            </div>
            <span className="text-[13px] text-muted-foreground">Visível para todo o elenco</span>
          </div>

          {minhaLesao ? (
            <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3 rounded-xl border bg-raised px-[18px] py-4">
              <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
                <span className="text-[15px] font-bold break-words">{minhaLesao.reason}</span>
                <span className="text-[13px] text-muted-foreground">
                  {minhaLesao.type === "data"
                    ? `Fora até ${formatDate(minhaLesao.ends_on)}`
                    : "Só até a próxima partida agendada"}{" "}
                  · não é possível confirmar presença nesse período
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 bg-card px-[18px] font-bold"
                onClick={() => recuperado.mutate()}
                disabled={recuperado.isPending}
              >
                {recuperado.isPending ? "Atualizando..." : "Marcar como recuperado"}
              </Button>
            </div>
          ) : lesaoFormAberto ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lesao-motivo">Qual foi a lesão?</Label>
                <Textarea
                  id="lesao-motivo"
                  maxLength={300}
                  value={lesaoForm.reason}
                  onChange={(e) => setLesaoForm({ ...lesaoForm, reason: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lesao-tipo">Por quanto tempo</Label>
                  <Select
                    value={lesaoForm.type}
                    onValueChange={(v) => setLesaoForm({ ...lesaoForm, type: v as InjuryType })}
                  >
                    <SelectTrigger id="lesao-tipo" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proximo_jogo">Só o próximo jogo</SelectItem>
                      <SelectItem value="data">Até uma data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {lesaoForm.type === "data" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="lesao-ate">Fora até</Label>
                    <DatePicker
                      id="lesao-ate"
                      className="h-12 w-full"
                      value={lesaoForm.endsOn}
                      onChange={(v) => setLesaoForm({ ...lesaoForm, endsOn: v })}
                      startMonth={new Date()}
                      disabled={{ before: new Date() }}
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setLesaoFormAberto(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="min-h-11 font-bold"
                  onClick={submitLesao}
                  disabled={registrarLesao.isPending}
                >
                  {registrarLesao.isPending ? "Registrando..." : "Registrar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-raised px-[18px] py-4">
              <span className="text-sm text-muted-foreground">Nenhuma lesão registrada.</span>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 bg-card font-bold"
                onClick={() => setLesaoFormAberto(true)}
              >
                Registrar lesão
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
