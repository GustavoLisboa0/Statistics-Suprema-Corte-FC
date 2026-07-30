function mudarSecao(nomeSecao) {
  document.querySelectorAll('.nav__item').forEach((el) => {
    el.classList.toggle('ativa', el.dataset.secao === nomeSecao);
  });
  document.querySelectorAll('.secao').forEach((el) => {
    el.classList.toggle('ativa', el.id === `secao-${nomeSecao}`);
  });

  if (nomeSecao === 'dashboard') carregarDashboard();
  if (nomeSecao === 'jogadores') carregarJogadores();
  if (nomeSecao === 'partidas') carregarPartidas();
}

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.nav__item').forEach((botao) => {
    botao.addEventListener('click', () => mudarSecao(botao.dataset.secao));
  });

  iniciarModuloJogadores();
  iniciarModuloPartidas();

  // Carrega jogadores primeiro: a tabela de estatísticas de partida
  // depende da lista de jogadores ativos estar em cache.
  await carregarJogadores();
  await carregarDashboard();
});