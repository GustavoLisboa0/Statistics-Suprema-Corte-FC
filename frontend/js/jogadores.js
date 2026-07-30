let cacheJogadores = [];

async function carregarJogadores() {
  try {
    cacheJogadores = await api.jogadores.listar();
    renderizarJogadores();
  } catch (erro) {
    mostrarToast(`Não foi possível carregar os jogadores: ${erro.message}`);
  }
}

function renderizarJogadores() {
  const busca = document.getElementById('filtro-busca-jogador').value.trim().toLowerCase();
  const posicao = document.getElementById('filtro-posicao').value;
  const mostrarInativos = document.getElementById('filtro-inativos').checked;

  const filtrados = cacheJogadores.filter((j) => {
    if (!mostrarInativos && !j.ativo) return false;
    if (posicao && j.posicao !== posicao) return false;
    if (busca && !j.nome.toLowerCase().includes(busca)) return false;
    return true;
  });

  const container = document.getElementById('lista-jogadores');

  if (filtrados.length === 0) {
    container.innerHTML = '<div class="vazio">Nenhum jogador encontrado. Cadastre o primeiro jogador do elenco.</div>';
    return;
  }

  container.innerHTML = filtrados
    .map((j) => `
      <div class="item-lista" data-id="${j.id}" data-acao="editar-jogador">
        <div class="item-lista__principal">
          <span class="item-lista__nome">${j.nome}${j.apelido ? ` "${j.apelido}"` : ''}</span>
          <span class="item-lista__meta">${rotuloPosicao(j.posicao)}${j.numero_camisa != null ? ` · nº ${j.numero_camisa}` : ''}</span>
        </div>
        <span class="badge badge--${j.ativo ? 'ativo' : 'inativo'}">${j.ativo ? 'Ativo' : 'Inativo'}</span>
      </div>
    `)
    .join('');
}

function abrirFormularioJogador(jogador = null) {
  const form = document.getElementById('form-jogador');
  form.reset();

  document.getElementById('titulo-modal-jogador').textContent = jogador ? 'Editar jogador' : 'Novo jogador';
  document.getElementById('jogador-id').value = jogador ? jogador.id : '';
  document.getElementById('btn-excluir-jogador').style.display = jogador ? 'inline-block' : 'none';

  if (jogador) {
    document.getElementById('jogador-nome').value = jogador.nome;
    document.getElementById('jogador-apelido').value = jogador.apelido || '';
    document.getElementById('jogador-numero').value = jogador.numero_camisa ?? '';
    document.getElementById('jogador-posicao').value = jogador.posicao;
    document.getElementById('jogador-nascimento').value = jogador.data_nascimento || '';
    document.getElementById('jogador-ativo').checked = jogador.ativo;
  } else {
    document.getElementById('jogador-ativo').checked = true;
  }

  abrirModal('modal-jogador');
}

async function salvarJogador(evento) {
  evento.preventDefault();

  const id = document.getElementById('jogador-id').value;
  const numero = document.getElementById('jogador-numero').value;
  const nascimento = document.getElementById('jogador-nascimento').value;

  const dados = {
    nome: document.getElementById('jogador-nome').value.trim(),
    apelido: document.getElementById('jogador-apelido').value.trim() || null,
    posicao: document.getElementById('jogador-posicao').value,
    numero_camisa: numero ? Number(numero) : null,
    data_nascimento: nascimento || null,
    ativo: document.getElementById('jogador-ativo').checked,
  };

  try {
    if (id) {
      await api.jogadores.atualizar(id, dados);
      mostrarToast('Jogador atualizado');
    } else {
      await api.jogadores.criar(dados);
      mostrarToast('Jogador cadastrado');
    }
    fecharModal('modal-jogador');
    await carregarJogadores();
  } catch (erro) {
    mostrarToast(`Erro ao salvar jogador: ${erro.message}`);
  }
}

async function excluirJogador() {
  const id = document.getElementById('jogador-id').value;
  if (!id) return;

  if (!confirm('Excluir este jogador? As estatísticas dele em partidas também serão apagadas. Essa ação não pode ser desfeita.')) {
    return;
  }

  try {
    await api.jogadores.excluir(id);
    mostrarToast('Jogador excluído');
    fecharModal('modal-jogador');
    await carregarJogadores();
  } catch (erro) {
    mostrarToast(`Erro ao excluir jogador: ${erro.message}`);
  }
}

function iniciarModuloJogadores() {
  document.getElementById('btn-novo-jogador').addEventListener('click', () => abrirFormularioJogador());
  document.getElementById('form-jogador').addEventListener('submit', salvarJogador);
  document.getElementById('btn-excluir-jogador').addEventListener('click', excluirJogador);

  document.getElementById('filtro-busca-jogador').addEventListener('input', renderizarJogadores);
  document.getElementById('filtro-posicao').addEventListener('change', renderizarJogadores);
  document.getElementById('filtro-inativos').addEventListener('change', renderizarJogadores);

  document.getElementById('lista-jogadores').addEventListener('click', (e) => {
    const item = e.target.closest('[data-acao="editar-jogador"]');
    if (!item) return;
    const jogador = cacheJogadores.find((j) => j.id === item.dataset.id);
    if (jogador) abrirFormularioJogador(jogador);
  });
}