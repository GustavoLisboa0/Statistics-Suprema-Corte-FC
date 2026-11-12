import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Dado "fresco" por 30s: voltar para uma tela ou abrir outra que usa a
        // mesma lista (jogadores, partidas, estatísticas...) mostra na hora, sem
        // refazer a busca. Antes era 0 e TODA troca de tela refazia tudo.
        // Quem salva algo já invalida a chave certa (invalidateQueries), então
        // as próprias alterações aparecem na hora; só a mudança de OUTRA pessoa
        // pode levar até 30s (ou o próximo foco na aba).
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        // Erro 4xx (não achou, sem permissão) não melhora tentando de novo:
        // o padrão (3 tentativas com espera crescente) só atrasava a tela.
        retry: (tentativas, erro) => {
          const status = (erro as { status?: number }).status;
          if (status && status >= 400 && status < 500) return false;
          return tentativas < 2;
        },
      },
    },
  });
  // Catálogo da escalação (formações, funções, atributos): é fixo no código do
  // servidor, então vale por 1h em vez de ser buscado de novo a cada abertura.
  queryClient.setQueryDefaults(["escalacao-catalogo"], { staleTime: 60 * 60_000 });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Carrega o código da tela (e o que ela pedir) quando o mouse chega no
    // link ou o dedo encosta, antes do clique: a navegação parece instantânea.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
