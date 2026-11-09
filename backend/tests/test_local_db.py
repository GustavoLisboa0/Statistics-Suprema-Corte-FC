"""Testes do banco local (SQLite) que imita o Supabase."""

import pytest

import local_db


@pytest.fixture()
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(local_db, "DB_PATH", tmp_path / "teste.db")
    return local_db.criar_cliente()


def test_insert_aplica_padroes_e_select_filtra_e_ordena(db):
    a = db.table("jogadores").insert({"nome": "Zé"}).execute().data[0]
    db.table("jogadores").insert({"nome": "Ana", "ativo": False}).execute()
    assert a["ativo"] is True and a["id"] and a["created_at"]

    nomes = [j["nome"] for j in db.table("jogadores").select("*").order("nome").execute().data]
    assert nomes == ["Ana", "Zé"]
    ativos = db.table("jogadores").select("nome").eq("ativo", True).execute().data
    assert ativos == [{"nome": "Zé"}]
    assert len(db.table("jogadores").select("*").order("nome", desc=True).limit(1).execute().data) == 1


def test_update_delete_e_cascata(db):
    j = db.table("jogadores").insert({"nome": "Zé"}).execute().data[0]
    p = db.table("partidas").insert({"adversario": "X", "data": "2030-01-01"}).execute().data[0]
    assert p["status"] == "agendada" and p["placar_suprema"] == 0
    db.table("presenca").insert(
        {"partida_id": p["id"], "jogador_id": j["id"], "status": "confirmado"}
    ).execute()

    atualizado = db.table("jogadores").update({"nome": "José"}).eq("id", j["id"]).execute().data
    assert atualizado[0]["nome"] == "José"

    db.table("jogadores").delete().eq("id", j["id"]).execute()
    assert db.table("presenca").select("*").execute().data == []


def test_upsert_nao_duplica_presenca(db):
    chave = {"partida_id": "p1", "jogador_id": "j1"}
    db.table("presenca").upsert({**chave, "status": "espera"}, on_conflict="partida_id,jogador_id").execute()
    db.table("presenca").upsert({**chave, "status": "confirmado"}, on_conflict="partida_id,jogador_id").execute()
    linhas = db.table("presenca").select("*").execute().data
    assert len(linhas) == 1 and linhas[0]["status"] == "confirmado"


def test_views_calculadas(db):
    j = db.table("jogadores").insert({"nome": "Zé"}).execute().data[0]
    p = db.table("partidas").insert(
        {"adversario": "X", "data": "2030-01-01", "status": "realizada", "placar_suprema": 3, "placar_adversario": 1}
    ).execute().data[0]
    db.table("estatisticas_partida").insert(
        {"jogador_id": j["id"], "partida_id": p["id"], "gols": 2, "cartoes_amarelos": 1}
    ).execute()

    assert db.table("vw_artilheiros").select("*").execute().data[0]["total_gols"] == 2
    assert db.table("vw_cartoes").select("*").execute().data[0]["total_amarelos"] == 1
    desempenho = db.table("vw_desempenho_time").select("*").execute().data[0]
    assert desempenho["vitorias"] == 1 and desempenho["gols_marcados"] == 3
