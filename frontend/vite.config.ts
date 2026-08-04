import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Na Vercel (variável de ambiente VERCEL definida automaticamente pelo
    // build deles), deixa o Nitro auto-detectar e gerar o formato certo
    // (.vercel/output). Local, força "node-server" pra rodar com
    // `node .output/server/index.mjs`.
    nitro(process.env.VERCEL ? undefined : { preset: "node-server" }),
  ],
});