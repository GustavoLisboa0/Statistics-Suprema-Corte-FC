let cachePartidas = [];
let estatisticasDaPartidaAtual = [];

async function carregarPartidas() {
  try {
    const status = document.getElementById('filtro-status-partida').value;
    cachePartidas = await api.partidas.listar(status || null);
    renderizarPartidas();
  } catch (erro) {
    mostrarToast(`Não foi possível carregar as partidas: ${erro.message}`);
  }
}

function renderizarPartidas() {
  const container = document.getElementById('lista-partidas');

  if (cachePartidas.length === 0) {
    container.innerHTML = '<div class="vazio">Nenhuma partida encontrada. Cadastre a próxima partida do time.</div>';
    return;
  }

  container.innerHTML = cachePartidas
    .map((p) => `
      <div class="item-lista" data-id="${p.id}" data-acao="editar-partida">
        <div class="item-lista__principal">
          <span class="item-lista__nome">${formatarData(p.data)} · vs ${p.adversario}</span>
          <span class="item-lista__meta">${p.local === 'casa' ? 'Em casa' : 'Fora de casa'}${p.campeonato_ou_amistoso ? ` · ${p.campeonato_ou_amistoso}` : ''}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          ${p.status === 'realizada' ? `<span class="placar">${p.placar_suprema} × ${p.placar_adversario}</span>` : ''}
          <span class="badge badge--${p.status}">${rotuloStatus(p.status)}</span>
        </div>
      </div>
    `)
    .join('');
}

function renderizarTabelaEstatisticas() {
  const corpo = document.getElementById('tabela-estatisticas-corpo');
  const jogadoresAtivos = cacheJogadores.filter((j) => j.ativo);

  if (jogadoresAtivos.length === 0) {
    corpo.innerHTML = '<tr><td colspan="9" style="color:var(--roxo-suave);padding:10px 6px;">Cadastre jogadores ativos para lançar estatísticas.</td></tr>';
    return;
  }

  corpo.innerHTML = jogadoresAtivos
    .map((j) => {
      const existente = estatisticasDaPartidaAtual.find((e) => e.jogador_id === j.id) || {};
      const ehGoleiro = j.posicao === 'goleiro';
      return `
        <tr data-jogador-id="${j.id}" data-estatistica-id="${existente.id || ''}">
          <td>${j.nome}</td>
          <td><input type="checkbox" data-campo="titular" ${existente.titular ? 'checked' : ''}></td>
          <td><input type="number" min="0" data-campo="minutos_jogados" value="${existente.minutos_jogados ?? 0}"></td>
          <td><input type="number" min="0" data-campo="gols" value="${existente.gols ?? 0}"></td>
          <td><input type="number" min="0" data-campo="assistencias" value="${existente.assistencias ?? 0}"></td>
          <td><input type="number" min="0" data-campo="cartoes_amarelos" value="${existente.cartoes_amarelos ?? 0}"></td>
          <td><input type="number" min="0" data-campo="cartoes_vermelhos" value="${existente.cartoes_vermelhos ?? 0}"></td>
          <td>${ehGoleiro ? `<input type="number" min="0" data-campo="defesas" value="${existente.defesas ?? 0}">` : '—'}</td>
          <td>${ehGoleiro ? `<input type="number" min="0" data-campo="gols_sofridos" value="${existente.gols_sofridos ?? 0}">` : '—'}</td>
        </tr>
      `;
    })
    .join('');
}

async function abrirFormularioPartida(partida = null) {
  const form = document.getElementById('form-partida');
  form.reset();

  document.getElementById('titulo-modal-partida').textContent = partida ? 'Editar partida' : 'Nova partida';
  document.getElementById('partida-id').value = partida ? partida.id : '';
  document.getElementById('btn-excluir-partida').style.display = partida ? 'inline-block' : 'none';
  document.getElementById('bloco-estatisticas').style.display = partida ? 'block' : 'none';

  if (partida) {
    document.getElementById('partida-data').value = partida.data;
    document.getElementById('partida-adversario').value = partida.adversario;
    document.getElementById('partida-local').value = partida.local;
    document.getElementById('partida-status').value = partida.status;
    document.getElementById('partida-placar-suprema').value = partida.placar_suprema;
    document.getElementById('partida-placar-adversario').value = partida.placar_adversario;
    document.getElementById('partida-campeonato').value = partida.campeonato_ou_amistoso || '';
    document.getElementById('partida-observacoes').value = partida.observacoes || '';

    try {
      estatisticasDaPartidaAtual = await api.estatisticas.listarPorPartida(partida.id);
    } catch (erro) {
      estatisticasDaPartidaAtual = [];
    }
    renderizarTabelaEstatisticas();
  } else {
    document.getElementById('partida-status').value = 'agendada';
    estatisticasDaPartidaAtual = [];
  }

  abrirModal('modal-partida');
}

async function salvarEstatisticasDaPartida(partidaId) {
  const linhas = document.querySelectorAll('#tabela-estatisticas-corpo tr[data-jogador-id]');

  for (const linha of linhas) {
    const jogadorId = linha.dataset.jogadorId;
    const estatisticaId = linha.dataset.estatisticaId;

    const dados = {
      jogador_id: jogadorId,
      partida_id: partidaId,
      titular: linha.querySelector('[data-campo="titular"]').checked,
      minutos_jogados: Number(linha.querySelector('[data-campo="minutos_jogados"]').value || 0),
      gols: Number(linha.querySelector('[data-campo="gols"]').value || 0),
      assistencias: Number(linha.querySelector('[data-campo="assistencias"]').value || 0),
      cartoes_amarelos: Number(linha.querySelector('[data-campo="cartoes_amarelos"]').value || 0),
      cartoes_vermelhos: Number(linha.querySelector('[data-campo="cartoes_vermelhos"]').value || 0),
    };

    const campoDefesas = linha.querySelector('[data-campo="defesas"]');
    const campoGolsSofridos = linha.querySelector('[data-campo="gols_sofridos"]');
    if (campoDefesas) dados.defesas = Number(campoDefesas.value || 0);
    if (campoGolsSofridos) dados.gols_sofridos = Number(campoGolsSofridos.value || 0);

    if (estatisticaId) {
      await api.estatisticas.atualizar(estatisticaId, dados);
    } else {
      await api.estatisticas.criar(dados);
    }
  }
}

async function salvarPartida(evento) {
  evento.preventDefault();

  const id = document.getElementById('partida-id').value;

  const dados = {
    data: document.getElementById('partida-data').value,
    adversario: document.getElementById('partida-adversario').value.trim(),
    local: document.getElementById('partida-local').value,
    status: document.getElementById('partida-status').value,
    placar_suprema: Number(document.getElementById('partida-placar-suprema').value || 0),
    placar_adversario: Number(document.getElementById('partida-placar-adversario').value || 0),
    campeonato_ou_amistoso: document.getElementById('partida-campeonato').value.trim() || null,
    observacoes: document.getElementById('partida-observacoes').value.trim() || null,
  };

  try {
    let partidaId = id;
    if (id) {
      await api.partidas.atualizar(id, dados);
    } else {
      const criada = await api.partidas.criar(dados);
      partidaId = criada.id;
    }

    if (id) {
      await salvarEstatisticasDaPartida(partidaId);
    }

    mostrarToast(id ? 'Partida atualizada' : 'Partida cadastrada. Abra novamente para lançar as estatísticas.');
    fecharModal('modal-partida');
    await carregarPartidas();
  } catch (erro) {
    mostrarToast(`Erro ao salvar partida: ${erro.message}`);
  }
}

async function excluirPartida() {
  const id = document.getElementById('partida-id').value;
  if (!id) return;

  if (!confirm('Excluir esta partida? As estatísticas lançadas para ela também serão apagadas. Essa ação não pode ser desfeita.')) {
    return;
  }

  try {
    await api.partidas.excluir(id);
    mostrarToast('Partida excluída');
    fecharModal('modal-partida');
    await carregarPartidas();
  } catch (erro) {
    mostrarToast(`Erro ao excluir partida: ${erro.message}`);
  }
}

function iniciarModuloPartidas() {
  document.getElementById('btn-nova-partida').addEventListener('click', () => abrirFormularioPartida());
  document.getElementById('form-partida').addEventListener('submit', salvarPartida);
  document.getElementById('btn-excluir-partida').addEventListener('click', excluirPartida);
  document.getElementById('filtro-status-partida').addEventListener('change', carregarPartidas);

  document.getElementById('lista-partidas').addEventListener('click', (e) => {
    const item = e.target.closest('[data-acao="editar-partida"]');
    if (!item) return;
    const partida = cachePartidas.find((p) => p.id === item.dataset.id);
    if (partida) abrirFormularioPartida(partida);
  });
}