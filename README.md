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
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── api.js          # comunicação com o backend
│       ├── ui.js            # utilitários (modal, toast, formatação)
│       ├── jogadores.js
│       ├── partidas.js      # inclui lançamento de estatísticas
│       ├── dashboard.js
│       └── app.js           # navegação e inicialização
└── README.md
```

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

SPA em HTML/CSS/JS puro (sem build step). Como ele faz `fetch` para a API,
precisa ser servido por um servidor local (abrir o `index.html` direto com
`file://` bloqueia as requisições por CORS).

```bash
cd frontend
python -m http.server 5500
```

Depois acesse `http://127.0.0.1:5500`. Com o backend rodando em paralelo
(`http://127.0.0.1:8000`), o app já deve carregar jogadores, partidas e o
dashboard.

Se o backend estiver em outro endereço, ajuste `API_BASE` em `frontend/js/api.js`.

## Roadmap

- [x] Backend (FastAPI + Supabase)
- [x] Frontend (jogadores, partidas + estatísticas, dashboard)
- [ ] Upload de fotos de jogadores (Supabase Storage) — v2
- [ ] Autenticação/login para edição
- [ ] Filtro por campeonato no dashboard