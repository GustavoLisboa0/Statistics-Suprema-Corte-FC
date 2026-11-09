"""Testes do escalador 4-4-2 (funções puras, sem banco)."""

import pytest

from escalacao import (
    POSICAO_PARA_FUNCAO,
    SLOTS,
    EscalacaoInviavel,
    funcoes_do_jogador,
    gerar_escalacao,
    montar_janelas,
)

# Elenco equilibrado: 3 jogadores para cada função + 1 coringa + 2 goleiros.
ELENCO = [
    ("G1", ["goleiro"]),
    ("G2", ["goleiro"]),
    ("Z1", ["zagueiro"]),
    ("Z2", ["zagueiro"]),
    ("Z3", ["zagueiro", "lateral_direito"]),
    ("L1", ["lateral_direito"]),
    ("L2", ["lateral_esquerdo"]),
    ("L3", ["lateral_esquerdo", "zagueiro"]),
    ("V1", ["volante"]),
    ("V2", ["volante"]),
    ("V3", ["volante", "meia"]),
    ("M1", ["meia"]),
    ("M2", ["meia_esquerda"]),
    ("M3", ["meia_atacante", "atacante"]),
    ("A1", ["atacante"]),
    ("A2", ["centro_avante"]),
    ("A3", ["ponta_direita", "ponta_esquerda"]),
]


def jogadores(elenco=ELENCO):
    return [{"id": n, "nome": n, "posicoes": p} for n, p in elenco]


def todas_as_janelas(r):
    return r["janelas"]


def funcoes_permitidas(nome, elenco=ELENCO):
    posicoes = dict(elenco)[nome]
    return set(funcoes_do_jogador(posicoes))


def test_mapeia_as_13_posicoes():
    from models import Posicao
    from typing import get_args

    assert set(POSICAO_PARA_FUNCAO) == set(get_args(Posicao))


def test_442_completo_em_toda_janela():
    r = gerar_escalacao(jogadores(), "G1", duracao=60, n_substituicoes=5, trocas_por_vez=2)
    assert r["formacao"] == "4-4-2"
    assert len(r["janelas"]) == 6
    for janela in r["janelas"]:
        lugares = janela["lugares"]
        assert set(lugares) == set(SLOTS)  # 11 lugares preenchidos
        assert len(set(lugares.values())) == 11  # sem ninguém repetido
        assert lugares["GOL"] == "G1"


def test_ninguem_fora_de_funcao():
    r = gerar_escalacao(jogadores(), "G1", n_substituicoes=7, trocas_por_vez=3)
    for janela in r["janelas"]:
        for lugar, jid in janela["lugares"].items():
            if lugar != "GOL":
                assert lugar[:3] in funcoes_permitidas(jid)


@pytest.mark.parametrize("trocas,subs", [(2, 7), (3, 5), (4, 5), (3, 7), (4, 7), (5, 9)])
def test_minutos_balanceados(trocas, subs):
    r = gerar_escalacao(jogadores(), "G1", duracao=60, n_substituicoes=subs, trocas_por_vez=trocas)
    de_linha = [m for jid, m in r["minutos"].items() if jid not in ("G1", "G2")]
    janela = max(j["fim"] - j["inicio"] for j in r["janelas"])
    assert max(de_linha) - min(de_linha) <= janela
    assert sum(de_linha) == 10 * 60  # 10 de linha durante os 60 minutos


def test_limite_de_trocas_por_vez():
    for limite in (1, 2, 3):
        r = gerar_escalacao(jogadores(), "G1", n_substituicoes=6, trocas_por_vez=limite)
        por_minuto: dict[int, int] = {}
        for t in r["trocas"]:
            por_minuto[t["minuto"]] = por_minuto.get(t["minuto"], 0) + 1
        assert por_minuto and max(por_minuto.values()) <= limite


def test_trocas_em_ordem_cronologica_e_coerentes():
    r = gerar_escalacao(jogadores(), "G1", n_substituicoes=5, trocas_por_vez=2)
    minutos = [t["minuto"] for t in r["trocas"]]
    assert minutos == sorted(minutos)
    em_campo = {j for j in r["janelas"][0]["lugares"].values()}
    for t in r["trocas"]:
        assert t["sai"] in em_campo and t["entra"] not in em_campo
        em_campo = (em_campo - {t["sai"]}) | {t["entra"]}


def test_goleiro_nunca_troca():
    r = gerar_escalacao(jogadores(), "G2", n_substituicoes=8, trocas_por_vez=4)
    assert r["minutos"]["G2"] == 60 and r["minutos"]["G1"] == 0
    assert all("G2" not in (t["sai"], t["entra"]) for t in r["trocas"])
    assert any(b["jogador_id"] == "G1" for b in r["banco"])


def test_grupo_fixo_nao_troca():
    regras = {nome: {"grupo_fixo": True} for nome in ("Z1", "V1", "M1", "A1")}
    r = gerar_escalacao(jogadores(), "G1", n_substituicoes=6, trocas_por_vez=3, regras=regras)
    for nome in regras:
        assert r["minutos"][nome] == 60
        assert all(nome not in (t["sai"], t["entra"]) for t in r["trocas"])


def test_erro_quando_falta_posicao():
    sem_atacantes = [(n, p) for n, p in ELENCO if not n.startswith("A") and n != "M3"]
    # sobram só 0 atacantes de verdade
    with pytest.raises(EscalacaoInviavel, match="atacante"):
        gerar_escalacao(jogadores(sem_atacantes) + [
            {"id": "X1", "nome": "X1", "posicoes": ["zagueiro"]},
            {"id": "X2", "nome": "X2", "posicoes": ["meia"]},
        ], "G1")


def test_erro_quando_um_so_zagueiro():
    elenco = [(n, ["meia"] if n in ("Z2", "L3") else p) for n, p in ELENCO]
    elenco = [(n, ["lateral_direito"] if n == "Z3" else p) for n, p in elenco]
    with pytest.raises(EscalacaoInviavel, match=r"zagueiro \(precisa de 2, tem 1\)"):
        gerar_escalacao(jogadores(elenco), "G1")


def test_erro_poucos_jogadores():
    with pytest.raises(EscalacaoInviavel, match="insuficientes"):
        gerar_escalacao(jogadores(ELENCO[:8]), "G1")


def test_erro_goleiro_fora_da_lista():
    with pytest.raises(EscalacaoInviavel, match="goleiro"):
        gerar_escalacao(jogadores(), "NAO-EXISTE")


def test_comeca_dentro_e_fora_respeitado():
    restricoes = [
        {"jogador_id": "V3", "tipo": "comeca_dentro"},
        {"jogador_id": "Z1", "tipo": "comeca_fora"},
    ]
    r = gerar_escalacao(jogadores(), "G1", restricoes=restricoes)
    titulares = {t["jogador_id"] for t in r["titulares"]}
    assert "V3" in titulares and "Z1" not in titulares
    assert "Z1" in {b["jogador_id"] for b in r["banco"]}


def test_restricao_de_funcao():
    # L3 joga de zagueiro ou lateral; forçamos zagueiro o jogo todo.
    r = gerar_escalacao(
        jogadores(), "G1", restricoes=[{"jogador_id": "L3", "tipo": "funcao", "funcao": "ZAG"}]
    )
    for janela in r["janelas"]:
        for lugar, jid in janela["lugares"].items():
            if jid == "L3":
                assert lugar.startswith("ZAG")


def test_so_segundo_tempo_e_limite_de_minutos():
    regras = {"A3": {"so_segundo_tempo": True}, "M1": {"minutos_max": 20}}
    r = gerar_escalacao(jogadores(), "G1", n_substituicoes=5, trocas_por_vez=3, regras=regras)
    for janela in r["janelas"]:
        if janela["inicio"] < 30:
            assert "A3" not in janela["lugares"].values()
    assert r["minutos"]["M1"] <= 20


def test_janelas_somam_a_duracao():
    janelas = montar_janelas(60, 5)
    assert janelas[0][0] == 0 and janelas[-1][1] == 60
    assert all(a[1] == b[0] for a, b in zip(janelas, janelas[1:]))
    assert montar_janelas(50, 3) == [(0, 12), (12, 25), (25, 38), (38, 50)]


def test_sem_substituicoes_ninguem_troca():
    r = gerar_escalacao(jogadores(), "G1", n_substituicoes=0)
    assert r["trocas"] == [] and len(r["janelas"]) == 1
