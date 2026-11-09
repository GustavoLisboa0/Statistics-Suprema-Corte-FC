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

## Rodar localmente (Windows, sem Supabase)

Dá para testar tudo no seu computador, sem criar conta no Supabase: com
`LOCAL_DB=1` o backend usa um banco SQLite (arquivo `backend/local.db`) e um
login próprio. Precisa de **Python 3.12** e **Node.js** instalados.

**Terminal 1 — backend** (PowerShell):

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
$env:LOCAL_DB=1
python seed_local.py        # cria dados de teste (apaga o banco local antes!)
uvicorn main:app --reload
```

**Terminal 2 — frontend**:

```powershell
cd frontend
npm install
npm run dev
```

Abra o endereço que o `npm run dev` mostrar (normalmente `http://localhost:3000`).
Logins de teste criados pelo `seed_local.py`:

| Papel               | Email                 | Senha         |
|---------------------|-----------------------|---------------|
| Admin (editor)      | `admin@suprema.com`   | `admin123`    |
| Usuário comum       | `jogador@suprema.com` | `jogador123`  |

Para rodar os testes do backend: `cd backend; $env:LOCAL_DB=1; pytest`.
O arquivo `backend/env.example` mostra as variáveis de ambiente possíveis.

## Escalador automático (4-4-2)

Menu **Escalação** no site. O administrador escolhe o jogo, confirma os
convocados (vêm da lista de presença, sem quem está punido ou lesionado),
escolhe o goleiro (fixo, nunca troca), define duração, número de
substituições e quantos jogadores trocam por vez, e clica em **Gerar**. O
sistema monta os 10 de linha (2 zagueiros, 2 laterais, 2 volantes, 2 meias e
2 atacantes) deixando os minutos parecidos e sem deixar nenhuma posição
descoberta. Dá para fixar regras ("começa jogando", "joga de zagueiro"...),
pedir outra opção, salvar e **exportar em PDF**. Usuário comum só vê a
escalação salva.

- Lógica: `backend/escalacao.py` (funções puras, testadas em `backend/tests/test_escalacao.py`).
- Rotas: `backend/routers/escalacao.py` (`/partidas/{id}/escalacao...`).
- No Supabase de verdade, rode antes `database/migration_009_escalacoes.sql`.

### V2: tempo igual, atributos, tática e contra-estratégia

- **Automático (padrão):** jogo de 90 min; o computador escolhe quantas
  substituições e quantos saem por vez para todo mundo jogar o mesmo tempo
  (minutos das trocas arredondados para cima, por causa do acréscimo). Dá para
  desligar e escolher na mão. Se as posições impedirem o tempo igual (ex.: 3
  atacantes para 2 vagas), aparece um aviso dizendo quem e como resolver.
- **Só administrador (papel `editor`):** atributos dos jogadores (velocidade,
  físico, defesa, finalização, passe, visão), nota interna do time, tática,
  estratégia e perfil de adversários. Nada disso aparece para usuário comum
  nem no PDF (as rotas devolvem 403 e a escalação salva sai sem a tática).
- **Tática** (ofensiva, defensiva, posse, contra-ataque, pressão) muda quem
  joga em cada lugar; **estratégia** muda *quando* os melhores jogam (início,
  final). O botão "Sugerir contra o adversário" usa o perfil cadastrado dele e
  o histórico de jogos.
- Lógica: `backend/tatica.py`; rotas: `backend/routers/atributos.py`.
- No Supabase de verdade, rode também `database/migration_010_atributos_taticas.sql`.

### V2.1: formações, trocas sob controle, características e regras de composição

- **Atributos e características** ficam na aba **Jogadores** (menu "⋮" do
  jogador → Atributos; só administrador). Além das 6 notas, há 16
  características (canhoto, jogo aéreo, marcador, armador, fôlego…).
- **Formações:** 4-4-2, 4-3-3, 4-5-1, 4-2-3-1, 3-5-2, 5-3-2, 3-4-3 e 5-4-1, com
  mudança durante o jogo (ex.: 4-4-2 e aos 60' vai para o 4-3-3). O botão
  "Sugerir formação" propõe uma conforme a tática.
- **Trocas:** o computador decide sozinho, com todo mundo jogando o mesmo tempo
  (no máximo 1 minuto de diferença). Ao gerar, ele compara opções — "todo mundo
  joga o mesmo tempo" (mais trocas) e "1 jogador joga o jogo todo" (menos
  trocas) — e você escolhe, podendo trocar quem é o jogador que fica o jogo
  todo. A tática e as regras de composição nunca quebram o tempo igual.
- **Formação** escolhida num seletor visual (campinhos com bolinhas), com
  variações do mesmo número (ex.: 4-4-2 e 4-4-2 losango). Mudança de formação
  no jogo acontece junto com uma troca de jogadores, não cria momento extra.
- **Aba "Tática e estratégia"** (só administrador), com três partes:
  - **Táticas**: você cria táticas com nome (ex.: "Laterais voando"). Clique num
    jogador do campinho e escolha o que ele faz em cada situação (com a bola,
    sem a bola, atacando, defendendo, contra-ataque): sobe, recua, pressiona,
    abre, fecha, infiltra... Há modelos prontos para copiar e editar. O sistema
    aplica a tática sempre que possível ao escolher quem joga onde; o tempo igual
    para todos continua mandando. Não existe mais "estratégia" nem peso da tática.
  - **Montagem do time**: regras de composição por setor (ex.: volantes, um
    rápido e um lento).
  - **Adversário**: perfil e sugestão de modelo de tática.
- **Quem joga** mostra a posição principal de cada jogador. Há também a formação
  4-2-2-2 (dois volantes e dois meias por dentro).
- **Como dividir o tempo**: só aparecem as opções que funcionam, e a lista de quem
  pode jogar o jogo todo só traz jogadores para os quais isso funciona.
- No Supabase de verdade, rode também `database/migration_012_taticas.sql`.
- O botão "?" no topo da página mostra os pesos usados nas contas.
- **PDF** com várias páginas: capa com plano de jogo (formação, tática,
  estratégia), titulares, banco e trocas, mais uma página por momento do jogo.
  Nunca leva atributos, notas, análise nem regras de composição.
- No Supabase de verdade, rode também `database/migration_011_caracteristicas.sql`.

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