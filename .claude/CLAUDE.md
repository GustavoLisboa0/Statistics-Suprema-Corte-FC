# Contexto do projeto — Statistics Suprema Corte FC

Arquivo de memória entre sessões. Registra permissões concedidas, decisões
tomadas, features entregues e erros já diagnosticados (com a solução), para
não repetir investigação.

Última atualização: 2026-11-12

> **Manutenção obrigatória (instrução do usuário, 2026-08-07):** este arquivo
> deve ser atualizado sempre que houver algo que caiba nas seções abaixo —
> nova permissão concedida, feature ou alteração relevante em algum módulo,
> erro diagnosticado (com causa e solução), commit da frente de trabalho,
> pendência criada ou resolvida, ou decisão combinada.
>
> Fazer isso **junto com a entrega**, sem esperar o usuário pedir, e atualizar
> a data acima. Ajuste pequeno e sem consequência (renomear variável, mexer em
> espaçamento) não precisa entrar — o critério é: alguém que retomar o projeto
> daqui a um mês precisaria saber disso?

---

## 1. Stack e como rodar

| Camada   | Stack                                                          | Porta |
|----------|----------------------------------------------------------------|-------|
| Frontend | TanStack Start (React 19 + Vite + **SSR**), TS, Tailwind v4, shadcn/ui | 3000 |
| Backend  | FastAPI + Pydantic v2, cliente Supabase                        | 8000  |
| Banco    | Supabase (Postgres)                                            | —     |

Ambos sobem via `preview_start` usando `.claude/launch.json` (configs
`frontend` e `backend`). **Não usar Bash para subir servidor.**

Detalhe importante do backend: a config precisa de `"cwd": "backend"`. O
`load_dotenv()` em `backend/database.py` procura o `.env` a partir do
diretório atual — rodando da raiz do repo ele não acha e o app morre com
`RuntimeError: SUPABASE_URL e SUPABASE_KEY precisam estar definidos`.

Verificação padrão de tipos: `npx tsc --noEmit -p .` dentro de `frontend/`.

---

## 2. Permissões já concedidas

Registradas em `.claude/settings.local.json` (allowlist):

- `Bash(npx tsc *)` — type-check
- `Bash(node -e ' *)` — testes rápidos de lógica em Node
- `Bash(./venv/Scripts/python.exe -c ' *)` — testes de modelos Pydantic
- `Bash(python -m pip show pydantic)`
- `Bash(git status *)`, `Bash(git add *)`, `Bash(git commit -m ' *)`, `Bash(git push *)`

### Regras de trabalho combinadas com o usuário

- **Editar este arquivo é livre** (dito pelo usuário em 2026-08-07): não pedir
  permissão nem confirmar antes de atualizar o `CLAUDE.md`. Faz parte da entrega.
- **Commit e push só quando pedido explicitamente.** Nunca por iniciativa própria.
- **Sempre entregar o SQL que precisa ser rodado no Supabase**, junto com a
  alteração. Pedido textual do usuário. O schema versionado diverge do banco
  real, então migração é sempre manual no SQL Editor.
- Idioma de trabalho: **português**. Mensagens de commit em inglês (padrão do repo).
- Separar em commits distintos mudanças que não pertencem ao mesmo assunto.

### Limitação conhecida do ambiente

`mcp__Claude_Browser__navigate` já foi bloqueado pelo classificador de
permissões em uma sessão (erro "Blocked by classifier"), impedindo validação
visual. Voltou a funcionar depois. Se acontecer, avisar o usuário em vez de
tentar contornar.

---

## 3. Features e alterações por módulo

### Banco (`database/schema.sql`)

- `schema.sql` **está desatualizado** em relação ao banco real: define
  `posicao` (singular, 5 valores), mas o sistema usa `posicoes` (array, 13
  valores). O banco real foi migrado à mão. Tratar o arquivo como referência
  parcial, nunca como verdade.
- Coluna `telefone text` (nullable de propósito — ver seção 4.1).

SQL já aplicado pelo usuário (nenhuma migração pendente em 2026-08-07):

```sql
alter table jogadores add column if not exists telefone text;
alter table jogadores alter column telefone drop not null;

alter table estatisticas_partida add column if not exists posicao text;
```

A coluna `posicao` foi confirmada no banco com um `PATCH` num id inexistente:
voltou 404 em vez de erro de coluna, sem alterar dado nenhum. Vale como
receita para checar migração sem escrever no banco.

### Backend (`backend/models.py`)

- `TELEFONE_REGEX = r"^\(\d{2}\) \d{5}-\d{4}$"`.
- `telefone` é **obrigatório em `JogadorCreate`** e **opcional em `Jogador`**
  (modelo de leitura) e `JogadorUpdate`. Essa assimetria é intencional e
  crítica — ver 4.1.
- `EstatisticaBase.posicao: Optional[Posicao]` — posição em que o jogador
  atuou naquela partida. Nullable pelo mesmo motivo de 4.1 (lançamentos
  antigos não têm o dado); o front cai na posição principal do jogador.

### Frontend

> **Redesign de 2026-11-12 (branch `redesign`, ver seção 5.10) — prevalece
> sobre os parágrafos de tema/layout logo abaixo, que ficam como histórico.**
> Resumo do estado atual: barra de topo (`components/AppTopbar.tsx`) no lugar
> da sidebar (`AppSidebar.tsx` removido); títulos em **Orbitron** maiúscula
> (`h1/h2/h3` automático), texto em **Archivo**, utilitário `num` (Archivo
> condensada) para números grandes; paleta nova nos dois temas (claro com
> fundo lavanda e cards brancos, escuro quase preto arroxeado hue ~303);
> **escuro é o tema padrão**; tokens novos `raised`, `hero*`, `chart-neg`,
> `sky*`, `warn*`; dourado único continua `#d49c10` (= `accent`); hover de
> `Button` outline/ghost agora é `muted`, não dourado.

**`src/styles.css`** — tema. O bloco `.dark` foi refeito em 2026-08-07 e
rebalanceado no mesmo dia (a primeira versão, quase sem chroma, ficou
"cinza/preta demais" no julgamento do usuário). Regra atual: **roxo emoldura,
cinza acalma, dourado destaca**. O roxo (hue 312) fica forte nas superfícies de
moldura — `sidebar`/`header` chroma 0.055, `background` 0.042 — e fraco no
conteúdo: `card` 0.024, `popover` 0.026. Isso é proposital; se o card subir de
chroma, volta a parecer roxo demais. O `header-foreground` é dourado (antes o
header inteiro era um bloco dourado). Contraste medido: mínimo 7,4:1.

O `@layer base` também define `color-scheme` (light/dark) e o estilo das
**barras de rolagem** (tokens `--scrollbar-thumb` / `--scrollbar-thumb-hover`,
mais `::-webkit-scrollbar` e `scrollbar-width`). O `color-scheme` é o que faz
os controles nativos pararem de aparecer brancos no escuro — não remover.

**Paleta em 2026-11-09:** a frente de escalação (branch `updates-breno`,
commit `14a76fd`) trocou a paleta inteira (roxo hue 312 → 294, fundo claro
cinza `0.934`, dourado `oklch(0.8037 0.1625 84)`). O usuário pediu para
voltar o **modo claro inteiro** e o **dourado do escuro** ao que eram antes
(commit `0a03704`). Estado atual: `:root` idêntico ao original (branco,
roxo 312); `.dark` com **roxo novo, hue 294** — essa mistura é intencional,
não "corrigir" para 312 sem pedido.

**Dourado único no sistema todo (pedido do usuário, mesmo dia):** o app
tinha quatro dourados (claro `0.727 0.147 82`, escuro `0.78 0.14 82`, título
do header no escuro `0.85 0.12 82` e `#f0b411` fixo na escalação/PDFs).
Agora é **um só, o do modo claro: `oklch(0.727 0.147 82)` = `#d49c10` = RGB
`[212, 156, 16]`** — nos tokens dos dois modos (inclusive
`--header-foreground` do escuro), nos desenhos de campo (`CampoEscalacao`,
`CampoFormacao`, `JogadaEnsaiada`, `QuadroTatico`, que usam hex fixo) e na
constante `DOURADO` de `escalacaoPdf.ts`/`taticaPdf.ts`. Cor nova de
dourado em qualquer lugar deve usar esse valor. Exceção deliberada: os tons
dourados claros de série de gráfico (`--chart-3`/`--chart-4`, hue 88) não
são "o dourado", são variações pra diferenciar séries. O roxo `#6410c9` dos
desenhos de campo continua fixo (não foi pedido).

Os arquivos de escalação vieram commitados com CRLF — `eslint` acusa
milhares de `Delete ␍` neles. Pré-existente, não é efeito de edição;
normalizar só se o usuário pedir (mexe no arquivo inteiro).

O tema claro (`:root`) segue branco com roxo/dourado.
Como tudo consome os tokens, mexer neles repagina o app inteiro; evitar cor
fixa nos componentes, exceto onde a cor é semântica (verde de vitória, amarelo
de cartão, roxo do jogador inativo).

**`src/lib/football.ts`** — camada de tradução PT (API) ↔ EN (telas).

- `Player.phone: string | null`, mapeado de/para `telefone`.
- `formatPhone()` — máscara progressiva `(DDD) 91234-1234`; `PHONE_REGEX`.
- `sortMatches()` — próximas partidas primeiro (da mais perto de hoje), depois
  as passadas da mais recente para a mais antiga. Aplicado em `fetchMatches()`.

**`src/components/DatePicker.tsx`** (novo) — campo de data padrão do app.
Usado em jogadores (nascimento) e partidas (data do jogo). Calendário pt-BR,
exibe `dd/MM/yyyy`, dropdowns de mês/ano, fecha ao selecionar, ignora datas
inválidas do banco (existe jogador com `0001-01-01`). Valor trafega em ISO.

**`src/lib/useUsuario.ts`** (novo) — hook que lê a sessão só após a montagem.
Usar **sempre** este hook em vez de `getUsuario()` direto no render (ver 4.2).

**`src/components/NumberInput.tsx`** (novo) — campo numérico padrão do app,
com setas de subir/descer próprias. Usar **sempre** este em vez de
`input[type=number]`: as setas nativas não são estilizáveis de forma
consistente e apareciam brancas no tema escuro. O input por dentro é `text`
com filtro de dígitos (`inputMode="numeric"`), aceita vazio, respeita
`min`/`max`/`maxDigits` e desabilita a seta ao bater no limite. Usado na
camisa do jogador, no placar e em toda a tabela de estatísticas.

**`src/components/ResultBadge.tsx`** (novo) — tag automática de Vitória /
Empate / Derrota, derivada do placar por `matchResult()`. Usada em partidas e
no dashboard. O tema não tem token de "sucesso", então a vitória usa o verde
do Tailwind; empate e derrota reaproveitam `muted` e `destructive`.
Cada variante repete a cor no `hover:` de propósito — o `Badge` traz
`hover:bg-primary/80` embutido, e sem isso a tag mudava de cor ao passar o
mouse (o usuário pediu para não mudar; as cores atuais estão aprovadas).
**Atualizado no redesign (2026-11-12):** as cores viraram as da prévia
aprovada — vitória dourada (`accent`), empate só contorno, derrota roxo
apagado (`chart-neg/30`); e o arquivo ganhou `ResultChip` (quadradinho V/E/D).
O hover neutralizado continua.

**Outras duas exceções aceitas do mesmo tipo** (OBSOLETO desde o redesign:
o clima usa os tokens `sky*` e o gráfico com `oklch(0.6 0.15 145)` saiu do
dashboard) (cor crua fora do sistema de
tokens, sem token semântico equivalente no tema — formalizado aqui a partir
da auditoria de UI/UX de 2026-08-19, ver seção 5.9): o badge de clima em
`partidas.tsx` (`sky-*` do Tailwind, não tem token de "informativo") e a
linha "Vitórias" do gráfico de desempenho em `index.tsx`
(`oklch(0.6 0.15 145)`, mesmo motivo do `ResultBadge` — é literalmente o
mesmo conceito de "vitória", só que num gráfico em vez de badge). Se um
token de sucesso/informativo for adicionado ao tema no futuro, migrar os
três juntos.

**`src/routes/jogadores.tsx`** — campo Telefone obrigatório com máscara;
data de nascimento ao lado do número da camisa. Regras do cadastro
(constantes em `football.ts`): nome sem dígitos e até 100 caracteres, apelido
até 30, camisa só dígitos e até 3, **máximo de 3 posições** (a primeira é a
principal). Card de jogador inativo ganha fundo roxo claro.

**`src/routes/login.tsx`** — (até o redesign) fundo dourado cheio no claro;
no escuro `dark:bg-background` com card de borda e título dourados. **Desde
2026-11-12:** tela dividida, painel `bg-hero` com o `<h1>` real "Suprema
Corte FC" + formulário ao lado; o truque `sr-only`/`aria-hidden` da seção
5.9 saiu (agora há um h1 visível). `cadastro.tsx` segue o mesmo layout.

**`src/routes/partidas.tsx`** — usa o `DatePicker` compartilhado. Lista
dividida em seções Agendadas / Realizadas / Canceladas; no card, status fica
ao lado da data e campo/mando/tipo na linha de baixo; `ResultBadge` ao lado do
placar. No lançamento de estatísticas os jogadores são agrupados por setor
(Goleiro, Defesa, Meio Campo, Ataque) e há coluna **Posição**: mostra apenas a
tag (`POSITION_ABBR`) da posição principal; quem tem mais de uma ganha uma
setinha ao lado para trocar pelas secundárias. Nunca exibir o nome por extenso
nem sufixo "(principal)" — pedido do usuário; o nome completo fica só no
`title` do badge. Para **visualizador** o select nem é renderizado: só a tag,
para não sugerir interação (a proteção real já vinha do `fieldset disabled`).
Títulos e dados da tabela são centralizados e as colunas usam `px-1.5`.

**`src/components/ui/calendar.tsx`** — removido
`data-[selected=true]:rounded-none` do slot `today` (ver 4.3).

---

## 4. Erros já diagnosticados — e como agir se voltarem

### 4.1 Cadastros "sumiram" após adicionar campo obrigatório

**Sintoma:** lista de jogadores vazia / erro 500 no `GET /jogadores/` depois
de tornar um campo obrigatório. Parece perda de dados no banco.

**Causa real:** o campo foi marcado obrigatório em `JogadorBase`, do qual o
modelo de **resposta** `Jogador` herda. Registros antigos com `NULL` eram
rejeitados pelo Pydantic na serialização da resposta. **Nenhum dado foi
perdido** — só a leitura quebrou.

**Como agir:** campo novo obrigatório vai em `JogadorCreate`, nunca em
`JogadorBase`/`Jogador`. No banco, a coluna entra como **nullable**; a
obrigatoriedade é responsabilidade da API. Antes de suspeitar do banco,
conferir `GET` direto em `http://localhost:8000/jogadores/`.

### 4.2 `Hydration failed` (SSR)

**Sintoma:** no console, `Hydration failed because the server rendered HTML
didn't match` e/ou avisos de `className` divergente.

**Causa:** leitura de `localStorage` durante o render. No SSR não existe
`localStorage`, então `getUsuario()` retorna `null` no servidor e o objeto no
cliente → árvores diferentes.

Caso sutil já visto: com `podeEditar` falso no servidor, o botão recebia
`className="hidden"`, e o `twMerge` remove `inline-flex` por conflito de
display → classes diferentes entre servidor e cliente no mesmo botão.

**Como agir:** usar o hook `useUsuario()`. Nunca chamar `getUsuario()` direto
no corpo de um componente.

**Erro que permanece de propósito:** o aviso de `className="dark"` no `<html>`.
Vem do script anti-flash de tema no `<head>` do `__root.tsx`. O usuário
decidiu manter — **não "corrigir"**.

### 4.3 Canto do calendário sem arredondamento

**Sintoma:** no dia de hoje, quando selecionado, um canto aparece quadrado.

**Causa:** o slot `today` tinha `data-[selected=true]:rounded-none`, zerando o
raio da célula enquanto o botão por cima seguia com 8px. **Não era** container
menor que o calendário — foi medido: calendário 235,6px dentro de popover de
237,5px, sem overflow.

**Como agir:** conferir `borderRadius` computado de `<td>` e `<button>` do dia
antes de mexer em tamanho de container.

### 4.4 Rotas protegidas redirecionam no SSR

`beforeLoad` chama `isAutenticado()`, que lê `localStorage` → sempre `false`
no servidor → hard refresh em `/jogadores` cai no `/login`. É o comportamento
atual do app (login funciona por navegação client-side).

**Impacto para testes:** não dá para abrir rota protegida direto no navegador.
Contorno já usado: trocar temporariamente por `if (false && !isAutenticado())`,
validar, e **reverter antes de terminar**. Sempre conferir com
`grep -rn "false &&" frontend/src/` antes de commitar.

Não há credenciais de teste disponíveis — não pedir senha ao usuário.

### 4.5 Transições CSS "travadas" ao medir pelo navegador do agente

**Sintoma:** um elemento com `transition` fica com o valor computado preso no
estado inicial, mesmo com o atributo `style`/classe já atualizado pelo React.
Parece bug de CSS não gerado ou de React não re-renderizar.

**Causa:** a aba do preview roda com `document.visibilityState === "hidden"`
(a Browser pane não é exibida), então o navegador não compõe frames e as
`CSSTransition` ficam eternamente em `playState: "running"` — e transição em
andamento tem precedência sobre a declaração inline.

**Como agir:** antes de concluir que o código está errado, checar
`el.getAnimations()` e `document.visibilityState`. Para medir o estado final,
zerar a transição (`el.style.transition = "none"`) e só então ler o
`getComputedStyle`. Não "consertar" código por causa disso — já aconteceu de
eu trocar classes do Tailwind por estilo inline atrás de um problema que não
existia, e depois ter que desfazer.

### 4.6 Checar se um controle está desabilitado por `fieldset`

**Sintoma:** parece que um campo dentro de `<fieldset disabled>` continua
editável, porque `el.disabled` retorna `false`.

**Causa:** a propriedade `.disabled` reflete só o **atributo** do próprio
elemento. O desabilitar herdado de um `fieldset` não escreve o atributo nos
descendentes — mas vale para interação.

**Como agir:** usar `el.matches(":disabled")` (ou tentar clicar de fato) antes
de concluir que há falha de permissão. Já perdi tempo "consertando" uma
proteção que existia.

### 4.7 `routeTree.gen.ts` perde uma rota depois de edição em lote

**Sintoma:** `tsc` acusa `Type '"/jogadores"' is not assignable to
'keyof FileRoutesByPath'` — a rota some da árvore gerada.

**Causa:** o plugin do TanStack Router regenera `src/routeTree.gen.ts` ao ver
mudança em `src/routes/`. Editar com `perl -pi` (que apaga e recria o arquivo)
faz o watcher enxergar o arquivo sumindo e remover a rota.

**Como agir:** não é preciso mexer no arquivo gerado — basta tocar de novo a
rota (qualquer alteração salva) com o dev server rodando e ele se refaz.
Conferir com `grep -c "jogadores" src/routeTree.gen.ts`. O arquivo é
gitignorado, então não polui o diff.

### 4.9 Diálogo com barra de rolagem horizontal por causa de texto longo

**Sintoma:** um texto sem quebra de linha (ex: código PIX copia-e-cola) dentro
de um `Dialog` empurra o diálogo inteiro pra largura do texto, mesmo com
`truncate` no elemento que o envolve.

**Causa:** `DialogContent` (`components/ui/dialog.tsx`) é `display: grid`.
Grid item com `overflow: visible` (o padrão) tem "tamanho mínimo automático"
igual ao `min-content` do conteúdo — ou seja, o item-filho direto do grid
nunca encolhe abaixo da largura do texto não quebrável, não importa o que
tenha dentro dele (flexbox, truncate, etc.). `min-w-0`/`flex-1` resolvem esse
problema só dentro do PRÓPRIO container flex onde são aplicados; não mudam
como um ancestral grid enxerga o tamanho mínimo do item.

**Como agir:** aplicar `min-w-0` no filho direto do `DialogContent` (o
primeiro `<div>` logo depois do `DialogHeader`), não só na caixinha do texto.
Validado numericamente injetando a mesma estrutura via `javascript_tool`:
sem o fix, `scrollWidth` do diálogo ficava ~2x o `clientWidth`; com o fix,
ficam idênticos.

### 4.10 Console do navegador acumula mensagens

`read_console_messages` mantém histórico entre navegações. Para saber se um
erro ainda existe, abrir **aba nova** (`tabs_create`). Se suspeitar de módulo
velho no dev server, reiniciar via `preview_stop` + `preview_start`.

### 4.11 Salvar partida demorando muito (>10s) — **confirmado corrigido pelo usuário, 2026-08-14**

**Sintoma:** salvar uma partida qualquer (mesmo só mudando a data) demorava
dez ou mais segundos.

**Causa, em camadas:**
1. `save` chamava `upsertMatchStats` pra todo mundo confirmado **mesmo em
   partida agendada** — as colunas de estatística já tinham sido escondidas
   da tela quando `status !== "realizada"`, mas a lógica de salvar por baixo
   continuou rodando de qualquer forma, sem eu perceber ao fazer a fusão da
   seção 5.1.
2. Esses upserts rodavam um de cada vez (`for...of` com `await`), e cada
   chamada autenticada paga sozinha um round-trip de validação de token no
   Supabase (~0,5-1,2s, medido). 15 jogadores sequenciais = 10s+ só nisso.
3. Causa mais profunda: `usuario_atual` (dependency `async`) chamava
   `_validar_token`/`papel_do_usuario` de forma bloqueante — isso trava o
   único loop de eventos do Uvicorn por chamada, então o servidor processava
   uma requisição de cada vez **mesmo recebendo várias em paralelo**.

**Como agir:** os três pontos foram corrigidos no commit `d2a1078` — (1) só
chama `upsertMatchStats` se `payload.status === "realizada"`; (2) o upsert
roda em `Promise.all`; (3) `usuario_atual` usa `asyncio.to_thread` pras
chamadas bloqueantes. Se voltar a ficar lento, comparar com esse padrão antes
de investigar do zero. Medir round-trip de auth com um token inválido de
propósito é uma forma rápida de isolar esse tipo de custo (`curl`/`fetch`
com `Authorization: Bearer token-invalido` e cronometrar) — mas cuidado, o
Supabase pode ter resposta deliberadamente lenta pra tentativas inválidas
repetidas, o que confunde a medição.

---

## 5. Histórico de commits desta frente

| Commit    | Conteúdo |
|-----------|----------|
| `1309f3b` | Telefone obrigatório (front/back/banco), date picker pt-BR, fix do canto do calendário, `.claude/` no gitignore |
| `a616b5c` | Cor de fundo da tela de login |
| `286f928` | `DatePicker` compartilhado, ordenação das partidas, correção de hidratação (`useUsuario`) |
| `475bc43` | Validações do cadastro de jogador, seções/tags da tela de partidas, posição por partida (`ResultBadge`) |
| `3c3775c` | Repaginação do tema escuro, switch de tema, `NumberInput`, barras de rolagem, ajustes da tabela de estatísticas |
| `8b590f9` | Fechamento da API: login obrigatório em todas as rotas, escrita só para editor |
| `0034171` | Presença, rateio do PIX, lista de espera, baixa de pagamento e tela de cadastro |
| `75058b3` | QR Code e copia-e-cola do PIX gerados na hora, fix do overflow do diálogo |
| `6ab44af` | Editor gerencia presença (posição/cancelar/remover/confirmar por alguém); fusão presença + estatísticas numa lista só |
| `d2a1078` | Perf: parar de salvar estatística de partida não realizada, rodar upserts em paralelo |
| `ed8635e` | TanStack Start atualizado: a Vercel bloqueava `@tanstack/start-server-core@1.169.17` (CVE-2026-102989, XSS) com 403 no `npm install`. Se o deploy voltar a falhar no install, ler o log de build antes de suspeitar do código |
| `0a03704` | Modo claro e dourado do escuro de volta à paleta anterior (ver seção 3, `styles.css`) |
| `076211f` | Dourado único no app todo (`#d49c10`): tokens do escuro, desenhos de campo e PDFs da escalação |

---

## 5.1 Em andamento: presença, pagamento e cadastro (2026-08-08)

Feature nova, decidida com o usuário antes de implementar:

- **Vínculo conta ↔ jogador:** por email (coluna nova em `jogadores`) ou
  telefone; `jogadores.perfil_id` grava o vínculo na primeira vez que casa.
  Só jogador com conta confirma presença. Haverá **tela de cadastro** antes
  do login, **restrita a quem já está no elenco** (decisão minha, comunicada:
  cadastro aberto deixaria estranhos entrarem no app do time).
- **Posição:** o modal de presença oferece as posições do perfil do jogador,
  pré-selecionada a principal. `estatisticas_partida.posicao` continua
  existindo e herda a escolha da presença como padrão.
- **Limite:** `partidas.vagas_linha` (goleiros fora da conta). Ao lotar, a
  confirmação vira **lista de espera** e o editor promove.
- **Rateio (corrigido pelo usuário):** quadra e arbitragem são **rachadas com
  o time adversário**; o goleiro é despesa só nossa. Então
  `custo_do_time = quadra/2 + arbitragem/2 + goleiro`, dividido pelas vagas de
  linha. `vagas_linha` vai de **10 a 20** (validado na API). Fonte da verdade
  no backend: `custo_do_time()` em `models.py`.
- **Chave PIX:** fica só no `.env` (`VITE_PIX_CHAVE`), não neste arquivo — o
  valor foi tirado daqui em 2026-11-12, quando o `CLAUDE.md` passou a ser
  versionado num repositório público. Banco Itaú, sem QR code. **Não commitar no
  repositório**, que é público — vai em variável de ambiente.
- **Backend será fechado:** decidido aplicar `usuario_atual`/`exige_editor`
  em todas as rotas, não só nas novas. Hoje só `/auth/me` valida token.

Status: **feature completa** (backend, presença e cadastro). Falta só o
usuário validar o fluxo logado de ponta a ponta.

Cadastro: `POST /auth/cadastro` (rota pública) + tela `/cadastro`. Recusa
email fora do elenco (403) e jogador que já tem conta (409) **antes** de criar
qualquer conta no Supabase; ao criar, grava `jogadores.perfil_id`. Se o
projeto exigir confirmação de email, a tela mostra o aviso em vez de logar.
`RootComponent` não renderiza sidebar/header em `/login` nem `/cadastro`.

Frontend entregue: `components/ConfirmarPresenca.tsx` (modal em 3 passos +
tag `PresenceBadge`), campo Email no cadastro de jogador, vagas e valores no
formulário de partida com prévia do rateio, botão "Confirmar presença" nos
cards agendados, contador `confirmados / vagas`, lista de presença com baixa
de pagamento (editor) e botão de promover da espera.

**Gestão da presença pelo editor (2026-08-11):** na lista de presença (dentro
do editar/cadastrar partida), o editor ganhou três ações além da baixa de
pagamento — todas atrás de `podeEditar`, sem efeito nenhum pra visualizador:
- **Mudar a posição:** mesmo padrão de seletor já usado na tabela de
  estatísticas (`Select` com `Badge` dentro de cada `SelectItem`); só aparece
  se o jogador tiver mais de uma posição cadastrada.
- **Cancelar** (ícone `X`): marca `status = "ausente"` — mesmo efeito de o
  jogador reabrir a confirmação e escolher "Não vou". Reaproveita o endpoint
  de status que já existia pra promover da espera (por isso o mutation foi
  renomeado de `promover` pra `mudarStatus`).
- **Retirar da lista** (ícone `Trash2` + `AlertDialog` de confirmação): apaga
  o registro de presença por completo — novo endpoint
  `DELETE /partidas/{id}/presenca/{jogador_id}`. Diferente de "cancelar": some
  da lista, e só volta se o jogador confirmar de novo pelo próprio card.

Endpoint novo `PATCH .../presenca/{jogador_id}/posicao` valida que a posição
enviada está entre as cadastradas no perfil do jogador (mesma regra do
autoatendimento). `atualizar_status` agora zera `posicao` sempre que o status
vira `"ausente"`, pra não deixar uma tag de posição pendurada num "Não vai".

**Confirmar em nome de alguém (2026-08-11):** as ações acima só valem pra
presença que já existe. Faltava o caso de alguém que avisa por fora do app
(ligação, WhatsApp) ou não tem conta — pedido explícito do usuário. Endpoint
novo `POST /partidas/{id}/presenca/{jogador_id}` (`exige_editor`, diferente do
`POST /partidas/{id}/presenca` de autoatendimento, que resolve o jogador pela
sessão): recebe só a posição, sempre tenta confirmar (caindo pra fila de
espera se lotar as vagas de linha, mesma regra do autoatendimento) e grava
`termos_aceitos = True` automaticamente — o editor está assumindo a
responsabilidade por aquela entrada, não faz sentido pedir pro jogador clicar
num checkbox que ele nem vai ver.

No frontend, dentro da "Lista de presença", um formulário compacto (visível só
pra editor, e só se sobrar alguém sem presença registrada): `Select` de
jogador ainda sem presença → `Select` de posição (pré-selecionada a principal,
só as posições daquele jogador) → botão "Confirmar". `jogadoresSemPresenca`
é `activePlayers` menos quem já tem qualquer linha na tabela `presenca`
daquela partida (independente do status).

**Sobre testar isso no navegador:** com a API fechada (ver 5.1 acima), não dá
pra ver a lista de presença renderizada de verdade sem login — validei via
`openapi.json` que as rotas existem e exigem token (401 sem Authorization),
Pydantic aceitando/rejeitando os payloads certos, e `tsc` limpo. O clique de
verdade fica para o usuário validar.

**Fusão de presença + estatísticas numa lista só (2026-08-11):** decisão do
usuário — em vez de duas seções separadas ("Lista de presença" e
"Estatísticas dos jogadores"), agora é **uma tabela só**, chamada "Jogadores",
agrupada por setor do campo como a tabela de estatísticas já era. Mudanças
combinadas, todas só frontend (nenhum endpoint novo — reaproveita tudo que já
existia):

- **Estatísticas só aparecem com a partida "Realizada".** Antes disso, a
  tabela mostra jogador, posição, confirmação e pagamento — sem as colunas de
  minutos/gols/cartões/etc, que não fazem sentido pra um jogo que ainda não
  aconteceu.
- **A lista mostra confirmado + espera + ausente juntos** (antes eram dois
  filtros: presença mostrava os três, estatística só confirmado). Ausente
  aparece com posição "—" e um controle de **reverter**: `Select` de posição
  + botão (ícone `UserCheck`) que chama o mesmo `adicionarPresenca` usado pra
  "confirmar em nome de alguém" — reconfirma sem endpoint novo, já que é um
  upsert. Pedido explícito do usuário ("a opção dele não ir deve poder ser
  revertida"); antes não existia jeito de desfazer um "Não vou" marcado pelo
  editor.
- **Colunas de estatística só entram na conta de quem confirmou de verdade**
  (`jogadoresComEstatisticas`, novo — filtra por `status === "confirmado"`
  quando há presença; sem presença nenhuma, modo legado, todo mundo entra,
  igual sempre foi). Isso importa pro `save`: sem esse filtro, `rows` teria
  entrada pra espera/ausente e o `upsertMatchStats` gravaria estatística de
  quem não jogou.
- Novo `presencaPorJogador` (Map de `player_id` → presença) substitui as
  buscas repetidas em `(presences ?? []).find(...)` dentro do render.

**Cuidado ao reescrever blocos grandes de JSX por script:** troquei ~270
linhas deste arquivo via Python (`splitlines` + slice + `write_text`) em vez
de `Edit`, pra não arriscar erro de transcrição num bloco desse tamanho.
Isso converteu o arquivo inteiro de LF pra CRLF (o `write_text` do Python no
Windows usa `os.linesep` na escrita, mesmo tendo lido em modo universal), e
só apareceu depois, no `eslint` — o `tsc` não acusa nada sobre isso. Corrigido
normalizando de volta pra LF (`data.replace(b"\r\n", b"\n")`) e rodando
`eslint --fix` pra indentação. **Rodar `eslint`, não só `tsc`, depois de
qualquer edição que passe por fora do `Edit` tool.**

Chave PIX vive em `VITE_PIX_CHAVE` (+ `_BANCO`, `_TITULAR`, `_CIDADE`) no
`.env`, que é gitignorado. **Precisa ser cadastrada no Vercel** ou a tela de
sucesso mostra "chave não configurada".

**QR Code e copia-e-cola (2026-08-08):** gerados na hora pelo app
(`src/lib/pix.ts`), não são imagem anexada em lugar nenhum — o QR estático do
banco não carrega valor, e o valor muda por partida. Implementação própria do
BR Code (padrão EMV/Banco Central): TLV + CRC16. **Validada byte a byte**
contra um código real do Itaú que o usuário colou no chat (mesma chave, nome,
cidade, sem campo de valor) — o CRC16 calculado bateu exatamente
(`/tmp/testpix.js`, não commitado). Usa `qrcode.react` (zero dependências
transitivas) para desenhar o SVG a partir do código gerado.

> **Mudou a forma de testar:** agora `/jogadores`, `/partidas` e
> `/estatisticas` exigem Bearer token válido. O truque de gravar uma sessão
> falsa no `localStorage` **não funciona mais** — o token não passa na
> validação do Supabase, o `api.ts` tenta renovar, falha e joga pro `/login`.
> Para validar tela com dado real é preciso login de verdade; não há
> credencial disponível e não se pede senha ao usuário. Alternativa usada
> antes (bypass do `beforeLoad`) só resolve a rota, não as chamadas de API.

## 5.2 Cadastro autoatendimento e permissão de dono (2026-08-15)

Redesenho do fluxo de login/cadastro, decidido com o usuário: antes disso, só
quem já tinha sido pré-cadastrado por um editor (com email) conseguia criar
conta. Agora o cadastro é aberto — o vínculo com um pré-cadastro, quando
existe, é oferecido como revisão, não como pré-requisito.

**Fluxo novo:**
1. `/cadastro` pede **nome, telefone, email e senha** (antes só email/senha).
2. `POST /auth/cadastro` cria a conta e procura, entre os jogadores **sem
   `perfil_id`**, algum com o mesmo email OU telefone (mesmo critério de
   `jogador_da_conta()` em `presenca.py`). Se achar, vincula `perfil_id` na
   hora — mas **não pula direto pro dashboard**: o front sempre manda pra
   `/meu-jogador`.
3. `/meu-jogador` (nova rota) é **uma tela só** pra criar ou revisar o
   próprio jogador — o modo é decidido pelo próprio `GET /jogadores/meu`
   (200 = já existe, formulário pré-preenchido pra revisão; 404 = formulário
   em branco pra criar do zero). Isso resolve o pedido do usuário de mostrar
   "identificamos um jogador vinculado ao seu email, confira se está certo"
   sem precisar de uma tela dedicada só pra isso — é a mesma tela de
   edição, só com o banner de contexto quando já havia um jogador.
4. Sem match no passo 2, a pessoa cai no formulário em branco e cria o
   próprio jogador via `POST /jogadores/meu` (autoatendimento, não passa
   pelo `exige_editor`).
5. Login (`/login`) também checa `GET /jogadores/meu` depois de autenticar:
   se a conta não tem jogador vinculado (ex.: fechou a aba no meio do
   cadastro, ou confirmação de email pendente na hora), redireciona pra
   `/meu-jogador` em vez do dashboard.

**Permissão de dono (terceiro nível, além de editor/visualizador):**
`PATCH /jogadores/{id}` agora aceita `Depends(usuario_atual)` em vez de
`exige_editor` — quem não é editor só edita o jogador cujo `perfil_id` bate
com o próprio `usuario.id` (senão 403), e mesmo assim o campo `ativo` é
removido do payload antes de gravar (decisão do usuário: dono só edita,
nunca desativa/exclui o próprio cadastro — isso é gestão de elenco, fica
com o editor). `DELETE` continua **só editor**, sem exceção. Fora isso, o
resto do app permanece igual ao visualizador de hoje (leitura livre,
autoconfirmação de presença já funcionava independente de papel).

**Detalhes de implementação:**
- `POST /jogadores/meu` força `email = usuario["email"]` e `ativo = True`
  no servidor, ignorando o que vier no corpo — evita alguém criar um
  jogador com email diferente da própria conta. Por isso, em
  `meu-jogador.tsx`, o campo Email é **somente leitura** (mostra o email da
  conta, não o que veio de `JogadorApi`).
- `GET /jogadores/meu` e `POST /jogadores/meu` foram registrados **antes**
  de `GET/DELETE /jogadores/{jogador_id}` no router — mesma pegadinha de
  sempre com rotas dinâmicas do FastAPI (`/meu` seria capturado por
  `/{jogador_id}` se viesse depois). Confirmado com `curl` direto (token
  inválido bateu no handler de `/meu`, não num erro de parse de UUID).
- Nenhuma migração nova: `email`, `perfil_id` e `telefone` (com os índices
  únicos `idx_jogadores_email`/`idx_jogadores_perfil`) já existiam desde
  `migration_004_presenca.sql`. O índice único de email já garante que o
  `POST /jogadores/meu` nunca colide — se o email já estivesse em algum
  jogador (reivindicado ou não), o passo 2 já teria encontrado o match.
- Em `jogadores.tsx`, o "card que é meu" (pra mostrar o lápis de
  autoedição em vez do lápis+lixeira de editor) é resolvido via
  `GET /jogadores/meu` (`player.id === meuJogador?.id`), **não** por
  comparação de email — um vínculo feito por telefone pode deixar o email
  do jogador diferente do da conta, então comparar por id é o único jeito
  confiável.
- `api.ts`: o erro lançado por `request()` agora carrega `.status` (além da
  mensagem) — necessário pra `fetchMeuJogador()` diferenciar "404 (sem
  jogador ainda, é esperado)" de um erro de verdade sem duplicar a lógica
  de fetch.

**Nome/telefone repassados do cadastro pra `/meu-jogador` (mesmo dia):**
pedido do usuário — o que a pessoa digita em nome/telefone no `/cadastro`
deve pré-preencher a tela de criação do jogador, do mesmo jeito automático
que o email já fazia (email vem de graça porque é campo nativo da conta
Supabase). Pra nome/telefone não existir esse atalho, então:
- `criar_conta()` (`backend/auth.py`) manda `nome`/`telefone` como
  `user_metadata` no `POST /auth/v1/signup` do Supabase — não em nenhuma
  tabela própria, já que ainda não existe jogador pra guardar isso.
- `usuario_atual()` e `_formatar_sessao()` (login/cadastro/refresh) leem
  esse metadata de volta e expõem `usuario.nome`/`usuario.telefone` no
  objeto de sessão do front. Isso funciona **mesmo com confirmação de email
  pendente**: a pessoa fecha a aba, confirma o link, loga depois — o
  metadata some junto do usuário no Supabase Auth, não da sessão local, então
  volta certinho no login.
- Efeito colateral bom: `usuario["telefone"]` em `auth.py` já era usado por
  `jogador_da_conta()` (`presenca.py`) como critério de match, mas como
  vinha só do campo nativo `phone` do Supabase (auth por SMS, que este app
  não usa), estava **sempre vazio** na prática — esse match por telefone era
  código morto. Com o metadata alimentando o mesmo campo, o match por
  telefone em `jogador_da_conta()` passa a funcionar de verdade.
- `frontend/src/lib/auth.ts`: `Usuario` ganhou `nome`/`telefone` (nullable).
  `meu-jogador.tsx` pré-preenche nome/telefone com esses valores só no modo
  criação (sem jogador ainda); no modo revisão prevalece o que já está
  salvo no jogador, como antes.

**Acesso a `/meu-jogador` pela sidebar (mesmo dia):** não é um item separado
em "Navegação" — o bloco do rodapé que já mostrava o usuário logado
(`AppSidebar.tsx`) virou um `Link` para `/meu-jogador`. Pedido do usuário: o
acesso ao próprio cadastro fica junto de onde a pessoa já vê quem está
logada, não misturado com Estatísticas/Jogadores/Partidas.

**Nome exibido na sidebar (correção no mesmo dia):** a primeira versão usava
`usuario.nome` (metadata da conta, capturado uma vez no `/cadastro`). O
usuário apontou que devia ser "o nome escolhido" — e o nome que realmente
vale é o do **cadastro de jogador** (`jogadores.nome`, editável a qualquer
momento em `/meu-jogador`), não o metadata congelado do cadastro inicial, que
fica desatualizado se a pessoa mudar o nome depois. `AppSidebar.tsx` agora
busca `fetchMeuJogador()` (mesma query key `["meu-jogador"]` usada em
`jogadores.tsx`/`meu-jogador.tsx`, então o cache já vem quente na maioria dos
casos) e usa nessa ordem: nome do jogador → `usuario.nome` (metadata, só
existe um instante antes de o jogador ser criado) → email (fallback final,
conta sem jogador vinculado nenhum).

**Botão Salvar de `/meu-jogador` só habilita com mudança de verdade (mesmo
dia):** pedido do usuário — abrir a tela e clicar em Salvar sem alterar nada
não deveria fazer nada (nem visualmente sugerir que dá pra clicar). Guarda um
`initialForm` (o mesmo objeto usado pra pré-preencher `form`) e compara com
`JSON.stringify` a cada render; o botão usa `disabled={save.isPending ||
!isDirty}` — o próprio `Button` do shadcn já cuida do visual "inativo" via
`disabled`. Depois de salvar com sucesso, `initialForm` é realinhado com o
`form` recém-salvo (`setInitialForm(form)` no `onSuccess`); sem isso o botão
ficaria "sujo" pra sempre depois do primeiro save, já que invalidar a query
não repete o pré-preenchimento (`initialized` já é `true`).

**Limitação conhecida, não implementada:** se o match automático por
email/telefone for falso-positivo (raro, mas telefone não tem índice único
no banco — duplicidade era possível antes disso também), não há um "não sou
eu, criar do zero" na tela de revisão. Precisaria de um editor corrigir via
SQL. Não foi pedido; ficou de fora pra não inflar o escopo.

**Como foi validado:** eu evitei submeter o `/cadastro` de verdade (sem
projeto de teste no Supabase, criaria conta real) e me limitei a `tsc`/
`eslint` limpos, `curl` direto confirmando rota/validação, e estados sem
sessão. O usuário testou o resto ao vivo, direto no ambiente local: cadastro
de verdade (confirmação de email chegou certinho), criação do próprio
jogador (`POST /jogadores/meu` → 201) e login logo em seguida
(`GET /jogadores/meu` → 200) — confirmado pelos logs do Uvicorn. **Ainda não
testado:** o caminho de match por email/telefone pré-cadastrado (a tela de
revisão em `/meu-jogador` com o banner "este é o jogador vinculado...").

## 5.3 Rótulos de papel: "Administrador" e "Usuário" (2026-08-15)

Só troca de texto na tela — pedido explícito de escopo "isso tudo no
frontend". O valor interno do `papel` (`"editor"` / `"visualizador"`)
continua igual no banco, no backend e nas comparações do front
(`usuario?.papel === "editor"` em `jogadores.tsx`/`partidas.tsx` não mudou).

`PAPEL_LABELS` (novo, em `frontend/src/lib/auth.ts`) mapeia
`editor → "Administrador"` e `visualizador → "Usuário"`. Único lugar que
mostrava o valor cru pro usuário era `AppSidebar.tsx` (`{usuario.papel}`,
com `capitalize` — removido, os rótulos novos já vêm com a caixa certa).
Se um rótulo de papel aparecer em alguma tela nova, usar `PAPEL_LABELS`, não
`usuario.papel` direto.

## 5.4 Email de confirmação de cadastro (2026-08-15)

O Supabase só deixa editar o template de email (`Confirm signup` etc.) depois
de ligar SMTP customizado — sem isso ele usa o remetente/template padrão em
inglês. Sem domínio próprio, o caminho combinado foi **Gmail SMTP** (senha de
app, não a senha normal da conta): `smtp.gmail.com`, porta 587, usuário e
"sender email" sendo o mesmo Gmail. Isso é configuração do painel do
Supabase, não do repositório — nenhum arquivo do projeto guarda essas
credenciais.

O HTML do template (branding dourado/roxo do app, com botão
`{{ .ConfirmationURL }}`) e o passo a passo completo foram entregues como
artifact, não como arquivo no repo — não commitado em lugar nenhum. Se
precisar mexer de novo no template ou lembrar os campos do SMTP, pedir pro
usuário o link do artifact ou regerar a partir desta seção.

## 5.5 Número da camisa único entre ativos (2026-08-17)

Pedido do usuário, com um requisito de processo explícito: escrever o teste
unitário **antes** de implementar e mandar o resultado (vermelho) pra
aprovação antes de mexer em código de verdade. Primeira vez que o projeto
ganha um test runner de verdade — não havia `pytest` nem pasta `tests/` até
aqui (só os testes manuais de sempre, `node -e`/`python -c`).

**Setup de teste (novo):** `backend/requirements-dev.txt` (`-r
requirements.txt` + `pytest==8.3.4`, instalado na venv já existente) e
`backend/tests/test_models.py`. Rodar com:
```
cd backend && ./venv/Scripts/python.exe -m pytest tests/ -v
```

**Regra de negócio, decidida com o usuário:** número de camisa é único só
entre jogadores **ativos**. Jogador inativo não segura o número — ele é
**zerado automaticamente** no momento em que o jogador é desativado (pedido
explícito: "não mostrar o número da camisa dele", o front já resolve isso
sozinho porque `PlayerCard` já renderizava `shirt_number ?? "–"`, não precisou
mexer lá).

**`numero_camisa_disponivel()`** (nova, em `backend/models.py`, mesmo padrão
de função pura que `custo_do_time()`): recebe a lista de jogadores (dicts) já
carregada, o número candidato e opcionalmente o id de quem está sendo
editado (pra não conflitar consigo mesmo). `None` sempre disponível. 7 casos
cobertos em `tests/test_models.py`.

**Onde é chamada** (`backend/routers/jogadores.py`, helper `_checar_numero_camisa`,
409 se ocupado):
- `POST /jogadores/` (editor)
- `POST /jogadores/meu` (autoatendimento)
- `PATCH /jogadores/{id}` — só quando `numero_camisa` está de fato mudando no
  payload. Se o payload estiver **desativando** o jogador (`ativo: false`),
  a checagem é pulada e `numero_camisa` é forçado pra `None` em vez disso —
  precedência da desativação sobre qualquer número que tenha vindo junto no
  mesmo request (o dialog do admin sempre manda o objeto inteiro, então
  `ativo` e `numero_camisa` chegam juntos ao desativar alguém).

**Frontend: nenhuma mudança necessária.** O 409 já aparece automaticamente —
tanto `jogadores.tsx` quanto `meu-jogador.tsx` já tinham
`onError: (e) => toast.error("Erro ao salvar: " + e.message)` antes disso.

**SQL entregue** (`database/migration_005_numero_camisa_unico.sql`): índice
único parcial (`where ativo = true`) — rede de segurança contra corrida de
concorrência (dois `PATCH` simultâneos passando pela checagem da API ao
mesmo tempo), não a fonte principal de verdade (essa é a API, que devolve
mensagem amigável; o índice sozinho devolveria erro cru do Postgres).
**Antes de aplicar**, achei 2 jogadores ativos com número 0 no banco real
("Gustavo Lisboa" e "Editor Teste", esse último resto de sessão de teste
anterior) — a migração teria falhado (não dá pra criar índice único em cima
de dado que já viola a unicidade). Reportei e o usuário corrigiu direto no
banco antes de eu confirmar a migração.

**Ajuste em `.claude/launch.json` (mesmo dia, sem relação direta com a
feature):** ao instalar o pytest na venv, o `--reload` do Uvicorn watchou a
pasta `venv/` inteira e disparou um reload gigante (centenas de arquivos)
só por causa do `pip install`. Adicionado `--reload-exclude venv/*` e
`--reload-exclude .pytest_cache/*` na config do backend. Não precisa reiniciar
servidor já rodando pra isso valer — só no próximo boot.

## 5.6 Punições de jogador, admin-only (2026-08-17)

Pedido do usuário, decidido em duas rodadas de perguntas antes de implementar:

1. A punição **bloqueia de verdade** a confirmação de presença (não é só uma
   anotação informativa) — decisão do usuário, mais robusta que o padrão que
   eu tinha sugerido.
2. Punição por número de jogos **desconta automaticamente** 1 a cada partida
   marcada como "realizada", mas o **admin pode reverter** o desconto.
3. Quando o jogador é barrado, a mensagem **explica o motivo e o prazo**
   (pedido explícito do usuário, ao contrário do que eu tinha sugerido —
   "genérico, sem contexto"). A punição continua **invisível em qualquer
   outro lugar do app**: não aparece na lista de jogadores, no perfil, em
   lugar nenhum — só quando o próprio jogador tenta confirmar presença
   enquanto ela vale, e só pro admin, na tela dedicada.

**Modelagem (tabela nova `punicoes`, `database/migration_006_punicoes.sql`):**
`jogador_id`, `motivo`, `tipo` (`dias` | `jogos`), e dependendo do tipo:
`termina_em` (data) OU `jogos_totais` + `jogos_cumpridos` (contador). "Ativa"
**nunca é gravado** — é sempre calculado na hora por `punicao_ativa()`
(`backend/models.py`, testada em `tests/test_models.py`: 6 casos, prazo
futuro/hoje/passado e jogos incompletos/completos/além do total). É esse
cálculo dinâmico que permite o admin "reverter" o desconto automático — basta
editar `jogos_cumpridos` pra trás e a punição volta a ficar ativa sozinha.

**Backend:**
- `routers/punicoes.py` (novo, prefixo `/jogadores`, registrado depois de
  `jogadores.router` no `main.py` — mesmo padrão de sub-rota que
  `presenca.py` já usa com `/partidas`). **Toda rota exige `exige_editor`**,
  inclusive o `GET` — diferente de todo o resto do app, aqui nem leitura é
  liberada pra quem não é editor. É isso que garante a invisibilidade pro
  jogador comum.
- `avancar_punicoes_por_jogos()` mora em `punicoes.py` (não em `partidas.py`)
  e é importada por `routers/partidas.py`, chamada em `atualizar_partida()`
  só quando o `status` está **virando** "realizada" (comparado com o status
  atual antes do update) — evita descontar de novo se a partida já realizada
  for editada de novo (ex: correção de placar).
- `routers/presenca.py`: `confirmar_presenca()` ganhou a checagem antes dos
  outros `if` (termos aceitos, posição escolhida) — se `vai_jogar` e existe
  punição ativa pro jogador, 403 com mensagem montada em `_mensagem_punicao()`
  (motivo + prazo formatado). Só bloqueia `confirmado`/`espera`; marcar
  "não vou" continua livre. `confirmar_presenca_editor` (o editor confirma em
  nome de alguém que avisou por fora) **não é bloqueado** — o editor já tem
  visão e controle total sobre as punições, faz sentido poder abrir uma
  exceção manual sem precisar apagar a punição primeiro.

**Frontend:** `PunicoesDialog.tsx` (novo componente), aberto por um ícone
novo (`ShieldAlert`) no card do jogador em `jogadores.tsx`, visível só pra
`podeEditar`. Lista punições com badge Ativa/Encerrada, formulário de criação
(motivo + tipo + prazo ou nº de jogos), exclusão com confirmação, e um
stepper +/- só nas de tipo "jogos" pra ajustar `jogos_cumpridos` — é o
mecanismo de reverter o desconto automático que o usuário pediu.
`ConfirmarPresenca.tsx` não precisou de nenhuma mudança: o erro 403 com a
mensagem completa já aparece via `onError: (e) => toast.error(e.message)`
que já existia.

**Ajuste revertido no mesmo dia:** tentei excluir `venv/` do watch do
`--reload` do Uvicorn (`--reload-exclude venv/*` em `.claude/launch.json`,
pra resolver o mesmo problema de reload gigante da seção 5.5) — quebrou o
boot (`Error: Got unexpected extra arguments`, o glob `venv/*` sendo expandido
antes de chegar no uvicorn nesse ambiente Windows). Revertido pro `--reload`
simples. **Não tentar de novo com esse padrão de glob** sem investigar por
que a expansão está acontecendo antes do uvicorn receber o argumento.

## 5.7 Lesões de jogador, autoatendimento e visível a todos (2026-08-17)

Pedido do usuário, deliberadamente o oposto de punição (5.6) em quase todo
eixo de design — perguntei de novo antes de implementar, e o usuário seguiu
as três recomendações:

1. **Visível pra todo mundo** (não só admin) — vira uma tag "Machucado" no
   card do jogador em `/jogadores`, vista por qualquer conta logada.
2. **"Até o próximo jogo" trava numa partida específica** no momento do
   registro (a próxima com `status = "agendada"`), não fica "sempre a
   próxima, seja qual for" — previsível, e se some sozinha quando essa
   partida deixa de estar agendada (aconteceu ou foi cancelada).
3. **Bloqueia confirmar presença também**, igual punição — mas aqui a
   mensagem **pode contar o motivo e o prazo** sem problema, porque foi o
   próprio jogador que registrou (diferente da punição, que é imposta pelo
   admin e por isso fica sem contexto pro jogador barrado).

**Modelagem (tabela nova `lesoes`, `database/migration_007_lesoes.sql`):**
`jogador_id`, `motivo`, `tipo` (`proximo_jogo` | `data`), e dependendo do
tipo: `partida_id` (travada no registro) OU `termina_em` (data). Mesma
filosofia de punição: "ativa" nunca é gravado, sempre calculado por
`lesao_ativa()` (`backend/models.py`, 6 casos testados em
`tests/test_models.py`) — mas aqui a função **não é totalmente pura**: pro
tipo "proximo_jogo" ela precisa do status atual da partida travada, passado
por quem chama (`status_partida_travada`), já que isso vive numa tabela
diferente e pode mudar (partida sai de "agendada" quando acontece ou é
cancelada) sem a lesão em si ser tocada.

**Backend:**
- `routers/lesoes.py` (novo) — **dois routers no mesmo arquivo**: um com
  prefixo `/jogadores` (rotas aninhadas `/jogadores/{id}/lesoes`, mesmo
  padrão de `punicoes.py`) e outro com prefixo `/lesoes` só pra
  `GET /lesoes/ativas` — agrega as lesões ativas do elenco inteiro numa
  chamada só, pra pintar a tag na lista sem N+1 (uma requisição por
  jogador). Os dois são registrados separadamente no `main.py`
  (`lesoes.router` e `lesoes.router_ativas`).
- Permissão: **leitura aberta** a qualquer `usuario_atual` (diferente de
  punição). Escrita (criar/editar/excluir) é dono-ou-editor —
  `_garantir_dono_ou_editor()` reaproveita exatamente a mesma checagem de
  `perfil_id` que `atualizar_jogador()` em `jogadores.py` já usa pra
  autoedição.
- Só pode existir **uma lesão ativa por vez** por jogador — `POST` rejeita
  com 409 se já existe uma ativa (precisa encerrar/remover a atual antes).
  Pro tipo "próximo jogo", se não houver nenhuma partida "agendada" no
  momento do registro, rejeita com 400 (não tem o que travar).
- `routers/presenca.py`: `confirmar_presenca()` ganhou uma segunda checagem
  (depois da de punição) — `_lesao_que_bloqueia(jogador_id, partida)` recebe
  a **partida sendo confirmada**, não só o jogador, porque o escopo do
  bloqueio é diferente por tipo: "próximo jogo" só bloqueia a partida exata
  travada; "até uma data" bloqueia qualquer partida cuja data caia dentro do
  prazo. Mensagem (`_mensagem_lesao`) inclui motivo e prazo, sem ressalva —
  ao contrário de punição, aqui não tem nada a esconder do próprio jogador.
- **Nenhuma mudança em `partidas.py`**: diferente do desconto automático de
  punição por jogos (que precisa mexer um contador gravado), lesão tipo
  "próximo jogo" só olha o status *atual* da partida travada — não tem
  nenhum campo pra atualizar quando a partida muda de status, então não
  precisa de hook nenhum lá.

**Frontend:**
- `LesaoDialog.tsx` (novo, espelha `PunicoesDialog.tsx`) — gestão pelo admin,
  ícone `HeartPulse` no card do jogador em `jogadores.tsx`, ao lado do de
  punições.
- `/meu-jogador` ganhou uma seção própria (inline, não é dialog — a página já
  é autoatendimento) pra registrar/ver/encerrar a própria lesão. Reaproveita
  `fetchActiveInjuries()` (o mesmo endpoint agregado da lista) filtrado pelo
  próprio `player_id`, em vez de duplicar a lógica de "essa lesão tipo
  próximo-jogo ainda vale" no frontend — essa conta já foi feita no backend.
  "Marcar como recuperado" é um `DELETE` (sem estado de histórico "encerrada
  manualmente" separado — mesma simplificação de punição).
- `jogadores.tsx`: badge "Machucado" (`variant="destructive"`) no card,
  visível a **qualquer usuário logado**, alimentado por
  `fetchActiveInjuries()` — sem tocar em `podeEditar`, é a única tag nova
  desse tipo que aparece pra visualizador também.
- **Motivo e prazo visíveis a todos (2026-08-17, mesmo dia):** pedido do
  usuário — a tag "Machucado" sozinha não bastava, o resto do elenco
  também deve ver o motivo e até quando (ou "só o próximo jogo"). O backend
  já permitia isso desde o início (`GET /jogadores/{id}/lesoes` e
  `/lesoes/ativas` só exigem `usuario_atual`, nunca `exige_editor`) — só
  faltava a UI expor. `PlayersPage` trocou `injuredIds` (um `Set<string>`)
  por `injuriesByPlayer` (`Map<string, Injury>`), e o `PlayerCard` ganhou uma
  linha de texto com `motivo — até DD/MM/AAAA` (ou "só o próximo jogo"),
  visível a qualquer um. **Editar continua só admin** — o ícone `HeartPulse`
  que abre o `LesaoDialog` de gestão segue atrás de `podeEditar`, nada mudou
  aí; só a leitura no card ficou mais completa.
- **Tag virou ícone, e "Machucado" virou "Lesionado" (mesmo dia, ajustes
  finais de UX):** o texto solto no card ("Machucado — motivo — até data")
  ficou apertado demais no card de 256px e duplicava a palavra quando o
  motivo digitado também dizia "machucado". Trocado por um ícone circular
  vermelho (`HeartPulse`, mesmo ícone do botão de admin) ao lado das tags de
  posição — motivo e prazo só aparecem num `Popover` ao clicar (usa
  `PopoverTrigger asChild` em volta de um `<button>` nativo, não do `Badge`
  direto, porque `Badge` não usa `forwardRef` e quebraria o posicionamento
  do Radix). Rótulo em todo lugar (tooltip do ícone, cabeçalho do popover)
  passou de "Machucado" pra "Lesionado".

**Limitação conhecida, não implementada:** o card de lesão tipo "próximo
jogo" não mostra qual partida é (adversário/data) — só "até a próxima
partida agendada", genérico. Buscar os detalhes da partida travada
adicionaria uma chamada extra por lesão; não foi pedido, ficou de fora pra
não inflar o escopo.

**Como foi validado:** mesma limitação de sempre — sem login de verdade,
validado por `tsc`/`eslint`/`pytest` (19 casos, incluindo os 6 novos de
`lesao_ativa`) limpos, e `curl` confirmando que as rotas novas resolvem
(`/lesoes/ativas` e `/jogadores/{id}/lesoes`) com 401 pra token inválido.
Fluxo completo (registrar, ver a tag no elenco, tentar confirmar presença e
ser bloqueado com a mensagem certa, marcar como recuperado) fica para o
usuário validar.

## 5.8 Horário do jogo e previsão do tempo (2026-08-19)

Pedido do usuário: cada partida passa a ter um horário, e a previsão do
tempo pra Curitiba naquele horário fica anexada a ela. Decidido com o
usuário antes de implementar:

1. **Provedor: Open-Meteo**, sem chave de API — mesma filosofia de evitar
   dependência paga/cadastro externo que já guiou o PIX local e o Gmail SMTP.
2. **Busca automática ao criar/editar** a partida (se a data mudou e ainda
   está dentro da janela de previsão, ~16 dias) **+ botão de recarregar**
   pro admin. **Não** implementei recarga automática a cada visita à tela —
   `/partidas` é vista por qualquer usuário logado, não só admin, e recarregar
   a cada acesso bateria na API externa à toa pra todo mundo que abrisse a
   tela. O botão resolve o mesmo problema sem esse desperdício; é trivial
   adicionar auto-refresh depois se ainda fizer falta.
3. **`horario` obrigatório só em partida nova** — mesmo padrão de
   telefone/número da camisa: campo novo obrigatório vai no `Create`, nunca
   no modelo base/leitura, senão partidas antigas sem horário quebrariam a
   listagem.
4. **Clima congela após a partida virar "realizada"** — nem a busca
   automática nem o botão de recarregar mexem mais nela; fica salvo o
   último dado buscado antes do jogo acontecer.
5. **Indisponível vira um badge muted com ícone de nuvem cortada** — só
   aparece quando a partida tem horário mas ainda não tem clima salvo
   (distante demais da janela de previsão, ou a chamada externa falhou).

**Modelagem:** `horario time null` e `clima jsonb null` em `partidas`
(`database/migration_008_horario_clima.sql`). `clima` guarda o retorno bruto
da Open-Meteo (temperatura, condição, chance de chuva, vento, quando foi
buscado) sem normalizar em colunas — é sempre lido/escrito como bloco único,
nunca filtrado por sub-campo.

**`backend/clima.py`** (novo módulo, fora de `routers/` — não é uma rota,
é integração externa reutilizável): `buscar_clima(data, horario)` chama a
Open-Meteo e devolve um dict ou `None` (nunca levanta — clima é best-effort,
não pode impedir salvar uma partida). Arredonda o horário pra hora cheia
mais próxima (`hora_mais_proxima()`, testada) porque a API só dá dados de
hora em hora. Tradução de código de tempo (WMO) pra descrição em português
em `WEATHER_CODES`. Testado ao vivo contra a API real antes de integrar
(amanhã 19:30 → arredonda pra 20h, retorna dado; daqui 60 dias → `None`),
além de 7 testes unitários das funções puras em `tests/test_clima.py`.

**`routers/partidas.py`:**
- `criar_partida`: busca clima antes de inserir, só se `status != "realizada"`.
- `atualizar_partida`: só refaz a busca se `data` ou `horario` estiverem
  de fato no payload desta edição — não bate na API à toa por causa de
  placar/observações mudando. Também respeita o congelamento pós-"realizada".
- `POST /partidas/{id}/clima` (novo): botão de recarregar. Rejeita com 400
  se a partida já foi realizada (clima congelado) ou não tem horário, e 422
  se a previsão ainda não estiver disponível pra essa data.

**Frontend:** campo "Horário" (`input type="time"`, nativo — sem componente
custom, diferente do `DatePicker`/`NumberInput`) ao lado da Data no
formulário, obrigatório com `*` só quando `!editing`. Card da partida mostra
horário junto da data, e uma linha de clima abaixo dos badges de
local/mando/tipo: badge azul-céu com temperatura+condição+chuva quando
disponível, badge muted "Clima indisponível" quando não, e o botão de
recarregar (só `podeEditar`).

**Clima real pra partida passada (2026-08-19, mesmo dia):** o usuário
questionou o design original — "temperatura não é o clima que foi naquele
dia e horário?" — apontando que congelar a última previsão numa partida já
realizada não fazia sentido quando dá pra buscar o que **realmente**
ocorreu. Testei os dois endpoints da Open-Meteo antes de mudar:
- O endpoint de previsão (`/v1/forecast`, o mesmo já usado) também devolve
  dado observado/reanalisado pra até ~93 dias atrás, se `start_date`/
  `end_date` forem no passado.
- Endpoint dedicado de arquivo histórico (`archive-api.open-meteo.com/v1/archive`,
  dados ERA5) cobre datas mais antigas, desde 1940.

`buscar_clima()` (`backend/clima.py`) decide sozinho pela data: futuro →
previsão (`_buscar_previsao`, com `chance_chuva` em %); passado →
`_buscar_historico`, que tenta o endpoint de previsão primeiro e cai pro
arquivo se a data for antiga demais, com `chuva_mm` (medido) em vez de
chance — "% de chance de chuva" não faz sentido pra algo que já aconteceu.
`Clima` (`models.py`) ganhou `chuva_mm` e `fonte` (`"previsao"` |
`"historico"`), pra front e API saberem qual dos dois campos de chuva olhar.

Isso também mudou o "congelamento": em vez de nunca mais tocar no clima
depois de "realizada", `atualizar_partida()` agora **busca o clima de
verdade automaticamente no momento em que a partida vira "realizada"**
(além de continuar buscando quando `data`/`horario` mudam) — substitui a
previsão antiga por um snapshot real assim que possível. O botão manual
(`POST /partidas/{id}/clima`) também deixou de rejeitar partida já
realizada — serve pra tentar de novo se a busca automática não achou dado
ainda (partida muito recente, o histórico da Open-Meteo pode ter um
pequeno atraso).

Extraí `indice_da_hora()` (antes inline em `buscar_clima`) como função pura
testável, usada tanto por `_buscar_previsao` quanto `_buscar_historico`.
Validado ao vivo contra a API real nos três casos (5 dias atrás → histórico
com mm; amanhã → previsão com %; 200 dias atrás → cai pro arquivo) antes de
integrar, além de 11 testes unitários em `tests/test_clima.py` (30 no total
do backend agora).

## 5.9 Skill de checklist de UI/UX (2026-08-19)

O usuário achou duas skills públicas de design (`anthropics/skills/frontend-design`
e `nextlevelbuilder/ui-ux-pro-max-skill`) e pediu avaliação antes de instalar
qualquer uma. Decisão tomada junto:

- `frontend-design` (Anthropic, passou nas 3 auditorias do skills.sh): boa,
  mas calibrada pra landing page/produto com identidade visual própria —
  "escolher uma direção estética" a cada projeto. Não instalada: o app já
  tem sistema de design próprio e aprovado (roxo/dourado, `Bebas Neue`),
  documentado neste arquivo; instalar essa skill competiria com isso.
- `ui-ux-pro-max` (nextlevelbuilder): filosofia melhor pro nosso caso
  (prioriza acessibilidade/toque/performance antes de estilo — mais
  alinhado com ferramenta interna cheia de formulário/tabela). **Mas
  reprovou na auditoria "Gen Agent Trust Hub"** do skills.sh (Socket e Snyk
  passaram). Investiguei o repositório: não é só instrução em markdown,
  instala um CLI em Python de verdade (`uipro-cli`, publicado no npm) com
  scripts que rodam durante o uso e comandos que escrevem arquivo no
  projeto (`uipro init`/`uninstall`) — o próprio `SECURITY.md` do projeto
  lista "execução arbitrária de código via o instalador" como superfície de
  risco reconhecida. Números de estrelas/forks (121k/13k) desproporcionais
  pro nicho, mais um motivo de desconfiança. **Não instalado** — envolveria
  rodar código de terceiro reprovado numa auditoria de confiança, o que cai
  na regra de nunca baixar/executar arquivo de fonte não confiável sem o
  usuário fazer isso ele mesmo, sabendo do risco.

**O que foi feito em vez disso:** escrevi um checklist próprio,
`.claude/commands/ui-ux-checklist.md` — texto puro, nenhum código de
terceiro instalado, inspirado só na *estrutura de priorização* da
ui-ux-pro-max (acessibilidade → toque → performance → estilo → layout →
tipografia → animação → formulários → navegação → gráficos), mas escrito
do zero e específico pras nossas telas/componentes reais (`NumberInput`,
`DatePicker`, badges por cor semântica etc.). Registrado como skill do
projeto (aparece na listagem de skills disponíveis).

Rodei essa checklist contra todas as telas do app e entreguei os achados
como artifact ("Auditoria de Telas"). O usuário pediu implementação de tudo
em duas rodadas (primeiro só o achado crítico, depois "faça todas as
implementações" pro resto) — **os cinco achados estão resolvidos**:

1. **`<h1>` ausente em `login.tsx`/`cadastro.tsx`:** não tinham nenhum
   heading de verdade (o "Suprema Corte FC" é renderizado por `CardTitle`,
   que é só uma `<div>` — confirmado lendo `components/ui/card.tsx`).
   Corrigido sem tocar no componente compartilhado (usado em telas com
   vários cards, onde virar heading geraria hierarquia errada): um `<h1
   className="sr-only">Suprema Corte FC</h1>` visualmente oculto entra antes
   do `CardTitle`, que passou a levar `aria-hidden="true"` pra não duplicar
   a leitura por leitor de tela. Validado via `read_page` (aparece
   `heading "Suprema Corte FC"` na árvore de acessibilidade nas duas telas)
   e console sem erro novo. As outras telas já têm `<h1>` real fora do Card,
   então o problema era só dessas duas.
2. **Sem validação inline de senha divergente no cadastro:** `cadastro.tsx`
   só acusava "As senhas não conferem" no submit. Adicionado
   `senhaDivergente` (compara ao vivo assim que o campo "Repita a senha" tem
   conteúdo) com `aria-invalid`/`aria-describedby` e mensagem abaixo do
   campo — mesmo padrão dos outros erros inline do app.
3. **Diálogo de jogador do admin sem trava de `isDirty`:** `jogadores.tsx`
   ganhou o mesmo padrão de `/meu-jogador` — `initialForm` fixado em
   `openNew`/`openEdit`, `isDirty = JSON.stringify(form) !==
   JSON.stringify(initialForm)`, botão Salvar com `disabled={save.isPending
   || !isDirty}`. Diferente de `/meu-jogador`, não precisa realinhar
   `initialForm` num `onSuccess` porque esse diálogo fecha (`setOpen(false)`)
   assim que salva.
4. **Possível desalinhamento de altura no campo Horário:** verificado ao
   vivo (injeção de DOM via `javascript_tool`) que o campo nativo `input
   type="time"` (via `Input`, `h-9`) e o botão do `DatePicker` (`Button`
   padrão shadcn, também `h-9`) renderizam ambos com exatos 36px — **não
   era bug**, e a localização certa do campo é `partidas.tsx` (o artifact
   original citou `/meu-jogador` por engano, que nem tem esse campo).
5. **Cor crua fora do sistema de tokens** (badge de clima em `partidas.tsx`
   e linha "Vitórias" do gráfico em `index.tsx`): formalizado como exceção
   aceita, mesmo caso do `ResultBadge` — texto adicionado na seção 3, logo
   depois da documentação do `ResultBadge.tsx`.

Validado com `tsc`/`eslint` limpos em cada etapa. Nada disso foi commitado
ainda — segue a regra de só commitar quando pedido.

## 5.10 Redesign visual completo (2026-11-12, branch `redesign`)

O usuário não gostava do design anterior e pediu uma proposta pelo canvas de
design (artifact "Redesign Suprema Corte FC",
https://claude.ai/artifact/WmJBau1b47CyYnMqTNAjpT, com prévia de todas as
telas). Decisões dele: fonte de título **Orbitron** (queria a Crospor, que é
paga na Envato — testamos 5 gratuitas e ele escolheu essa), navegação no
topo, escuro como padrão. Depois pediu para implementar as 8 etapas do plano
de uma vez, com agentes em paralelo, e só reportar no fim.

**Como foi feito:** etapas 1–2 (tema em `styles.css` e estrutura
`__root.tsx` + `AppTopbar.tsx`) e o `ResultBadge` compartilhado feitos
direto; etapas 3–7 por 5 agentes em paralelo, cada um com arquivos
exclusivos (dashboard `index.tsx`; partidas `partidas.tsx` +
`ConfirmarPresenca.tsx`; elenco `jogadores.tsx` + diálogos de
punição/lesão/atributos; escalação `escalacao.tsx` + 8 componentes;
`login`/`cadastro`/`meu-jogador`). Etapa 8 (revisão) feita depois.

**Regras que valem daqui pra frente:**
- O layout raiz dá o container (`max-w-[1240px]`, padding). Rota nova não
  coloca max-width/padding externo próprio.
- Cabeçalho de página: sobretítulo `text-[13px] uppercase tracking-[0.08em]
  text-muted-foreground` + `h1 text-3xl`. A Orbitron é larga: nunca reusar
  tamanhos da Bebas Neue antiga (`text-4xl+` em título quebra no celular).
- `bg-accent` = dourado (destaques, chips ativos, barras). `text-primary` =
  texto/link de destaque (roxo no claro, dourado no escuro) — dourado como
  texto sobre fundo branco não passa contraste, por isso não usar
  `text-accent` em texto no claro.
- Badge de presença (`PresenceBadge`) e botões de pagamento saíram do verde
  cru: confirmado dourado, espera contorno dourado, pago com contorno
  dourado, pendente com tokens `warn`.
- Os desenhos de campo seguem com `#6410c9`/`#d49c10` fixos e gramado verde;
  textos SVG trocaram `Barlow` (não carregada mais) por `Archivo`.
- Menus ⋯ que abrem diálogo usam `DropdownMenu modal={false}` (evita o bug do
  Radix que deixa `pointer-events: none` preso no body).

**Testes de ponta a ponta agora são possíveis sem Supabase:** o backend tem
modo local (`LOCAL_DB=1`, SQLite em `backend/local.db`, gitignorado). Config
`backend-local` em `.claude/launch.json` (porta 8000, mesma do `backend`
normal — subir só um dos dois). Seed: `LOCAL_DB=1 ./venv/Scripts/python.exe
seed_local.py` (apaga o banco local; logins de teste no README). Para ter
partidas realizadas/estatísticas no banco local usei um script no scratchpad
que chama a API (não commitado). **Importante:** o `form_input` do navegador
não dispara o `onChange` do React nos inputs controlados — no login, clicar
e digitar com `computer`.

**Validação feita (2026-11-12):** `tsc` limpo, `eslint` limpo exceto os `␍`
pré-existentes dos arquivos CRLF da escalação, `npm run build` ok. No
navegador, logado como admin no banco local: todas as telas no escuro,
dashboard e partidas no claro, diálogo de editar partida, geração de
escalação, menu do celular e ausência de rolagem horizontal em 375px nas
telas internas. Ajustes feitos na revisão: contagem de confirmados do
dashboard passou a ignorar goleiro (igual a partidas), hover dourado dos
botões outline/ghost, pontuação solta em partidas.

## 6. Pendências e pontos em aberto

- **Redesign (5.10):** commitado em 6 commits por tela (`bac521f` tema e
  barra de topo, `e930ab3` dashboard, `29b81e2` partidas, `bf07be8` elenco,
  `a986c15` escalação, `53bed38` login/cadastro/meu cadastro) e enviado
  direto pro `main` em 2026-11-12, a pedido; deploy de produção da Vercel
  ficou READY. Não testado: fluxo de usuário comum
  (sem ser admin), confirmar presença de verdade pelo botão novo, salvar
  escalação/PDF, diálogos de punição/lesão/atributos abertos no navegador.
  `NumberInput` continua com 36px de altura (abaixo dos 44px de toque);
  mexer nele afeta todas as telas.

- Horário e clima (5.8): validado com `tsc`/`eslint`/`pytest` limpos e
  chamadas reais à Open-Meteo (não simuladas) confirmando previsão, histórico
  recente e arquivo antigo. Sem teste de ponta a ponta com login de verdade:
  criar partida com horário e ver o clima aparecer no card, o botão de
  recarregar, e a busca automática do clima real ao marcar como realizada.
  Fica para o usuário validar.
- Jogadores antigos estão com `telefone = null`; só preenche ao editar cada um.
- `database/schema.sql` continua divergente do banco real (`posicao` vs `posicoes`).
- Ordenação das partidas: o usuário só validou o caso de jogos futuros. A
  regra para jogos passados (mais recente primeiro) foi decisão minha,
  comunicada e não contestada.
- Roadmap do README ainda aberto: upload de fotos (Supabase Storage) e filtro
  por campeonato no dashboard.
- Não havia jogador inativo cadastrado na validação de 2026-08-07: a cor do
  card inativo foi conferida pelas classes computadas, não com dado real.
- Fluxo de cadastro autoatendimento (5.2): usuário já validou ao vivo o
  caminho sem match (cadastro → cria o jogador do zero → login). Falta
  validar o caminho **com** match (cadastro com email ou telefone que já
  existe num jogador pré-cadastrado sem `perfil_id` → tela de revisão) e a
  edição do próprio jogador depois de já vinculado.
- Sem escape hatch de "não sou eu" na tela de revisão de `/meu-jogador` caso
  o match automático (email/telefone) seja um falso-positivo — ver 5.2.
- Punições (5.6): validado só até `tsc`/`eslint`/`pytest` limpos e `curl` com
  token inválido confirmando que as rotas resolvem. Sem teste com login de
  verdade: criar punição, bloqueio real na confirmação de presença (mensagem
  com motivo+prazo), desconto automático ao marcar partida como realizada, e
  o stepper de reverter jogos cumpridos. Fica para o usuário validar.
- Lesões (5.7): mesma limitação — falta validar com login de verdade o fluxo
  completo (registrar dos dois tipos, tag no elenco, bloqueio na confirmação
  de presença com a mensagem certa, marcar como recuperado, e a lesão tipo
  "próximo jogo" sumir sozinha quando essa partida for marcada como
  realizada ou cancelada).
- A posição por partida foi validada até o nível do banco (coluna aceita) e da
  UI (tag e seletor), mas ainda não houve um salvamento real ponta a ponta —
  isso mudaria dados do usuário, então ficou para ele fazer.
