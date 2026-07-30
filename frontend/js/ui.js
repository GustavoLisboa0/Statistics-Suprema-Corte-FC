function abrirModal(id) {
  document.getElementById(id).classList.add('aberto');
}

function fecharModal(id) {
  document.getElementById(id).classList.remove('aberto');
}

document.addEventListener('click', (e) => {
  if (e.target.dataset.fecharModal) {
    fecharModal(e.target.dataset.fecharModal);
  }
  if (e.target.classList.contains('modal-fundo')) {
    e.target.classList.remove('aberto');
  }
});

function mostrarToast(mensagem) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.classList.add('visivel');
  setTimeout(() => toast.classList.remove('visivel'), 2500);
}

function formatarData(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function rotuloPosicao(posicao) {
  const mapa = {
    goleiro: 'Goleiro',
    zagueiro: 'Zagueiro',
    lateral: 'Lateral',
    meio: 'Meio-campo',
    atacante: 'Atacante',
  };
  return mapa[posicao] || posicao;
}

function rotuloStatus(status) {
  const mapa = { agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada' };
  return mapa[status] || status;
}