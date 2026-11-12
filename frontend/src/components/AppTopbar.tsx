import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Instagram, LogOut, Menu, Moon, Sun, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { logout, PAPEL_LABELS } from "@/lib/auth";
import { useUsuario } from "@/lib/useUsuario";
import { fetchMeuJogador } from "@/lib/football";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Barra de topo do app (redesign 2026-11) — substitui a antiga sidebar.
 * Com só quatro seções, a navegação cabe numa linha; no celular vira um
 * menu lateral (Sheet) aberto pelo botão de hambúrguer.
 */
const items = [
  { title: "Visão geral", url: "/" },
  { title: "Elenco", url: "/jogadores" },
  { title: "Partidas", url: "/partidas" },
  { title: "Escalação", url: "/escalacao" },
] as const;

function WhatsAppIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.297.298-.496.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.955L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function isAtivo(pathname: string, url: string) {
  return url === "/" ? pathname === "/" : pathname.startsWith(url);
}

/**
 * Switch deslizante de tema. O sol/lua fica dentro do próprio botão que
 * desliza; o trilho acende em dourado no escuro.
 */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // sem storage o tema só não fica salvo
    }
  };

  // Antes de montar não dá pra saber o tema (o valor vive no localStorage),
  // então renderiza o trilho vazio pra não quebrar a hidratação nem "pular".
  const trilho =
    "relative inline-flex h-7 w-13 shrink-0 items-center rounded-full border transition-colors";

  if (!mounted) {
    return <div className={cn(trilho, "border-border bg-muted")} aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={toggle}
      aria-label="Tema escuro"
      title={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      className={cn(
        trilho,
        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header",
        isDark ? "border-accent/50 bg-accent/20" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "flex h-5.5 w-5.5 items-center justify-center rounded-full shadow-sm transition-all duration-200",
          isDark ? "translate-x-6.5 bg-accent" : "translate-x-0.5 bg-white",
        )}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-accent-foreground" aria-hidden="true" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

function iniciais(nome: string | null | undefined) {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

function Marca() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-md py-2">
      <span className="num inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-[15px] text-accent-foreground">
        SC
      </span>
      <span className="font-display text-sm font-extrabold uppercase">Suprema Corte FC</span>
    </Link>
  );
}

export function AppTopbar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);

  const usuario = useUsuario();
  // Nome escolhido de verdade é o do cadastro de jogador (editável em
  // /meu-jogador); o metadata da conta é só o que foi digitado uma vez no
  // cadastro, e fica desatualizado se a pessoa mudar o nome depois.
  const { data: meuJogador } = useQuery({
    queryKey: ["meu-jogador"],
    queryFn: fetchMeuJogador,
    enabled: !!usuario,
  });
  const nomeExibido = meuJogador?.name ?? usuario?.nome ?? usuario?.email ?? "";

  const sair = () => {
    logout();
    navigate({ to: "/login" });
  };

  return (
    <header className="sticky top-0 z-20 border-b bg-header/95 text-header-foreground backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-[1240px] items-center gap-4 px-4 md:gap-8 md:px-6">
        {/* Celular: menu lateral */}
        <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Abrir menu"
              className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted md:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle className="text-left text-sm">Suprema Corte FC</SheetTitle>
            </SheetHeader>
            <nav aria-label="Principal" className="mt-4 flex flex-col gap-1">
              {items.map((item) => {
                const ativo = isAtivo(pathname, item.url);
                return (
                  <Link
                    key={item.url}
                    to={item.url}
                    onClick={() => setMenuAberto(false)}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center rounded-lg px-3 text-[15px]",
                      ativo ? "bg-accent font-bold text-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    {item.title}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <Marca />

        {/* Desktop: navegação em linha */}
        <nav aria-label="Principal" className="hidden flex-1 items-center gap-1 md:flex">
          {items.map((item) => {
            const ativo = isAtivo(pathname, item.url);
            return (
              <Link
                key={item.url}
                to={item.url}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "flex min-h-16 items-center border-b-2 px-3.5 text-sm transition-colors",
                  ativo
                    ? "border-accent font-bold text-primary"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          {usuario && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Menu da conta de ${nomeExibido}`}
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 rounded-lg px-1.5 text-left hover:bg-muted",
                    pathname === "/meu-jogador" && "bg-muted",
                  )}
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-raised text-[13px] font-bold">
                    {iniciais(nomeExibido)}
                  </span>
                  <span className="hidden min-w-0 flex-col leading-tight lg:flex">
                    <span className="max-w-40 truncate text-sm font-semibold">{nomeExibido}</span>
                    <span className="text-xs text-muted-foreground">
                      {PAPEL_LABELS[usuario.papel]}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="truncate text-sm font-semibold">{nomeExibido}</div>
                  <div className="text-xs text-muted-foreground">{PAPEL_LABELS[usuario.papel]}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/meu-jogador">
                    <User className="mr-2 h-4 w-4" aria-hidden="true" /> Meu cadastro
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="#">
                    <WhatsAppIcon className="mr-2 h-4 w-4" /> Contato
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="#">
                    <Instagram className="mr-2 h-4 w-4" aria-hidden="true" /> Instagram
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={sair}>
                  <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
