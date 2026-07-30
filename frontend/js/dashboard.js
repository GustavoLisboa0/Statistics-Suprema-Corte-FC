async function carregarDashboard() {
  try {
    const [artilheiros, cartoes, desempenho, proximas, resultados] = await Promise.all([
      api.estatisticas.artilheiros(1),
      api.estatisticas.cartoes(1),
      api.estatisticas.desempenhoTime(),
      api.partidas.proximas(5),
      api.partidas.resultados(5),
    ]);

    renderizarDestaques(artilheiros[0], cartoes[0]);
    renderizarDesempenho(desempenho);
    renderizarProximas(proximas);
    renderizarResultados(resultados);
  } catch (erro) {
    mostrarToast(`Não foi possível carregar o dashboard: ${erro.message}`);
  }
}

function renderizarDestaques(artilheiro, cartao) {
  const container = document.getElementById('dash-destaques');
  const cards = [];

  if (artilheiro && artilheiro.total_gols > 0) {
    cards.push(`
      <div class="card card--destaque">
        <div class="card__selo"><i class="ti ti-ball-football"></i></div>
        <p class="card__rotulo">Artilheiro</p>
        <p class="card__nome">${artilheiro.nome}</p>
        <p class="card__numero">${artilheiro.total_gols} gols</p>
      </div>
    `);
  }

  if (cartao && (cartao.total_amarelos > 0 || cartao.total_vermelhos > 0)) {
    cards.push(`
      <div class="card card--destaque">
        <div class="card__selo"><i class="ti ti-square-rounded"></i></div>
        <p class="card__rotulo">Mais advertido</p>
        <p class="card__nome">${cartao.nome}</p>
        <p class="card__numero">${cartao.total_amarelos} cartões</p>
      </div>
    `);
  }

  container.innerHTML = cards.length
    ? cards.join('')
    : '<div class="vazio">Lance as estatísticas das partidas realizadas para ver os destaques aqui.</div>';
}

function renderizarDesempenho(d) {
  const container = document.getElementById('dash-desempenho');

  if (!d || d.total_partidas === 0) {
    container.innerHTML = '<div class="vazio" style="width:100%;">Nenhuma partida realizada ainda.</div>';
    return;
  }

  container.innerHTML = `
    <div class="desempenho__item"><div class="valor cor-verde">${d.vitorias}</div><div class="rotulo">vitórias</div></div>
    <div class="desempenho__item"><div class="valor cor-neutro">${d.empates}</div><div class="rotulo">empates</div></div>
    <div class="desempenho__item"><div class="valor cor-vermelho">${d.derrotas}</div><div class="rotulo">derrotas</div></div>
    <div class="desempenho__item"><div class="valor">${d.gols_marcados}–${d.gols_sofridos}</div><div class="rotulo">gols pró/contra</div></div>
  `;
}

function renderizarProximas(partidas) {
  const container = document.getElementById('dash-proximas');

  container.innerHTML = partidas.length
    ? partidas
        .map(
          (p) => `
        <div class="item-lista">
          <div class="item-lista__principal">
            <span class="item-lista__nome">vs ${p.adversario}</span>
            <span class="item-lista__meta">${formatarData(p.data)} · ${p.local === 'casa' ? 'casa' : 'fora'}</span>
          </div>
        </div>
      `
        )
        .join('')
    : '<div class="vazio">Nenhuma partida agendada.</div>';
}

function renderizarResultados(partidas) {
  const container = document.getElementById('dash-resultados');

  container.innerHTML = partidas.length
    ? partidas
        .map(
          (p) => `
        <div class="item-lista">
          <div class="item-lista__principal">
            <span class="item-lista__nome">vs ${p.adversario}</span>
            <span class="item-lista__meta">${formatarData(p.data)}</span>
          </div>
          <span class="placar">${p.placar_suprema} × ${p.placar_adversario}</span>
        </div>
      `
        )
        .join('')
    : '<div class="vazio">Nenhum resultado ainda.</div>';
}