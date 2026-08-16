import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { isAutenticado } from "@/lib/auth";
import { useUsuario } from "@/lib/useUsuario";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  fetchMeuJogador,
  createMyPlayer,
  updatePlayer,
  type PlayerInput,
  type Position,
} from "@/lib/football";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/DatePicker";
import { NumberInput } from "@/components/NumberInput";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/meu-jogador")({
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
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-4xl">{data ? "Seu cadastro de jogador" : "Complete seu cadastro"}</h1>
        <p className="text-sm text-muted-foreground">
          {data
            ? "Só você pode editar este cadastro."
            : "Falta só isso pra você aparecer no elenco."}
        </p>
      </div>

      {data && (
        <Card className="border-accent/40 bg-accent/10">
          <CardContent className="py-3 text-sm">
            Este é o jogador vinculado à sua conta. Confira se os dados abaixo estão certos.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              maxLength={MAX_NAME_LENGTH}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="nickname">Apelido</Label>
            <Input
              id="nickname"
              maxLength={MAX_NICKNAME_LENGTH}
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="phone">Telefone *</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              placeholder="(11) 91234-5678"
              maxLength={15}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={usuario?.email ?? ""} disabled />
            <p className="mt-1 text-xs text-muted-foreground">
              O email da sua conta de login. Não dá pra alterar por aqui.
            </p>
          </div>
          <div>
            <Label htmlFor="shirt">Número da camisa</Label>
            <NumberInput
              id="shirt"
              value={form.shirt_number}
              onChange={(v) => setForm({ ...form, shirt_number: v })}
              min={0}
              max={999}
              maxDigits={MAX_SHIRT_DIGITS}
            />
          </div>
          <div>
            <Label htmlFor="birth">Data de nascimento</Label>
            <DatePicker
              id="birth"
              value={form.birth_date}
              onChange={(v) => setForm({ ...form, birth_date: v })}
              endMonth={new Date()}
              disabled={{ after: new Date() }}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Posições * (máximo {MAX_POSITIONS})</Label>
            <ToggleGroup
              type="multiple"
              value={form.positions}
              onValueChange={(v) => {
                const mantidas = form.positions.filter((p) => v.includes(p));
                const novas = v.filter(
                  (p) => !form.positions.includes(p as Position),
                ) as Position[];
                const todas = [...mantidas, ...novas];
                if (todas.length > MAX_POSITIONS) {
                  toast.error(`Máximo de ${MAX_POSITIONS} posições`);
                  return;
                }
                setForm({ ...form, positions: todas });
              }}
              className="flex flex-wrap justify-start gap-1.5"
            >
              {POSITIONS.map((pos) => (
                <ToggleGroupItem
                  key={pos}
                  value={pos}
                  variant="outline"
                  className="h-8 px-2.5 text-xs"
                  aria-label={POSITION_LABELS[pos]}
                  title={POSITION_LABELS[pos]}
                >
                  {POSITION_ABBR[pos]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {form.positions.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Principal:{" "}
                <span className="font-medium text-foreground">
                  {POSITION_LABELS[form.positions[0]]}
                </span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={save.isPending || !isDirty}>
          {save.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
