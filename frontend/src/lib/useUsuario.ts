import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { getUsuario, type Usuario } from "@/lib/auth";

/**
 * Sessão do usuário logado, lida só depois da montagem.
 *
 * A sessão vive no localStorage, que não existe durante o SSR: ler direto no
 * render faz o HTML do servidor divergir do primeiro render no cliente e
 * quebra a hidratação. Relê a cada troca de rota para refletir login/logout.
 */
export function useUsuario(): Usuario | null {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  useEffect(() => {
    setUsuario(getUsuario());
  }, [pathname]);

  return usuario;
}
