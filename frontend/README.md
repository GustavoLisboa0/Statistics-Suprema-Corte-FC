# Suprema Corte FC - Frontend

Interface web do sistema de estatisticas do Suprema Corte FC.

Stack: TanStack Start, React 19, Vite, SSR, TypeScript, Tailwind CSS v4 e shadcn/ui.

Este projeto foi desacoplado do editor original e conectado ao backend FastAPI em `../backend`.

## Setup

```bash
npm install
cp .env.example .env
```

Edite o `.env` para apontar para a URL publica do backend:

```bash
VITE_API_BASE_URL=https://seu-backend.onrender.com
```

## Rodando localmente

Com o backend FastAPI rodando em paralelo:

```bash
npm run dev
```

Abre em `http://localhost:3000`.

## Deploy

Na Vercel, configure a variavel de ambiente `VITE_API_BASE_URL` com a URL publica do backend FastAPI. Sem isso, o front nao encontra os dados.

## Estrutura

```text
frontend/
├── src/
│   ├── routes/       # paginas
│   ├── components/   # componentes de UI
│   ├── lib/
│   │   ├── api.ts    # cliente HTTP para o backend
│   │   └── football.ts
│   ├── router.tsx
│   └── start.ts
├── vite.config.ts
└── package.json
```

## Camada de dados

O backend usa nomes em portugues como `jogadores`, `partidas` e `estatisticas`.
O frontend traduz esses formatos em `Player`, `Match` e `MatchStat` dentro de `src/lib/football.ts`.
