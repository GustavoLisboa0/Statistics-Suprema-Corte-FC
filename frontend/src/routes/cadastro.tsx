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

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [{ title: "Criar conta — Suprema Corte FC" }],
  }),
  component: CadastroPage,
});

const MIN_SENHA = 6;

const PASSOS = ["Crie sua conta", "Confira seu cadastro de jogador", "Confirme presença"] as const;

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
            Crie sua conta e confirme presença nos jogos do time.
          </p>
        </div>
        <ol aria-label="Etapas" className="flex flex-col gap-3 text-sm text-hero-muted">
          {PASSOS.map((passo, i) => (
            <li
              key={passo}
              aria-current={i === 0 ? "step" : undefined}
              className="flex items-center gap-3"
            >
              <span
                aria-hidden="true"
                className={
                  i === 0
                    ? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-extrabold text-accent-foreground"
                    : "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hero-muted/50 text-[13px] font-bold"
                }
              >
                {i + 1}
              </span>
              <span className={i === 0 ? "font-semibold text-hero-foreground" : undefined}>
                {passo}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <main className="flex flex-[1_1_480px] items-center justify-center px-4 py-12 sm:px-6">
        <div className="flex w-full max-w-[420px] flex-col gap-6">
          {confirmeEmail ? (
            <>
              <div>
                <h2 className="mb-2 text-2xl leading-tight">Confirme seu email</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Enviamos um link de confirmação para{" "}
                  <span className="font-semibold break-all text-foreground">{email.trim()}</span>.
                  Abra o link e depois entre normalmente — vamos te levar direto pra completar seu
                  cadastro de jogador.
                </p>
              </div>
              <Button className="h-12 w-full font-bold" onClick={() => navigate({ to: "/login" })}>
                Ir para o login
              </Button>
            </>
          ) : (
            <>
              <div>
                <h2 className="mb-2 text-2xl leading-tight">Criar conta</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Depois de criar a conta você completa seu cadastro de jogador. Se um administrador
                  já cadastrou você, identificamos pelo email ou telefone e mostramos para você
                  conferir.
                </p>
              </div>
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    autoComplete="name"
                    maxLength={MAX_NAME_LENGTH}
                    required
                    className="h-12"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input
                    id="telefone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="(11) 91234-5678"
                    maxLength={15}
                    required
                    className="h-12"
                    value={telefone}
                    onChange={(e) => setTelefone(formatPhone(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
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
                    autoComplete="new-password"
                    required
                    minLength={MIN_SENHA}
                    aria-describedby="password-dica"
                    className="h-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p id="password-dica" className="text-xs text-muted-foreground">
                    Mínimo de {MIN_SENHA} caracteres.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirmacao">Repita a senha</Label>
                  <Input
                    id="confirmacao"
                    type="password"
                    autoComplete="new-password"
                    required
                    aria-invalid={senhaDivergente}
                    aria-describedby={senhaDivergente ? "confirmacao-erro" : undefined}
                    className="h-12 aria-[invalid=true]:border-2 aria-[invalid=true]:border-destructive"
                    value={confirmacao}
                    onChange={(e) => setConfirmacao(e.target.value)}
                  />
                  {senhaDivergente && (
                    <p id="confirmacao-erro" className="text-xs text-destructive">
                      As senhas não conferem.
                    </p>
                  )}
                </div>
                <Button type="submit" className="h-12 w-full font-bold" disabled={loading}>
                  {loading ? "Criando conta..." : "Criar conta"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground">
                Já tem conta?{" "}
                <Link
                  to="/login"
                  className="inline-flex min-h-11 items-center font-bold text-primary hover:underline"
                >
                  Entrar
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
