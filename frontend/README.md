    # Suprema Corte FC — Frontend

Interface web do sistema de estatísticas do Suprema Corte FC.

Stack: **TanStack Start** (React 19 + Vite + SSR), **TypeScript**, **Tailwind CSS v4**, **shadcn/ui**.

> Este projeto foi originalmente gerado com o Lovable e depois desacoplado dele:
> removemos toda a integração direta com Supabase/telemetria do editor e
> conectamos a interface ao nosso backend FastAPI (pasta `../backend`).

## Setup

```bash
npm install
cp .env.example .env
```

Edite o `.env` se o backend não estiver em `http://127.0.0.1:8000`:

```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Rodando

Com o backend FastAPI já rodando (`../backend`, veja o README principal):

```bash
npm run dev
```

Abre em `http://localhost:3000`.

## Build de produção

```bash
npm run build
npm run start
```

## Estrutura

```
frontend/
├── src/
│   ├── routes/          # páginas (index = dashboard, jogadores, partidas)
│   ├── components/      # componentes de UI (shadcn/ui em components/ui)
│   ├── lib/
│   │   ├── api.ts        # cliente HTTP genérico para o FastAPI
│   │   └── football.ts   # funções de dados + tradução de campos (PT <-> EN)
│   ├── router.tsx
│   └── start.ts
├── vite.config.ts
└── package.json
```

## Sobre a camada de dados

O backend (FastAPI + Supabase) usa nomes em português (`jogadores`, `partidas`,
`estatisticas`). A interface, por herança do que veio do Lovable, usa tipos em
inglês (`Player`, `Match`, `MatchStat`). Toda a tradução entre os dois fica
centralizada em `src/lib/football.ts` — as telas (`routes/*.tsx`) não sabem
nada sobre o formato do backend.