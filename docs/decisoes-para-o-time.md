# Decisões para o time — rotas, infra e performance

Data: 2026-11-24 · Revisado em 2026-11-26. Origem: a auditoria de rotas, infra e performance de 2026-11-23. Os IDs são os da tabela de achados dela; o relatório completo fica local, com o responsável por rotas/infra, e não é versionado.

Eu cuido de rotas, infraestrutura e performance. Os itens abaixo afetam a área de outro dev, custam dinheiro ou mudam o comportamento do app, por isso ficaram fora do meu plano de correção.

- **Decidir (11):** preciso de uma resposta do time antes de mexer.
- **Avisar (3):** já tenho um caminho padrão e sigo com ele se ninguém se opuser, ou só preciso de uma ajuda pontual.

Dentro de cada grupo, os itens estão em ordem de impacto. Os tempos de produção foram medidos no navegador (aba Network) ou estimados a partir deles. A produção é ~4–6× mais lenta que a máquina onde medi: o fator vem de 4 tempos de "Gerar" medidos em produção (2026-11-24) comparados com a CPU local da mesma chamada (`backend/scripts/bench_escalacao.py`).

## As perguntas principais

1. **P1:** o "Gerar" pode mostrar primeiro só a escalação principal e trazer as outras opções num segundo momento? E, quando a principal não fica equilibrada, qual aparece primeiro? Com 15 convocados, o clique cairia de ~33 s (medido) para ~5–13 s.
2. **I1:** pagamos o plano Starter da Render (~US$ 7/mês, a conferir) ou ficamos no free, com ou sem um monitor gratuito? Hoje o servidor hiberna e a CPU é ~4–6× mais lenta.
3. **I10:** criamos uma checagem automática (tipos, testes, lint) em cada PR e passamos a trabalhar por PR em vez de enviar direto para o `main`?
4. **P5:** a "dica de quem joga o jogo todo" vai voltar para a tela? Se não, paro de calculá-la e o "trocar fixo" fica mais de 2× mais rápido (~13–29 s → ~5–13 s com 15 convocados).

## Decidir

| Item | Pergunta | Quem decide | Bloqueia |
|---|---|---|---|
| P1 | O "Gerar" pode mostrar primeiro só a escalação principal? E qual aparece primeiro quando ela não fica equilibrada? | Responsável pela escalação (regra/tática) + UI | A maior melhoria de tempo do app |
| I1 | Pagamos o plano Starter da Render, usamos um monitor gratuito ou deixamos como está? | O time (custo) | Nº de processos do solver (P2), urgência do P3 |
| P3 | O "Gerar" pode virar "pedir e acompanhar", com cancelamento? Depende do P1 e muda o fluxo da tela de escalação | Os 3 | Proteger as outras telas durante a geração; cancelamento real; progresso |
| I10 | Criamos uma checagem automática (testes, tipos, lint) em cada PR? | Os 3 (responsável pelos testes no conteúdo) | CI |
| A8 | O clima pode aparecer um pouco depois de salvar a partida, em vez de segurar o salvar? | Responsável por partidas/clima + UI | Salvar partida sem esperar a Open-Meteo |
| A3 | Quando dois admins salvam a mesma escalação, o segundo deve ser avisado em vez de sobrescrever? | Responsável pela escalação + UI + aprovação do SQL | Controle de conflito no salvar |
| A7 | Salvar as estatísticas da partida de uma vez só: tudo ou nada, ou grava o que der? | Responsável por partidas/estatísticas + UI + testes | Salvar estatísticas em 1 requisição |
| A2 | Aceitamos que um login encerrado continue valendo por até ~1 h para ganhar tempo em toda tela? | O time (segurança) | Só a validação local do login; o resto eu faço |
| I2 (migrar) | Se a Render e o Supabase estiverem em regiões diferentes, mudamos o backend de região, o Supabase, ou mantemos? Só depois de conferir (Avisar) | O time + quem administra os painéis | A mudança de região |
| I9 | Padronizamos o fim de linha (LF) para todo mundo num dia combinado? | Os 3 | Lint útil e lint no CI |
| A9 | Os endpoints de dashboard sem uso passam a ser usados ou são removidos? | Responsável pelo dashboard/estatísticas | Limpeza da API e agregação no banco |

## Avisar

| Item | O que vou fazer | Quem precisa saber | Preciso de alguém? |
|---|---|---|---|
| P5 | Paro de calcular a dica de fixos no "trocar fixo". A tela não muda. | Responsável pela escalação | Só uma confirmação de que a dica não vai voltar |
| I2 (conferir) | Peço a quem tem acesso aos painéis que confira as regiões da Render e do Supabase. Se forem iguais, o item acaba; se forem diferentes, vira "I2 (migrar)" em Decidir. | Quem administra a Render e o Supabase | Sim: alguém com acesso aos painéis. Só vira decisão se as regiões forem diferentes |
| A11 | Troco o 404 de "ainda não existe" por 200 com corpo vazio e ajusto os 2 pontos do front que tratam isso. | Responsáveis pelas telas de escalação e de meu cadastro | Não, mas aviso antes porque mexe no código deles |

---

# Decidir — detalhes

## P1 — "Gerar" calcula muito mais do que mostra

**Problema.** No modo automático, o botão "Gerar" monta a escalação principal e, no mesmo clique, várias alternativas: com 1, 2 ou 3 jogadores fixos e com outras formações. A pessoa espera por todas antes de ver qualquer uma. O mesmo cálculo roda em "outra opção" e ao adicionar ou remover uma restrição.

**Dado medido.**

| Convocados | Hoje (produção) | Só a escalação principal (estimado) |
|---|---|---|
| 13 | 22–24 s (medido) | ~3–4 s |
| 15 | ~33 s (medido) | ~5–13 s |
| 18 | ~1,1–2,3 min (estimado) | ~10–34 s |

**Decisão necessária.** São duas perguntas.

1. **As alternativas podem esperar?**
   - (a) A tela mostra a principal e um botão "Ver outras opções" calcula o resto só se a pessoa pedir.
   - (b) A tela mostra a principal na hora e as alternativas aparecem sozinhas alguns segundos depois (dois pedidos ao servidor).
   - (c) Fica como hoje: tudo num clique só.
2. **Qual aparece primeiro quando a escalação principal não fica equilibrada?** Isso acontece quando quem joga mais e quem joga menos ficam com mais de 5 minutos de diferença (`LIMITE_DIFERENCA = 5`, `backend/escalacao.py:1742`). Hoje, nesse caso, uma alternativa aparece antes da principal (`escalacao.py:1943-1946`), e a tela seleciona a primeira da lista. Com que frequência isso acontece não foi medido [hipótese].
   - (a) Manter a ordem de hoje. O caminho rápido vale só quando a principal está equilibrada; senão calcula tudo como hoje. O ganho vale só para parte dos cliques.
   - (b) Mostrar sempre a principal primeiro, com um aviso quando ela passar de 5 minutos de diferença. O ganho vale para todos os cliques, mas muda o que aparece na tela nesse caso.

**Sugestão (perf):** 1(b) com 2(a) para começar. A tela fica igual ao que é hoje e o tempo cai em todo clique em que a principal está equilibrada.

**Quem decide.** Responsável pela regra e pela tática da escalação: o que aparece e em que ordem. UI: botão ou carregamento em dois tempos.

**Fica bloqueado.** A correção do P1, que é o maior ganho de tempo do app, e o formato do P3 (o segundo pedido de 1(b) é o lugar natural para o "pedir e acompanhar").

---

## I1 — Plano gratuito da Render: hiberna e tem CPU fraca

**Problema.** No plano free (`render.yaml:6`), o servidor dorme depois de ~15 min sem uso, e a primeira tela do dia leva dezenas de segundos. Acordado, a CPU dele é bem mais lenta que a de um computador comum.

**Dado medido.** A CPU é ~4–6× mais lenta que a máquina onde medi. Exemplos: "Gerar" com 15 convocados leva ~33 s (medido); "Quem joga o jogo todo" com 18 leva ~2,2–4,7 min (estimado).

**Decisão necessária.**
- (a) **Plano Starter.** Fica sempre ligado e tem CPU maior, por ~US$ 7/mês [hipótese: valores da tabela de planos da Render; conferir antes de decidir].
- (b) **Free + monitor gratuito** (ex.: UptimeRobot) chamando o servidor a cada 5–10 min. Resolve só a hibernação; a CPU continua a mesma.
- (c) **Manter como está.**

**Sugestão (perf):** decidir depois do P1. Se, com ele, os tempos ficarem aceitáveis, (b) basta. Se não, (a).

**Quem decide.** O time, porque é custo.

**Fica bloqueado.** O número de processos do solver (P2: 1 no free, mais no pago) e a urgência do P3. Nenhuma outra correção depende disso.

---

## P3 — Durante uma geração, as outras telas ficam lentas para todo mundo

**Depende do P1.** O formato do "Gerar" que sair do P1 (um pedido ou dois) define como o "pedir e acompanhar" entraria. E muda o fluxo da tela de escalação.


**Problema.** O servidor tem um único processo para atender todas as telas. Parte do cálculo da escalação roda dentro dele, e enquanto isso as outras pessoas (dashboard, partidas, presença) esperam. A outra parte roda em processos auxiliares, mas eles disputam a mesma CPU da instância.

**Dado medido.** No "Gerar", 35–42% da CPU fica no processo principal. No "trocar fixo", fica 100%. Localmente, outras requisições levaram ~0,45 s durante uma geração (`CLAUDE.md` §5.11). Em produção isso não foi medido.

**Decisão necessária.** Como tirar o cálculo do caminho das outras telas?
- (a) **Pedir e acompanhar.** O "Gerar" devolve na hora um número de pedido. A tela mostra "calculando…", consulta a cada 1–2 s e pode cancelar. Muda a API e a tela da escalação.
- (b) **Fila num processo separado, sem mudar a API.** Protege as outras telas, mas não permite cancelar nem mostrar progresso.
- (c) **Esperar.** Fazer antes o P1/P5 e medir em produção (I11), e então escolher entre (a) e (b).

**Sugestão (perf):** (c). Depois do P1 o cálculo por clique cai muito, e a escolha fica baseada em números de produção.

**Quem decide.** Os 3: a API muda, a tela muda e os testes de API da escalação (`backend/tests/test_escalacao_api.py`) também.

**Fica bloqueado.** O P3, o cancelamento de verdade no servidor (a parte de servidor do P6) e qualquer progresso em tempo real (Socket.IO/SSE).

---

## I10 — Nenhuma checagem automática antes do deploy

**Problema.** Não existe CI: nada roda os testes, a checagem de tipos ou o lint antes de o código ir para produção. Render e Vercel publicam a partir do `main` [hipótese: auto-deploy configurado nos painéis].

**Dado medido.** Os testes do backend passam (161 hoje). A suíte levou de 88 s a 272 s conforme a carga da máquina; os mais lentos são testes do solver, de 25 a 56 s cada (registrado para o responsável pelos testes). O lint hoje dá 17.885 erros, todos de fim de linha (ver I9).

**Decisão necessária.**
1. **Criamos a checagem em cada PR?**
   - (a) Sim, e o merge fica bloqueado se ela falhar.
   - (b) Sim, só avisando.
   - (c) Não.
2. **O que roda:** checagem de tipos (`tsc`), lint (só depois do I9) e testes do backend. O responsável pelos testes decide se acelera os dois testes lentos.
3. **O time passa a trabalhar por PR** em vez de enviar direto para o `main`?

**Sugestão (infra):** 1(a), com tipos e testes desde o início e lint depois do I9.

**Quem decide.** Os 3: muda o fluxo de todos, e o responsável pelos testes define o conteúdo.

**Fica bloqueado.** O CI. O lint dentro do CI também depende do I9.

---

## A8 — Salvar partida espera a previsão do tempo

**Problema.** Ao criar ou editar uma partida, o servidor busca o clima na Open-Meteo **antes** de gravar (`backend/routers/partidas.py:72`, `:110`). Se a Open-Meteo estiver lenta, o salvar fica parado esperando. Cada chamada tem limite de 10 s, e o clima de jogo passado pode fazer 2 chamadas (`backend/clima.py:83-98`).

**Dado medido.** Nenhum em produção. Pelo código, o pior caso é ~20 s para salvar uma partida.

**Decisão necessária.**
- (a) **Gravar primeiro e buscar o clima logo depois**, no servidor. O card mostra "Clima indisponível" por alguns segundos, até a lista atualizar.
- (b) **Manter a busca antes de gravar, com limite menor** (ex.: 3 s). Se estourar, salva sem clima, como já acontece quando a API falha, e o botão de recarregar resolve.
- (c) **Manter como está.**

**Sugestão (perf):** (a). O clima já é "melhor esforço" pela regra combinada (`CLAUDE.md` §5.8).

**Quem decide.** Responsável por partidas e pela regra do clima, e UI (o card sem clima por alguns segundos).

**Fica bloqueado.** A correção do A8.

---

## A3 — Dois admins salvando a mesma escalação

**Problema.** Se dois admins abrem a mesma escalação e salvam, a gravação do segundo apaga a do primeiro sem aviso (`backend/routers/escalacao.py:496-526`). A tabela `escalacoes` não guarda versão nem data de atualização, só `created_at` (`database/migration_009_escalacoes.sql:13-22`).

**Dado medido.** Nenhum. Não sei com que frequência dois admins editam ao mesmo tempo.

**Decisão necessária.**
- (a) **Avisar.** O segundo recebe "alguém salvou antes; recarregue para ver" e a gravação dele não entra. Precisa de uma migração nova (coluna de versão), rodada à mão no SQL Editor, e da mensagem na tela.
- (b) **Manter como hoje.** Fica a última gravação; com poucos admins, o risco é baixo.

**Quem decide.** Responsável pela escalação e UI (mensagem e fluxo de recarregar), com aprovação do SQL.

**Fica bloqueado.** A correção do A3. É também o único caso concreto de "tempo real" levantado na avaliação do Socket.IO.

---

## A7 — Salvar estatísticas faz uma requisição por jogador

**Problema.** Salvar as estatísticas de uma partida manda uma requisição por jogador, todas ao mesmo tempo (15–20; `frontend/src/lib/football.ts:585-616`). Cada uma confere o login e grava separado. Se algumas falharem, a partida fica salva pela metade, sem aviso claro de quem faltou.

**Dado medido.** Nenhum em produção. O servidor tem um processo só, então as 15–20 requisições disputam a mesma fila.

**Decisão necessária.** Com um salvar único (`PUT /partidas/{id}/estatisticas`, todos os jogadores numa requisição):
- (a) **Tudo ou nada.** Se algo falhar, nada é gravado e aparece uma mensagem só [hipótese: uma gravação única no PostgREST é atômica; conferir].
- (b) **Grava o que der** e devolve a lista de quem falhou, para a tela mostrar.
- (c) **Manter como está.**

**Quem decide.** Responsável por partidas/estatísticas (regra), UI (mensagem de erro) e responsável pelos testes.

**Fica bloqueado.** A correção do A7.

---

## A2 — Conferir o login no Supabase a cada tela

**Problema.** A cada requisição, o servidor pergunta ao Supabase se o login ainda vale. O resultado fica guardado por 60 s. Na primeira tela depois do login saem 5 requisições juntas, e cada uma pergunta de novo. Dá para conferir o login direto no servidor, sem perguntar ao Supabase, mas aí um login encerrado continua valendo até expirar.

**Dado medido.** ~10 viagens ao Supabase na primeira tela depois do login, e ~0,3–1 s extra nela e a cada 60 s [hipótese: tempos por viagem do `CLAUDE.md` §5.11].

**O que muda se conferir no servidor.** Hoje, logout em todos os aparelhos, troca de senha, conta excluída ou bloqueada e troca de papel (admin ↔ usuário) valem em até 60 s. Com a conferência no servidor, valeriam só quando o login expirar: 1 h no padrão do Supabase [hipótese: conferir no painel].

**Decisão necessária.**
- (a) Aceitar para tudo.
- (b) Aceitar só para leitura. Salvar, excluir e as telas de admin continuam perguntando ao Supabase.
- (c) Não aceitar. Faço só a parte sem risco: evitar a pergunta repetida em paralelo e reaproveitar a conexão.

**Sugestão (perf):** (c) agora e, se a medição do I11 mostrar que o login pesa, rediscutir (b).

**Quem decide.** O time, porque é segurança e permissão.

**Fica bloqueado.** Só a conferência no servidor. A parte (c) eu faço sozinho e está no plano.

---

## I2 — Migrar a região (só se as regiões forem diferentes)

**Problema.** Se a Render e o Supabase estiverem em regiões diferentes, toda consulta ao banco paga a distância entre elas, e cada tela faz várias. Isso só se resolve deixando os dois na mesma região. Depende de conferir as regiões antes (ver "I2 — Conferir", na parte Avisar).

**Dado medido.** Nenhum ainda. O peso da distância só aparece medindo em produção (I11).

**Decisão necessária.**
- (a) **Mover o backend para a região do Supabase.** Recria-se o serviço na Render [hipótese: a Render não muda a região de um serviço existente]. A URL da API muda, então é preciso atualizar `VITE_API_BASE_URL` na Vercel.
- (b) **Migrar o Supabase.** É grande: banco, contas de login e chaves.
- (c) **Manter**, se a medição do I11 mostrar que a distância pesa pouco.

**Sugestão (infra):** se for preciso mudar, (a), que é bem menor que (b).

**Quem decide.** O time, com quem administra a Render e o Supabase.

**Fica bloqueado.** A mudança de região.

---

## I9 — Fim de linha diferente entre as máquinas

**Problema.** No Windows, o Git converte os arquivos para outro formato de fim de linha (CRLF) ao baixar. O formatador acusa isso como erro em quase todo arquivo, e o lint deixa de servir para encontrar problemas reais.

**Dado medido.** 17.885 erros de lint, todos "Delete ␍". 146 arquivos estão em LF no repositório e em CRLF na cópia local (`git ls-files --eol`). Nesta máquina, `core.autocrlf=true`.

**Decisão necessária.**
- (a) **Padronizar em LF num dia combinado, sem branches abertas.** Entra um `.gitattributes`, e cada um atualiza a própria cópia local uma vez (o passo a passo vai junto do PR).
- (b) **Padronizar só depois de fechar as branches atuais.**
- (c) **Não padronizar.** Cada um ajusta o próprio Git (`core.autocrlf=input`), sem garantia.

**Quem decide.** Os 3, porque muda o checkout de todos e pode dar conflito em branches abertas.

**Fica bloqueado.** Um lint que serve para alguma coisa, o lint no CI (I10) e diffs sem ruído de fim de linha.

---

## A9 — Endpoints de dashboard que ninguém chama

**Problema.** A API tem endpoints de resumo do dashboard (`/estatisticas/dashboard/*`) e outros que o front não chama. A lista completa está no A9 da auditoria (local). Enquanto isso, o dashboard baixa todas as estatísticas (`/estatisticas/`) e faz as contas no navegador. Os endpoints de resumo dependem de views do banco que talvez não existam no banco real [hipótese].

**Dado medido.** `/estatisticas/` tem 18 KB (2,3 KB compactado, `CLAUDE.md` §5.11) e cresce a cada partida. Hoje não pesa.

**Decisão necessária.**
- (a) **O dashboard passa a usar os resumos feitos no banco.** É preciso conferir e criar as views com SQL manual no Supabase.
- (b) **Remover os endpoints sem uso.**
- (c) **Manter os dois caminhos.**

**Quem decide.** Responsável pelo dashboard e pelas contas das estatísticas, com aprovação do SQL se for (a).

**Fica bloqueado.** A limpeza da API (A9) e a agregação no banco.

---

# Avisar — detalhes

## P5 — "Trocar fixo" calcula uma dica que a tela não mostra mais

**Caminho padrão:** (a) parar de calcular. Paro de calcular a dica de fixos no "trocar fixo". A tela não muda.

**Problema.** Ao trocar quem joga o jogo todo dentro de uma opção, o servidor gera a escalação e, em seguida, calcula uma "dica de fixos" (`sugerir_fixos`, `backend/routers/escalacao.py:403-408`). A tela parou de mostrar essa dica no commit `ed15dd8` (2026-11-09, "escalacao simplificada"). Hoje o único uso no front é o tipo em `frontend/src/lib/escalacao.ts:319`. O cálculo é feito e descartado em todo clique.

**Dado medido.** A dica gasta 2,2–8,9 s de CPU local, sobre 1,0–5,5 s da geração: mais que dobra o clique. Em produção (estimado), o "trocar fixo" leva ~13–29 s com 15 convocados e ~32–86 s com 18. Sem a dica, levaria ~5–13 s e ~10–34 s.

**Decisão necessária.** A dica vai voltar para a tela?
- (a) Não. Paro de calcular, e a tela não muda em nada. A função `sugerir_fixos` continua existindo e testada (`backend/tests/test_tatica.py:276`).
- (b) Sim. Passa a ser calculada só quando a tela pedir, num botão ou num pedido separado.
- (c) Sim, junto com a geração, como antes. Fica como está.

**Sugestão (perf):** (a). Talvez nem precise de reunião: basta uma confirmação do responsável pela escalação.

**Quem decide.** Responsável pela escalação, com a UI se a resposta for (b).

**Fica bloqueado.** A correção do P5.

---

## I2 — Conferir as regiões da Render e do Supabase

**Caminho padrão:** peço a quem tem acesso aos painéis que confira as duas regiões. Se forem a mesma, o item acaba aqui. Se forem diferentes, vira a decisão "I2 — Migrar a região", na parte Decidir.

**Problema.** Cada tela faz várias consultas ao banco, e cada consulta paga a distância entre o servidor (Render) e o banco (Supabase). O `render.yaml` não define região. O padrão da Render é Oregon, nos EUA [hipótese: confirmar no painel]. A região do Supabase não está registrada em lugar nenhum.

**Dado medido.** Nenhum. Cada tela faz ~5 consultas, mais 2 viagens de login quando o cache está frio. O peso da distância só aparece medindo em produção (I11).

**Quem precisa ajudar.** Quem administra a Render e o Supabase (só para ler a região de cada painel).

**Fica bloqueado.** Declarar `region:` no `render.yaml` e separar, nas medições do I11, o que é rede do que é CPU.

---

## A11 — "Ainda não existe" responde como erro 404

**Caminho padrão:** (a) responder 200 com `null`. Troco o 404 de "ainda não existe" por 200 com corpo vazio e ajusto os 2 pontos do front que tratam isso.

**Problema.** Quando a escalação de uma partida ainda não foi salva, ou a conta ainda não tem jogador, a API responde 404 (`backend/routers/escalacao.py:529-533`, `backend/routers/jogadores.py:40-46`). O front trata isso como "vazio" (`frontend/src/lib/escalacao.ts:360-367`, `frontend/src/lib/football.ts:499-507`), mas cada visita deixa um erro no console e na aba de rede.

**Dado medido.** Sem custo de tempo. É ruído que atrapalha achar erros reais.

**Decisão necessária.**
- (a) **Responder 200 com corpo vazio (`null`)** e ajustar os 2 pontos do front que tratam o 404.
- (b) **Manter o 404.**

**Quem decide.** Responsáveis pelas telas de escalação e de meu cadastro, porque o código que trata o 404 é deles.

**Fica bloqueado.** A correção do A11.
