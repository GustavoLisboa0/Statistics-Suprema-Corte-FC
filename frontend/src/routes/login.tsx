import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { login } from "@/lib/auth";
import { fetchMeuJogador } from "@/lib/football";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Entrar — Suprema Corte FC" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      // Conta sem jogador vinculado (ex.: fechou a aba no meio do cadastro)
      // cai direto na tela de completar o cadastro, em vez do dashboard.
      const meuJogador = await fetchMeuJogador();
      navigate({ to: meuJogador ? "/" : "/meu-jogador" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-wrap bg-background text-foreground">
      <section
        aria-label="Apresentação"
        className="flex min-h-[360px] flex-[1_1_420px] flex-col justify-between gap-10 bg-hero px-6 py-10 text-hero-foreground sm:px-12 sm:py-14"
      >
        <span
          aria-hidden="true"
          className="num inline-flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-accent text-[22px] text-accent-foreground"
        >
          SC
        </span>
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl leading-tight">
            Suprema
            <br />
            Corte FC
          </h1>
          <p className="max-w-[360px] text-base leading-relaxed text-hero-muted">
            Elenco, partidas, presença e escalação do time num só lugar.
          </p>
        </div>
        {/* Espaçador: mantém o título no meio do painel sem inventar números
            (a tela de login não tem sessão pra buscar dado real). */}
        <span aria-hidden="true" />
      </section>

      <main className="flex flex-[1_1_480px] items-center justify-center px-4 py-12 sm:px-6">
        <div className="flex w-full max-w-[400px] flex-col gap-7">
          <div>
            <h2 className="mb-2 text-2xl leading-tight">Entrar</h2>
            <p className="text-[15px] text-muted-foreground">
              Use o email da sua conta para acessar o sistema.
            </p>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="email@exemplo.com"
                required
                className="h-12"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-12 w-full font-bold" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Primeiro acesso?{" "}
            <Link
              to="/cadastro"
              className="inline-flex min-h-11 items-center font-bold text-primary hover:underline"
            >
              Criar conta
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
