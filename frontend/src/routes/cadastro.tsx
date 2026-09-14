import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { cadastrar } from "@/lib/auth";
import {
  EMAIL_REGEX,
  MAX_NAME_LENGTH,
  PHONE_REGEX,
  formatPhone,
  nameHasDigits,
} from "@/lib/football";
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
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmeEmail, setConfirmeEmail] = useState(false);

  // Mostra o erro assim que dá pra saber que diverge, sem esperar o submit.
  const senhaDivergente = confirmacao.length > 0 && password !== confirmacao;

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    const nomeAparado = nome.trim();
    if (!nomeAparado) return toast.error("Informe seu nome");
    if (nameHasDigits(nomeAparado)) return toast.error("O nome não pode conter números");
    if (nomeAparado.length > MAX_NAME_LENGTH)
      return toast.error(`O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres`);
    if (!PHONE_REGEX.test(telefone))
      return toast.error("Informe um telefone válido: (DDD) 91234-1234");
    if (!EMAIL_REGEX.test(email.trim())) return toast.error("Informe um email válido");
    if (password.length < MIN_SENHA)
      return toast.error(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres`);
    if (password !== confirmacao) return toast.error("As senhas não conferem");

    setLoading(true);
    try {
      const { sessao } = await cadastrar(nomeAparado, telefone, email.trim(), password);
      if (sessao) {
        toast.success("Conta criada! Vamos completar seu cadastro de jogador.");
        navigate({ to: "/meu-jogador" });
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
          {/* CardTitle é uma <div> estilizada, não um heading real — sem isso
              a página não tem nenhum <h1> pra leitor de tela navegar por título. */}
          <h1 className="sr-only">Suprema Corte FC</h1>
          <CardTitle aria-hidden="true" className="font-display text-3xl dark:text-accent">
            Suprema Corte FC
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {confirmeEmail ? "Confirme seu email" : "Crie sua conta"}
          </p>
        </CardHeader>
        <CardContent>
          {confirmeEmail ? (
            <div className="space-y-4 text-sm">
              <p>
                Enviamos um link de confirmação para{" "}
                <span className="font-medium">{email.trim()}</span>. Abra o link e depois entre
                normalmente — vamos te levar direto pra completar seu cadastro de jogador.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/login" })}>
                Ir para o login
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="rounded-md border border-accent/40 bg-accent/10 p-3 text-xs text-muted-foreground">
                Depois de criar a conta você vai completar seu cadastro de jogador. Se um editor já
                cadastrou você antes, a gente identifica pelo email ou telefone e te mostra pra
                conferir.
              </p>
              <div>
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  maxLength={MAX_NAME_LENGTH}
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="(11) 91234-5678"
                  maxLength={15}
                  required
                  value={telefone}
                  onChange={(e) => setTelefone(formatPhone(e.target.value))}
                />
              </div>
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
                  aria-invalid={senhaDivergente}
                  aria-describedby={senhaDivergente ? "confirmacao-erro" : undefined}
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                />
                {senhaDivergente && (
                  <p id="confirmacao-erro" className="mt-1 text-xs text-destructive">
                    As senhas não conferem.
                  </p>
                )}
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
