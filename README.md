# Statistics Suprema Corte FC

Micro-sistema para registro de estatísticas de partidas do Suprema Corte FC (futebol amador).

## Estrutura do projeto

```
Statistics-Suprema-Corte-FC/
├── backend/
│   ├── main.py              # App FastAPI
│   ├── database.py          # Conexão com Supabase
│   ├── models.py            # Schemas Pydantic
│   ├── routers/
│   │   ├── jogadores.py     # CRUD de jogadores
│   │   ├── partidas.py      # CRUD de partidas
│   │   └── estatisticas.py  # CRUD + endpoints do dashboard
│   ├── requirements.txt
│   └── .env.example
├── database/
│   ├── schema.sql
│   └── migration_001_status_partidas.sql
├── frontend/
│   ├── src/
│   │   ├── routes/           # páginas: dashboard (index), jogadores, partidas
│   │   ├── components/       # UI (shadcn/ui em components/ui)
│   │   ├── lib/
│   │   │   ├── api.ts         # cliente HTTP para o backend
│   │   │   └── football.ts    # dados + tradução de campos PT <-> EN
│   │   ├── router.tsx
│   │   └── start.ts
│   ├── vite.config.ts
│   └── package.json
└── README.md
```

Stack do frontend: TanStack Start (React 19 + Vite + SSR) + TypeScript +
Tailwind CSS v4 + shadcn/ui. Detalhes em `frontend/README.md`.

## Setup

### 1. Banco de dados (Supabase)

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Vá em **SQL Editor** e rode o conteúdo de `database/schema.sql`
3. Em **Project Settings → API**, copie a `URL` do projeto e a chave (`anon` para começar)

### 2. Backend (FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env          # depois edite com SUPABASE_URL e SUPABASE_KEY

uvicorn main:app --reload
```

A API sobe em `http://127.0.0.1:8000`. Documentação interativa automática em
`http://127.0.0.1:8000/docs`.

### 3. Endpoints principais

| Método | Rota                                       | Descrição                          |
|--------|---------------------------------------------|-------------------------------------|
| GET    | `/jogadores/`                                | Lista jogadores                     |
| POST   | `/jogadores/`                                | Cria jogador                        |
| PATCH  | `/jogadores/{id}`                            | Atualiza jogador                    |
| DELETE | `/jogadores/{id}`                            | Remove jogador                      |
| GET    | `/partidas/`                                 | Lista partidas                      |
| POST   | `/partidas/`                                 | Cria partida                        |
| GET    | `/estatisticas/?partida_id=...`              | Estatísticas de uma partida         |
| POST   | `/estatisticas/`                             | Lança estatística de um jogador     |
| GET    | `/estatisticas/dashboard/artilheiros`        | Ranking de artilheiros              |
| GET    | `/estatisticas/dashboard/cartoes`            | Ranking de cartões                  |
| GET    | `/estatisticas/dashboard/desempenho-time`    | Vitórias/empates/derrotas/gols      |

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env    # ajuste VITE_API_BASE_URL se o backend não estiver em 127.0.0.1:8000
npm run dev
```

Acesse `http://localhost:3000`. Com o backend rodando em paralelo
(`http://127.0.0.1:8000`), o app já carrega jogadores, partidas e o dashboard.

### 5. Autenticação (editor / visualizador)

O app tem login obrigatório, com dois papéis: **editor** (cria/edita/exclui)
e **visualizador** (só lê). Não existe cadastro público — as contas são
criadas manualmente por você.

**a) Rode a migração:**
`database/migration_003_perfis_login.sql` no SQL Editor do Supabase (cria a
tabela `perfis` e o gatilho que atribui `visualizador` por padrão a toda
conta nova).

**b) Crie as duas contas:**
No painel do Supabase → **Authentication → Users → Add user**, crie duas
contas com email/senha (ex: `editor@time.com` e `visualizador@time.com`).
Anote o UUID de cada uma (aparece na lista de usuários).

**c) Promova uma delas a editor:**
No SQL Editor:
```sql
update perfis set papel = 'editor' where id = 'COLE-O-UUID-AQUI';
```
A outra conta já fica como `visualizador` por padrão — não precisa fazer nada.

**d) Pronto:** abra o frontend, faça login com qualquer uma das duas contas.
A de papel `editor` vê os botões de criar/editar/excluir; a `visualizador`
só navega e lê os dados.

## Roadmap

- [x] Backend (FastAPI + Supabase)
- [x] Frontend (jogadores, partidas + estatísticas, dashboard) — TanStack Start
- [ ] Upload de fotos de jogadores (Supabase Storage) — v2
- [x] Autenticação/login para edição (papéis editor/visualizador)
- [ ] Filtro por campeonato no dashboard