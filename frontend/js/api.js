// Ajuste aqui se a API estiver rodando em outro endereço
const API_BASE = 'http://127.0.0.1:8000';

async function apiRequest(caminho, opcoes = {}) {
  const resposta = await fetch(`${API_BASE}${caminho}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });

  if (!resposta.ok) {
    let detalhe = `Erro ${resposta.status}`;
    try {
      const corpo = await resposta.json();
      detalhe = corpo.detail || detalhe;
    } catch (e) {}
    throw new Error(detalhe);
  }

  if (resposta.status === 204) return null;
  return resposta.json();
}

const api = {
  jogadores: {
    listar: () => apiRequest('/jogadores/'),
    obter: (id) => apiRequest(`/jogadores/${id}`),
    criar: (dados) => apiRequest('/jogadores/', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id, dados) => apiRequest(`/jogadores/${id}`, { method: 'PATCH', body: JSON.stringify(dados) }),
    excluir: (id) => apiRequest(`/jogadores/${id}`, { method: 'DELETE' }),
  },
  partidas: {
    listar: (status) => apiRequest(`/partidas/${status ? `?status=${status}` : ''}`),
    obter: (id) => apiRequest(`/partidas/${id}`),
    proximas: (limite = 5) => apiRequest(`/partidas/proximas?limite=${limite}`),
    resultados: (limite = 5) => apiRequest(`/partidas/resultados?limite=${limite}`),
    criar: (dados) => apiRequest('/partidas/', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id, dados) => apiRequest(`/partidas/${id}`, { method: 'PATCH', body: JSON.stringify(dados) }),
    excluir: (id) => apiRequest(`/partidas/${id}`, { method: 'DELETE' }),
  },
  estatisticas: {
    listarPorPartida: (partidaId) => apiRequest(`/estatisticas/?partida_id=${partidaId}`),
    criar: (dados) => apiRequest('/estatisticas/', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id, dados) => apiRequest(`/estatisticas/${id}`, { method: 'PATCH', body: JSON.stringify(dados) }),
    artilheiros: (limite = 5) => apiRequest(`/estatisticas/dashboard/artilheiros?limite=${limite}`),
    cartoes: (limite = 5) => apiRequest(`/estatisticas/dashboard/cartoes?limite=${limite}`),
    desempenhoTime: () => apiRequest('/estatisticas/dashboard/desempenho-time'),
  },
};