"""Mapeamento das respostas do Supabase Auth em `auth.py` (sem rede: httpx mockado)."""

import asyncio

import httpx
import pytest
from fastapi import HTTPException

import auth

URL = "https://supabase-falso.invalid"


@pytest.fixture(autouse=True)
def _modo_supabase(monkeypatch):
    """Força o caminho do Supabase (a suíte roda com LOCAL_DB=1) e limpa o cache."""
    monkeypatch.setattr(auth, "LOCAL_DB", False)
    monkeypatch.setattr(auth, "SUPABASE_URL", URL)
    auth.limpar_cache_usuarios()
    yield
    auth.limpar_cache_usuarios()


@pytest.fixture
def supabase_responde(monkeypatch):
    """Troca `httpx.request` por uma resposta fixa (status) ou uma exceção de rede."""
    chamadas = []

    def configurar(status=None, corpo=None, erro=None):
        def falso(metodo, url, **kwargs):
            chamadas.append((metodo, url, kwargs))
            if erro is not None:
                raise erro
            return httpx.Response(status, json=corpo or {}, request=httpx.Request(metodo, url))

        monkeypatch.setattr(auth.httpx, "request", falso)
        return chamadas

    return configurar


def _status_do_erro(funcao, *args):
    with pytest.raises(HTTPException) as erro:
        funcao(*args)
    return erro.value.status_code, erro.value.detail


ERROS_DE_REDE = [
    httpx.ConnectTimeout("demorou"),
    httpx.ReadTimeout("demorou"),
    httpx.ConnectError("recusou"),
]


# ---------------------------------------------------------------- login


def test_login_ok_devolve_o_corpo(supabase_responde):
    chamadas = supabase_responde(200, {"access_token": "a", "refresh_token": "r"})
    assert auth.login("a@b.c", "x") == {"access_token": "a", "refresh_token": "r"}
    metodo, url, kwargs = chamadas[0]
    assert (metodo, url) == ("POST", f"{URL}/auth/v1/token")
    assert kwargs["params"] == {"grant_type": "password"}
    assert kwargs["timeout"] == 10


@pytest.mark.parametrize("status", [400, 401, 422])
def test_login_credencial_ruim_vira_401(supabase_responde, status):
    # Senha errada: o Supabase devolve 400 invalid_grant
    supabase_responde(status, {"error": "invalid_grant"})
    assert _status_do_erro(auth.login, "a@b.c", "x") == (401, "Email ou senha inválidos")


def test_login_429_continua_429(supabase_responde):
    supabase_responde(429)
    assert _status_do_erro(auth.login, "a@b.c", "x") == (429, auth.MSG_MUITAS_TENTATIVAS)


@pytest.mark.parametrize("status", [500, 502, 503, 504])
def test_login_5xx_vira_503(supabase_responde, status):
    supabase_responde(status)
    assert _status_do_erro(auth.login, "a@b.c", "x") == (503, auth.MSG_INDISPONIVEL)


@pytest.mark.parametrize("erro", ERROS_DE_REDE, ids=type)
def test_login_timeout_ou_rede_vira_503(supabase_responde, erro):
    supabase_responde(erro=erro)
    assert _status_do_erro(auth.login, "a@b.c", "x") == (503, auth.MSG_INDISPONIVEL)


# ------------------------------------------------- refresh e _validar_token

FUNCOES_DE_SESSAO = [
    pytest.param(auth.refresh, "Sessão expirada, faça login novamente", id="refresh"),
    pytest.param(auth._validar_token, "Sessão inválida ou expirada", id="validar_token"),
]


@pytest.mark.parametrize("funcao,detalhe", FUNCOES_DE_SESSAO)
@pytest.mark.parametrize("status", [400, 401, 403])
def test_sessao_credencial_ruim_vira_401(supabase_responde, funcao, detalhe, status):
    supabase_responde(status)
    assert _status_do_erro(funcao, "tok") == (401, detalhe)


@pytest.mark.parametrize("funcao,detalhe", FUNCOES_DE_SESSAO)
@pytest.mark.parametrize("status", [429, 500, 502, 503])
def test_sessao_429_ou_5xx_vira_503(supabase_responde, funcao, detalhe, status):
    supabase_responde(status)
    assert _status_do_erro(funcao, "tok") == (503, auth.MSG_INDISPONIVEL)


@pytest.mark.parametrize("funcao,detalhe", FUNCOES_DE_SESSAO)
@pytest.mark.parametrize("erro", ERROS_DE_REDE, ids=type)
def test_sessao_timeout_ou_rede_vira_503(supabase_responde, funcao, detalhe, erro):
    supabase_responde(erro=erro)
    assert _status_do_erro(funcao, "tok") == (503, auth.MSG_INDISPONIVEL)


def test_refresh_ok_e_chamada_certa(supabase_responde):
    chamadas = supabase_responde(200, {"access_token": "novo"})
    assert auth.refresh("r1") == {"access_token": "novo"}
    metodo, url, kwargs = chamadas[0]
    assert (metodo, url) == ("POST", f"{URL}/auth/v1/token")
    assert kwargs["params"] == {"grant_type": "refresh_token"}
    assert kwargs["json"] == {"refresh_token": "r1"}


def test_validar_token_ok_e_chamada_certa(supabase_responde):
    chamadas = supabase_responde(200, {"id": "u1"})
    assert auth._validar_token("tok") == {"id": "u1"}
    metodo, url, kwargs = chamadas[0]
    assert (metodo, url) == ("GET", f"{URL}/auth/v1/user")
    assert kwargs["headers"]["Authorization"] == "Bearer tok"


# ------------------------------------------------------- cache + 503


def test_503_nao_entra_no_cache(supabase_responde, monkeypatch):
    monkeypatch.setattr(auth, "papel_do_usuario", lambda _uid: "editor")

    supabase_responde(503)
    with pytest.raises(HTTPException) as erro:
        asyncio.run(auth.usuario_atual("Bearer tok"))
    assert erro.value.status_code == 503
    assert auth._usuario_em_cache("tok") is None

    # Supabase volta: a mesma sessão passa e só agora vai para o cache
    supabase_responde(200, {"id": "u1", "email": "a@b.c"})
    assert asyncio.run(auth.usuario_atual("Bearer tok"))["id"] == "u1"
    assert auth._usuario_em_cache("tok")["id"] == "u1"


def test_timeout_nao_entra_no_cache(supabase_responde, monkeypatch):
    monkeypatch.setattr(auth, "papel_do_usuario", lambda _uid: "editor")
    supabase_responde(erro=httpx.ReadTimeout("demorou"))
    with pytest.raises(HTTPException):
        asyncio.run(auth.usuario_atual("Bearer tok"))
    assert auth._usuario_em_cache("tok") is None
