import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { cadastrar } from "@/lib/auth";
import { EMAIL_REGEX } from "@/lib/football";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [{ title: "Criar conta — Suprema Corte FC" }],
  }),
  component: CadastroPage,
});

const MIN_SENHA = 6;

function CadastroPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmeEmail, setConfirmeEmail] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email.trim())) return toast.error("Informe um email válido");
    if (password.length < MIN_SENHA)
      return toast.error(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres`);
    if (password !== confirmacao) return toast.error("As senhas não conferem");

    setLoading(true);
    try {
      const { sessao } = await cadastrar(email.trim(), password);
      if (sessao) {
        toast.success("Conta criada! Bem-vindo.");
        navigate({ to: "/" });
      } else {
        // Projeto do Supabase com confirmação de email ativada.
        setConfirmeEmail(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a conta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-accent/100 p-4 dark:bg-background">
      <Card className="w-full max-w-sm dark:border-accent/30">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-3xl dark:text-accent">Suprema Corte FC</CardTitle>
          <p className="text-sm text-muted-foreground">
            {confirmeEmail ? "Confirme seu email" : "Crie sua conta de jogador"}
          </p>
        </CardHeader>
        <CardContent>
          {confirmeEmail ? (
            <div className="space-y-4 text-sm">
              <p>
                Enviamos um link de confirmação para{" "}
                <span className="font-medium">{email.trim()}</span>. Abra o link e depois entre
                normalmente.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/login" })}>
                Ir para o login
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {/* O cadastro é fechado: o app é do time, então só quem já foi
                  cadastrado como jogador consegue criar login. */}
              <p className="rounded-md border border-accent/40 bg-accent/10 p-3 text-xs text-muted-foreground">
                Use o mesmo email que está no seu cadastro de jogador. Se ele ainda não estiver
                lá, peça para o responsável cadastrar antes.
              </p>
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
                  autoComplete="new-password"
                  required
                  minLength={MIN_SENHA}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Mínimo de {MIN_SENHA} caracteres.
                </p>
              </div>
              <div>
                <Label htmlFor="confirmacao">Repita a senha</Label>
                <Input
                  id="confirmacao"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Criando conta..." : "Criar conta"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Já tem conta?{" "}
                <Link to="/login" className="font-medium text-accent hover:underline">
                  Entrar
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
