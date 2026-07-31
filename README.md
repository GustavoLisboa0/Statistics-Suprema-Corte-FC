# Statistics Suprema Corte FC

Micro-sistema para registro de estatisticas de partidas do Suprema Corte FC.

## Estrutura

```text
Statistics-Suprema-Corte-FC/
├── backend/
├── database/
├── frontend/
└── render.yaml
```

## Setup local

### Banco de dados

1. Crie um projeto no Supabase.
2. Rode o conteudo de `database/schema.sql`.
3. Pegue a `SUPABASE_URL` e a `SUPABASE_KEY`.

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

No `.env` do frontend, use a URL publica do backend:

```bash
VITE_API_BASE_URL=https://seu-backend.onrender.com
```

## Deploy do backend

O arquivo `render.yaml` na raiz deixa o backend pronto para Render.

Passos:

1. Envie o repositório para o GitHub.
2. No Render, crie um novo deploy usando o blueprint `render.yaml`.
3. Configure as variaveis `SUPABASE_URL` e `SUPABASE_KEY`.
4. Depois do deploy, copie a URL publica do backend.
5. Coloque essa URL em `frontend/.env` e na variavel `VITE_API_BASE_URL` da Vercel.

## Endpoints principais

- `GET /jogadores/`
- `POST /jogadores/`
- `GET /partidas/`
- `POST /partidas/`
- `GET /estatisticas/`
- `GET /estatisticas/dashboard/artilheiros`
- `GET /estatisticas/dashboard/cartoes`
- `GET /estatisticas/dashboard/desempenho-time`
