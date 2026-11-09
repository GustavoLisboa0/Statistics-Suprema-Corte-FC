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
    assert len(resultado["jogadores"]) == 16  # dados públicos p/ desenhar a tela e o PDF

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
    # Tira todo mundo que joga de atacante/ponta: sobra gente, mas ninguém para o ataque.
    sem_ataque = [
        j["id"]
        for j in api["jogadores"]
        if set(j["posicoes"]) & {"atacante", "centro_avante", "ponta_direita", "ponta_esquerda"}
    ]
    # Repõe jogadores de outras funções para não cair no erro de "poucos jogadores".
    extras = [
        {"nome": f"Extra {i}", "telefone": f"(41) 98888-000{i}", "posicoes": ["zagueiro"]}
        for i in range(4)
    ]
    for e in extras:
        assert c.post("/jogadores/", json=e, headers=api["admin"]).status_code == 201
    novos = [j["id"] for j in c.get("/jogadores/", headers=api["admin"]).json() if j["nome"].startswith("Extra")]
    r = c.post(
        f"/partidas/{pid}/escalacao/gerar",
        json={"goleiro_id": api["goleiro"], "remover": sem_ataque, "incluir": novos},
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


# ---------------------------------------------------------------------------
# V2: atributos, tática, nota interna, contra-estratégia (tudo só do admin)
# ---------------------------------------------------------------------------
def test_rotas_internas_sao_so_do_admin(api):
    c, pid = api["c"], api["partida"]
    jid = api["jogadores"][0]["id"]
    rotas = [
        ("get", "/atributos"),
        ("put", f"/atributos/{jid}"),
        ("get", "/escalacao/catalogo"),
        ("get", f"/partidas/{pid}/escalacao/nota"),
        ("put", f"/partidas/{pid}/escalacao/nota"),
        ("get", f"/partidas/{pid}/escalacao/contra-estrategia"),
        ("get", "/adversarios"),
        ("put", "/adversarios"),
    ]
    for metodo, url in rotas:
        r = getattr(c, metodo)(url, headers=api["comum"], **({"json": {"nome": "x"}} if metodo == "put" else {}))
        assert r.status_code == 403, (metodo, url, r.status_code)
        assert getattr(c, metodo)(url).status_code in (401, 403)


def test_atributos_salvar_e_validar(api):
    c = api["c"]
    jid = api["jogadores"][0]["id"]
    ok = c.put(f"/atributos/{jid}", json={"pace": 80, "defesa": 60, "nota": "chuta bem"}, headers=api["admin"])
    assert ok.status_code == 200 and ok.json()["pace"] == 80
    c.put(f"/atributos/{jid}", json={"pace": 85}, headers=api["admin"])  # atualiza, não duplica
    lista = [a for a in c.get("/atributos", headers=api["admin"]).json() if a["jogador_id"] == jid]
    assert len(lista) == 1 and lista[0]["pace"] == 85
    assert c.put(f"/atributos/{jid}", json={"pace": 101}, headers=api["admin"]).status_code == 422
    assert c.put(f"/atributos/{jid}", json={"pace": 0}, headers=api["admin"]).status_code == 422


def test_tatica_gera_analise_e_nada_vaza_para_usuario_comum(api):
    c, pid = api["c"], api["partida"]
    base = f"/partidas/{pid}/escalacao"
    for j in api["jogadores"]:
        c.put(f"/atributos/{j['id']}", json={"pace": 70, "finalizacao": 90, "nota": "SEGREDO-ATRIBUTO"}, headers=api["admin"])
    corpo = {"goleiro_id": api["goleiro"], "tatica": "ofensiva", "estrategia": "forca_no_final"}
    g = c.post(f"{base}/gerar", json=corpo, headers=api["admin"])
    assert g.status_code == 200, g.text
    dados = g.json()
    assert dados["analise"]["tatica"] == "ofensiva" and 0 <= dados["analise"]["nota_geral"] <= 100
    # Automático por padrão: todo mundo joga (quase) o mesmo e o plano vem junto.
    res = dados["resultado"]
    minutos = [m for jid, m in res["minutos"].items() if jid != api["goleiro"] and jid not in res["reservas_goleiro"]]
    # (o elenco de teste tem posições bem presas: aqui aceitamos até uma janela de diferença)
    assert res["duracao"] == 90 and max(minutos) - min(minutos) <= 10
    assert dados["resultado"]["plano"]["cortes"] == sorted(dados["resultado"]["plano"]["cortes"])
    # No elenco de teste há 3 atacantes puros para 2 vagas: o sistema avisa o admin.
    assert any("Igor" in a and "no máximo 60" in a for a in dados["avisos"]), dados["avisos"]
    # O que vai para o PDF/usuário (resultado) não tem atributos nem análise.
    texto = str(dados["resultado"])
    assert "SEGREDO" not in texto and "finalizacao" not in texto and "analise" not in texto

    c.post(base, json={"config": dados["config"], "resultado": dados["resultado"]}, headers=api["admin"])
    c.put(f"{base}/nota", json={"texto": "NOTA-SECRETA do time"}, headers=api["admin"])
    assert c.get(f"{base}/nota", headers=api["admin"]).json()["texto"] == "NOTA-SECRETA do time"

    visto = c.get(base, headers=api["comum"])
    assert visto.status_code == 200
    bruto = visto.text
    assert "NOTA-SECRETA" not in bruto and "SEGREDO" not in bruto
    assert "ofensiva" not in bruto and "forca_no_final" not in bruto
    assert visto.json()["config"] == {}
    # O admin continua vendo a configuração
    assert c.get(base, headers=api["admin"]).json()["config"]["tatica"] == "ofensiva"


def test_modo_manual_ainda_funciona(api):
    c, pid = api["c"], api["partida"]
    corpo = {"goleiro_id": api["goleiro"], "automatico": False, "duracao": 60,
             "n_substituicoes": 5, "trocas_por_vez": 3}
    r = c.post(f"/partidas/{pid}/escalacao/gerar", json=corpo, headers=api["admin"])
    assert r.status_code == 200 and len(r.json()["resultado"]["janelas"]) == 6
    assert "plano" not in r.json()["resultado"]


def test_tatica_invalida_da_erro_claro(api):
    r = api["c"].post(
        f"/partidas/{api['partida']}/escalacao/gerar",
        json={"goleiro_id": api["goleiro"], "tatica": "voadora"}, headers=api["admin"],
    )
    assert r.status_code == 422


def test_contra_estrategia_usa_perfil_do_adversario(api):
    c, pid = api["c"], api["partida"]
    url = f"/partidas/{pid}/escalacao/contra-estrategia"
    vazio = c.get(url, headers=api["admin"]).json()
    assert vazio["sugestao"] is None and vazio["aviso"]
    nome = vazio["adversario"]
    salvo = c.put("/adversarios", json={"nome": nome.upper(), "ataque": 9, "meio": 5, "defesa": 5}, headers=api["admin"])
    assert salvo.status_code == 200
    # mesmo nome (sem diferenciar maiúsculas) atualiza, não duplica
    c.put("/adversarios", json={"nome": nome, "ataque": 9, "meio": 5, "defesa": 5}, headers=api["admin"])
    assert len(c.get("/adversarios", headers=api["admin"]).json()) == 1
    s = c.get(url, headers=api["admin"]).json()["sugestao"]
    assert s["tatica"] == "defensiva" and s["tatica_nome"] == "Defensiva" and s["motivos"]
