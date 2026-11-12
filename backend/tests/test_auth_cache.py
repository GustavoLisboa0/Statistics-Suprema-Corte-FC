"""Cache curto de token -> usuário em `usuario_atual` (auth.py)."""

import asyncio

import pytest
from fastapi import HTTPException

import auth


@pytest.fixture(autouse=True)
def _limpa_cache():
    auth.limpar_cache_usuarios()
    yield
    auth.limpar_cache_usuarios()


@pytest.fixture
def chamadas(monkeypatch):
    """Troca a validação no Supabase por um contador (sem rede)."""
    contagem = {"validar": 0, "papel": 0}

    def validar(token):
        contagem["validar"] += 1
        if token == "ruim":
            raise HTTPException(status_code=401, detail="Sessão inválida ou expirada")
        return {"id": "u1", "email": "a@b.c", "user_metadata": {"nome": "Ana"}}

    def papel(_user_id):
        contagem["papel"] += 1
        return "editor"

    monkeypatch.setattr(auth, "_validar_token", validar)
    monkeypatch.setattr(auth, "papel_do_usuario", papel)
    return contagem


def _chamar(token):
    return asyncio.run(auth.usuario_atual(f"Bearer {token}"))


def test_segunda_chamada_com_o_mesmo_token_nao_vai_ao_supabase(chamadas):
    primeiro = _chamar("bom")
    segundo = _chamar("bom")
    assert primeiro == segundo
    assert primeiro["papel"] == "editor" and primeiro["nome"] == "Ana"
    assert chamadas == {"validar": 1, "papel": 1}


def test_tokens_diferentes_nao_se_misturam(chamadas):
    _chamar("bom")
    _chamar("outro")
    assert chamadas["validar"] == 2


def test_token_invalido_nunca_entra_no_cache(chamadas):
    for _ in range(2):
        with pytest.raises(HTTPException) as erro:
            _chamar("ruim")
        assert erro.value.status_code == 401
    assert chamadas["validar"] == 2  # validou de novo na segunda tentativa


def test_depois_do_prazo_valida_de_novo(chamadas, monkeypatch):
    agora = [1000.0]
    monkeypatch.setattr(auth.time, "monotonic", lambda: agora[0])
    _chamar("bom")
    agora[0] += auth._CACHE_TTL_S - 1
    _chamar("bom")
    assert chamadas["validar"] == 1
    agora[0] += 2  # passou do prazo
    _chamar("bom")
    assert chamadas["validar"] == 2


def test_mexer_no_resultado_nao_suja_o_cache(chamadas):
    primeiro = _chamar("bom")
    primeiro["papel"] = "visualizador"
    assert _chamar("bom")["papel"] == "editor"


def test_cache_tem_limite_de_tamanho(chamadas, monkeypatch):
    monkeypatch.setattr(auth, "_CACHE_MAX", 3)
    for i in range(10):
        _chamar(f"t{i}")
    assert len(auth._cache_usuarios) <= 3


def test_sem_header_continua_401(chamadas):
    with pytest.raises(HTTPException) as erro:
        asyncio.run(auth.usuario_atual(None))
    assert erro.value.status_code == 401
    assert chamadas["validar"] == 0
