"""Medição de duração por rota (medicao.py): log, Server-Timing e fases."""

import logging
import os

os.environ["LOCAL_DB"] = "1"

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import local_db  # noqa: E402
import medicao  # noqa: E402


class _Linhas(logging.Handler):
    def __init__(self):
        super().__init__()
        self.registros: list[logging.LogRecord] = []

    def emit(self, record):
        self.registros.append(record)

    @property
    def textos(self) -> list[str]:
        return [r.getMessage() for r in self.registros]


@pytest.fixture()
def log():
    """Captura as linhas do logger `medicao` (ele não propaga para o root)."""
    h = _Linhas()
    medicao.logger.addHandler(h)
    yield h
    medicao.logger.removeHandler(h)


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(local_db, "DB_PATH", tmp_path / "api.db")
    monkeypatch.delenv("MEDICAO_ATIVA", raising=False)
    import auth
    import seed_local
    from main import app

    auth.limpar_cache_usuarios()
    seed_local.main()
    cliente = TestClient(app)

    def entrar(email, senha):
        r = cliente.post("/auth/login", json={"email": email, "password": senha})
        assert r.status_code == 200
        return r.json()["access_token"]

    token = entrar(*seed_local.ADMIN)
    admin = {"Authorization": f"Bearer {token}"}
    partida = cliente.get("/partidas/proximas", headers=admin).json()[0]["id"]
    jogadores = cliente.get("/jogadores/", headers=admin).json()
    yield {
        "c": cliente,
        "token": token,
        "admin": admin,
        "partida": partida,
        "goleiro": next(j["id"] for j in jogadores if j["posicoes"] == ["goleiro"]),
        "credenciais": seed_local.ADMIN,
    }
    auth.limpar_cache_usuarios()


def _campos(linha: str) -> dict:
    return dict(parte.split("=", 1) for parte in linha.split())


def test_cabecalho_e_log_com_molde_da_rota(api, log):
    c, pid = api["c"], api["partida"]
    r = c.get(f"/partidas/{pid}/escalacao/convocados", headers=api["admin"])
    assert r.status_code == 200

    timing = r.headers["server-timing"]
    assert timing.startswith("app;dur=") and "auth;dur=" in timing
    assert r.headers["timing-allow-origin"] == "*"  # mesmas origens do CORS (main.ORIGENS_CORS)

    linha = log.textos[-1]
    campos = _campos(linha)
    assert campos["metodo"] == "GET"
    assert campos["rota"] == "/partidas/{partida_id}/escalacao/convocados"
    assert campos["status"] == "200"
    assert float(campos["dur_ms"]) >= 0
    assert pid not in linha  # o molde, nunca o caminho com o id
    assert log.registros[-1].levelno == logging.INFO


def test_nao_registra_query_token_nem_corpo(api, log):
    c = api["c"]
    email, senha = api["credenciais"]
    c.get("/partidas/?segredo=valor-da-query&email=alguem%40exemplo.com", headers=api["admin"])
    c.get("/partidas/", headers={"Authorization": "Bearer token-invalido-bem-secreto"})
    c.post("/auth/login", json={"email": email, "password": senha})

    tudo = "\n".join(log.textos)
    for proibido in [
        "segredo", "valor-da-query", "alguem", "?",
        api["token"], "token-invalido-bem-secreto", "Bearer", "authorization",
        email, senha, "password",
    ]:
        assert proibido not in tudo, proibido
    assert "rota=/partidas/ " in tudo and "rota=/auth/login " in tudo


def test_404_sem_rota(api, log):
    r = api["c"].get("/nao-existe/123", headers=api["admin"])
    assert r.status_code == 404
    campos = _campos(log.textos[-1])
    assert campos["rota"] == "sem_rota" and campos["status"] == "404"


def test_health_check_e_options_ficam_fora(api, log):
    c = api["c"]
    r = c.get("/")
    assert r.status_code == 200 and "server-timing" not in r.headers
    c.options(
        "/partidas/",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert log.textos == []


def test_medicao_ativa_0_desliga_tudo(api, log, monkeypatch):
    monkeypatch.setenv("MEDICAO_ATIVA", "0")
    r = api["c"].get("/partidas/", headers=api["admin"])
    assert r.status_code == 200
    assert "server-timing" not in r.headers and "timing-allow-origin" not in r.headers
    assert log.textos == []


def test_fases_do_gerar(api, log):
    c, pid = api["c"], api["partida"]
    corpo = {"goleiro_id": api["goleiro"], "n_substituicoes": 5, "trocas_por_vez": 3}
    r = c.post(f"/partidas/{pid}/escalacao/gerar", json=corpo, headers=api["admin"])
    assert r.status_code == 200, r.text

    # O handler `gerar` é `def` (roda na threadpool): as fases marcadas lá
    # dentro chegarem aqui prova que o contextvar atravessa para a thread.
    campos = _campos(log.textos[-1])
    assert campos["rota"] == "/partidas/{partida_id}/escalacao/gerar"
    for fase in ("auth_ms", "dados_ms", "solver_ms"):
        assert float(campos[fase]) >= 0, fase
    assert campos["auth_cache"] in ("0", "1")
    assert float(campos["solver_ms"]) <= float(campos["dur_ms"])

    timing = r.headers["server-timing"]
    for fase in ("app;dur=", "auth;dur=", "dados;dur=", "solver;dur="):
        assert fase in timing, fase


def test_auth_cache_marca_supabase_e_depois_cache(api, log):
    import auth

    auth.limpar_cache_usuarios()
    c = api["c"]
    primeira = c.get("/partidas/", headers=api["admin"])
    segunda = c.get("/partidas/", headers=api["admin"])
    assert _campos(log.textos[-2])["auth_cache"] == "0"
    assert _campos(log.textos[-1])["auth_cache"] == "1"
    assert 'auth;dur=' in primeira.headers["server-timing"]
    assert 'desc="supabase"' in primeira.headers["server-timing"]
    assert 'desc="cache"' in segunda.headers["server-timing"]


def test_lento_vai_como_warning(api, log, monkeypatch):
    monkeypatch.setattr(medicao, "LIMITE_LENTO_MS", -1)
    api["c"].get("/partidas/", headers=api["admin"])
    assert log.registros[-1].levelno == logging.WARNING


def test_timing_allow_origin_usa_a_mesma_lista_do_cors():
    """No main.py as duas configurações apontam para ORIGENS_CORS: restringir uma restringe a outra (I4)."""
    import main

    opcoes = {m.cls.__name__: m.kwargs for m in main.app.user_middleware}
    assert opcoes["MedicaoMiddleware"]["origens_timing"] is main.ORIGENS_CORS
    assert opcoes["CORSMiddleware"]["allow_origins"] is main.ORIGENS_CORS


def test_timing_allow_origin_acompanha_origens_restritas(log, monkeypatch):
    from fastapi.middleware.cors import CORSMiddleware

    monkeypatch.delenv("MEDICAO_ATIVA", raising=False)
    origens = ["http://localhost:3000"]
    app = FastAPI()

    @app.get("/ping/{x}")
    def ping(x: int):
        return {"ok": x}

    app.add_middleware(CORSMiddleware, allow_origins=origens, allow_methods=["*"], allow_headers=["*"])
    app.add_middleware(medicao.MedicaoMiddleware, origens_timing=origens)
    c = TestClient(app)

    permitida = c.get("/ping/1", headers={"Origin": "http://localhost:3000"})
    assert permitida.headers["timing-allow-origin"] == "http://localhost:3000"
    assert permitida.headers["access-control-allow-origin"] == "http://localhost:3000"

    outra = c.get("/ping/1", headers={"Origin": "https://outro-site.invalid"})
    assert "timing-allow-origin" not in outra.headers
    assert "access-control-allow-origin" not in outra.headers
    assert "server-timing" in outra.headers  # o cabeçalho vai; só a origem não tem permissão de ler

    sem_origem = c.get("/ping/1")
    assert "timing-allow-origin" not in sem_origem.headers


def _app_que_explode():
    app = FastAPI()

    @app.get("/explode/{x}")
    def explode(x: int):
        raise RuntimeError("falha de propósito")

    app.add_middleware(medicao.MedicaoMiddleware, origens_timing=["*"])
    return app


def test_excecao_vira_500_e_continua_subindo(log, monkeypatch):
    monkeypatch.delenv("MEDICAO_ATIVA", raising=False)
    app = _app_que_explode()

    # A exceção não é engolida: continua subindo como antes.
    with pytest.raises(RuntimeError):
        TestClient(app).get("/explode/1")
    campos = _campos(log.textos[-1])
    assert campos["rota"] == "/explode/{x}" and campos["status"] == "500"

    # E o cliente recebe o 500 normal do servidor.
    r = TestClient(app, raise_server_exceptions=False).get("/explode/2")
    assert r.status_code == 500
    assert _campos(log.textos[-1])["status"] == "500"


def test_medir_e_marcar_fora_de_requisicao_nao_fazem_nada():
    with medicao.medir("qualquer"):
        pass
    medicao.marcar("chave", 1)  # sem coletor: não levanta nem guarda nada
    assert medicao._coletor.get() is None
