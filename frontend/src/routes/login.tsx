import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { login } from "@/lib/auth";
import { fetchMeuJogador } from "@/lib/football";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    // No claro o fundo é o dourado cheio; no escuro ele viraria um bloco muito
    // berrante, então usa o cinza do tema e o dourado fica na borda do card.
    <div className="flex min-h-screen items-center justify-center bg-accent/100 p-4 dark:bg-background">
      <Card className="w-full max-w-sm dark:border-accent/30">
        <CardHeader className="text-center">
          {/* CardTitle é uma <div> estilizada, não um heading real — sem isso
              a página não tem nenhum <h1> pra leitor de tela navegar por título. */}
          <h1 className="sr-only">Suprema Corte FC</h1>
          <CardTitle aria-hidden="true" className="font-display text-3xl dark:text-accent">
            Suprema Corte FC
          </CardTitle>
          <p className="text-sm text-muted-foreground">Entre para acessar o sistema</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Primeiro acesso?{" "}
              <Link to="/cadastro" className="font-medium text-accent hover:underline">
                Criar conta
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
