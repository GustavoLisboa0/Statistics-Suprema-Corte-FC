import { createStart, createCsrfMiddleware } from "@tanstack/react-start";

// Start instala isso automaticamente quando src/start.ts está ausente; definir
// o arquivo desativa esse comportamento, então reativamos explicitamente pra
// manter as server functions protegidas contra requisições cross-site.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}));
