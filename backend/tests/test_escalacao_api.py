"""Teste das rotas de escalação, usando o banco local (SQLite) em arquivo temporário."""

import os

os.environ["LOCAL_DB"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import local_db  # noqa: E402


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(local_db, "DB_PATH", tmp_path / "api.db")
    import seed_local
    from main import app

    seed_local.main()
    cliente = TestClient(app)

    def entrar(email, senha):
        r = cliente.post("/auth/login", json={"email": email, "password": senha})
        assert r.status_code == 200
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    partida = cliente.get("/partidas/proximas", headers=entrar(*seed_local.ADMIN)).json()[0]
    jogadores = cliente.get("/jogadores/", headers=entrar(*seed_local.ADMIN)).json()
    return {
        "c": cliente,
        "admin": entrar(*seed_local.ADMIN),
        "comum": entrar(*seed_local.COMUM),
        "partida": partida["id"],
        "goleiro": next(j["id"] for j in jogadores if j["posicoes"] == ["goleiro"]),
        "jogadores": jogadores,
    }


def test_fluxo_gerar_salvar_ler(api):
    c, pid = api["c"], api["partida"]
    base = f"/partidas/{pid}/escalacao"

    conv = c.get(f"{base}/convocados", headers=api["admin"])
    assert conv.status_code == 200 and len(conv.json()["convocados"]) == 16

    corpo = {"goleiro_id": api["goleiro"], "n_substituicoes": 5, "trocas_por_vez": 3}
    gerado = c.post(f"{base}/gerar", json=corpo, headers=api["admin"])
    assert gerado.status_code == 200, gerado.text
    resultado = gerado.json()["resultado"]
    assert len(resultado["titulares"]) == 11 and resultado["formacao"] == "4-4-2"

    # Sem salvar ainda: ninguém vê nada.
    assert c.get(base, headers=api["comum"]).status_code == 404

    salvo = c.post(base, json={"config": gerado.json()["config"], "resultado": resultado}, headers=api["admin"])
    assert salvo.status_code == 201
    assert c.post(base, json={"config": {}, "resultado": resultado}, headers=api["admin"]).status_code == 409
    assert c.put(base, json={"config": {}, "resultado": resultado}, headers=api["admin"]).status_code == 200

    lido = c.get(base, headers=api["comum"])
    assert lido.status_code == 200 and lido.json()["resultado"]["titulares"] == resultado["titulares"]


def test_usuario_comum_nao_gera_nem_salva(api):
    c, pid = api["c"], api["partida"]
    base = f"/partidas/{pid}/escalacao"
    assert c.post(f"{base}/gerar", json={"goleiro_id": api["goleiro"]}, headers=api["comum"]).status_code == 403
    assert c.post(base, json={"config": {}, "resultado": {}}, headers=api["comum"]).status_code == 403
    assert c.get(f"{base}/convocados", headers=api["comum"]).status_code == 403


def test_remover_jogadores_gera_erro_claro(api):
    c, pid = api["c"], api["partida"]
    atacantes = [
        j["id"] for j in api["jogadores"] if set(j["posicoes"]) & {"atacante", "centro_avante", "ponta_direita", "ponta_esquerda"}
    ]
    r = c.post(
        f"/partidas/{pid}/escalacao/gerar",
        json={"goleiro_id": api["goleiro"], "remover": atacantes},
        headers=api["admin"],
    )
    assert r.status_code == 422
    assert "atacante" in r.json()["detail"]


def test_jogador_com_punicao_sai_dos_convocados(api):
    c, pid = api["c"], api["partida"]
    punido = next(j for j in api["jogadores"] if j["apelido"] == "Igor")
    r = c.post(
        f"/jogadores/{punido['id']}/punicoes",
        json={"motivo": "teste", "tipo": "jogos", "jogos_totais": 2},
        headers=api["admin"],
    )
    assert r.status_code in (200, 201), r.text
    conv = c.get(f"/partidas/{pid}/escalacao/convocados", headers=api["admin"]).json()
    assert punido["id"] not in [j["id"] for j in conv["convocados"]]
    assert [b["motivo"] for b in conv["bloqueados"]] == ["punição ativa"]
