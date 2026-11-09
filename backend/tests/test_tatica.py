"""Testes da V2: modo automático, tática/estratégia, análise e contra-estratégia."""

import pytest

import tatica as tt
from escalacao import (
    DURACAO_PADRAO,
    gerar_automatico,
    gerar_escalacao,
    janelas_dos_cortes,
    _cortes_ciclicos,
    _cortes_uniformes,
)

CICLO = [
    ["zagueiro", "lateral_direito"], ["lateral_esquerdo", "volante"], ["volante", "meia"],
    ["meia", "atacante"], ["atacante", "meia"], ["zagueiro", "volante"],
    ["lateral_direito", "meia"], ["atacante", "lateral_esquerdo"], ["zagueiro", "lateral_esquerdo"],
    ["volante", "zagueiro"], ["meia", "volante"], ["atacante", "volante"],
    ["lateral_direito", "zagueiro"], ["meia", "atacante"], ["lateral_esquerdo", "meia"],
    ["volante", "atacante"],
]


def elenco(n):
    """Goleiro + (n - 1) jogadores de linha flexíveis."""
    ps = [["goleiro"]] + CICLO[: n - 1]
    return [{"id": f"J{i}", "nome": f"J{i}", "posicoes": p} for i, p in enumerate(ps)]


# ---------------------------------------------------------------------------
# Modo automático
# ---------------------------------------------------------------------------
def test_padrao_e_90_minutos():
    assert DURACAO_PADRAO == 90


def test_cortes_uniformes_arredondam_para_cima():
    # 90/7 = 12,86 -> janelas de 13 min
    assert _cortes_uniformes(90, 7) == [13, 26, 39, 52, 65, 78]
    # 90/6 = 15 certinho
    assert _cortes_uniformes(90, 6) == [15, 30, 45, 60, 75]
    assert janelas_dos_cortes(90, [13, 26])[-1] == (26, 90)


def test_cortes_ciclicos_sao_inteiros_e_dentro_do_jogo():
    for n in range(11, 18):
        cortes = _cortes_ciclicos(n, 90)
        assert all(isinstance(c, int) and 0 < c < 90 for c in cortes)
    assert _cortes_ciclicos(10, 90) == []


@pytest.mark.parametrize("n", [12, 13, 14, 15, 16])
def test_automatico_todo_mundo_joga_o_mesmo_tempo(n):
    r = gerar_automatico(elenco(n), "J0", 90)
    linha = [m for jid, m in r["minutos"].items() if jid != "J0"]
    assert max(linha) - min(linha) <= 2
    assert r["minutos"]["J0"] == 90
    assert r["plano"]["n_substituicoes"] == len(r["plano"]["cortes"])
    # sempre 4-4-2 completo
    assert all(len(set(j["lugares"].values())) == 11 for j in r["janelas"])


def test_automatico_13_jogadores_troca_dois_por_vez():
    r = gerar_automatico(elenco(14), "J0", 90)  # goleiro + 13 de linha
    assert r["plano"]["trocas_por_vez"] >= 1
    linha = [m for jid, m in r["minutos"].items() if jid != "J0"]
    assert max(linha) - min(linha) <= 2


def test_automatico_sem_reservas_nao_troca():
    r = gerar_automatico(elenco(11), "J0", 90)
    assert r["trocas"] == [] and r["plano"]["n_substituicoes"] == 0


# ---------------------------------------------------------------------------
# Qualidade / tática / estratégia
# ---------------------------------------------------------------------------
def test_qualidade_pesa_atributos_da_funcao():
    forte_atq = {"finalizacao": 95, "pace": 90}
    fraco = {"finalizacao": 20, "pace": 20}
    assert tt.qualidade(forte_atq, "ATA") > tt.qualidade(fraco, "ATA")
    assert tt.qualidade(None, "ZAG") == pytest.approx(50)  # sem atributos = neutro


def test_tatica_ofensiva_valoriza_atacante_mais_que_defensiva():
    attr = {"finalizacao": 80, "defesa": 80, "pace": 80, "fisico": 80, "passe": 80, "visao": 80}
    assert tt.qualidade(attr, "ATA", "ofensiva") > tt.qualidade(attr, "ATA", "defensiva")
    assert tt.qualidade(attr, "ZAG", "defensiva") > tt.qualidade(attr, "ZAG", "ofensiva")


def test_tatica_desconhecida_levanta_erro():
    with pytest.raises(ValueError):
        tt.qualidade({}, "ATA", "inexistente")


def _qualidade_com_estrelas(jogadores, estrelas):
    """Estrelas valem 1.0 em tudo; os outros 0.3."""
    return {j["id"]: {f: (1.0 if j["id"] in estrelas else 0.3) for f in tt.PESOS_FUNCAO} for j in jogadores}


def _minutos_na_janela(r, ids, indice):
    jan = r["janelas"][indice]
    return sum(1 for jid in jan["lugares"].values() if jid in ids)


def test_estrategia_forca_no_inicio_vs_no_final():
    jogadores = elenco(14)
    estrelas = {"J1", "J2", "J3"}  # são do ciclo: ZAG/LAT, LAT/VOL, VOL/MEI
    q = _qualidade_com_estrelas(jogadores, estrelas)
    inicio = gerar_automatico(jogadores, "J0", 90, qualidade=q, estrategia="forca_no_inicio")
    final = gerar_automatico(jogadores, "J0", 90, qualidade=q, estrategia="forca_no_final")

    def cedo(r):  # minutos das estrelas na 1ª metade do jogo
        return sum(
            (jan["fim"] - jan["inicio"]) * sum(1 for jid in jan["lugares"].values() if jid in estrelas)
            for jan in r["janelas"]
            if jan["fim"] <= 45
        )

    assert cedo(inicio) > cedo(final)
    for r in (inicio, final):
        # a tática não pode estragar o tempo igual para todos
        linha = [m for jid, m in r["minutos"].items() if jid != "J0"]
        assert max(linha) - min(linha) <= 2
        assert all(len(set(j["lugares"].values())) == 11 for j in r["janelas"])


def test_sem_tatica_continua_igual_a_v1():
    jogadores = elenco(14)
    a = gerar_escalacao(jogadores, "J0", 60, 5, 2)
    b = gerar_escalacao(jogadores, "J0", 60, 5, 2, qualidade=None)
    assert a == b


def test_pesos_das_janelas():
    assert tt.pesos_das_janelas(4, "uniforme") == [1.0] * 4
    ini = tt.pesos_das_janelas(4, "forca_no_inicio")
    assert ini[0] > ini[-1] and tt.pesos_das_janelas(4, "forca_no_final") == ini[::-1]


# ---------------------------------------------------------------------------
# Análise do time
# ---------------------------------------------------------------------------
def test_analisar_devolve_nota_e_avisa_sem_atributos():
    jogadores = elenco(13)
    r = gerar_escalacao(jogadores, "J0", 60, 3, 2)
    r["jogadores"] = {j["id"]: {"nome": j["nome"]} for j in jogadores}
    a = tt.analisar(r, {}, "ofensiva")
    assert 0 <= a["nota_geral"] <= 100 and len(a["janelas"]) == len(r["janelas"])
    assert any("sem atributos" in p for p in a["pontos_de_atencao"])


# ---------------------------------------------------------------------------
# Contra-estratégia
# ---------------------------------------------------------------------------
def test_contra_ataque_forte_sugere_defesa():
    s = tt.sugerir_contra_estrategia({"ataque": 9, "meio": 5, "defesa": 5})
    assert s["tatica"] == "defensiva" and s["estrategia"] == "forca_no_inicio"
    assert s["motivos"]


def test_defesa_fragil_sugere_ofensiva():
    s = tt.sugerir_contra_estrategia({"ataque": 5, "meio": 5, "defesa": 2})
    assert s["tatica"] == "ofensiva"


def test_retranca_sugere_posse_e_forca_no_final():
    s = tt.sugerir_contra_estrategia({"estilo": "retranca"})
    assert s["tatica"] == "posse" and s["estrategia"] == "forca_no_final"


def test_sem_dados_fica_equilibrada():
    s = tt.sugerir_contra_estrategia({})
    assert s["tatica"] == "equilibrada" and s["estrategia"] == "uniforme"


def test_historico_pesa_na_sugestao():
    historico = tt.resumir_historico(
        [
            {"status": "realizada", "placar_suprema": 0, "placar_adversario": 4},
            {"status": "realizada", "placar_suprema": 1, "placar_adversario": 3},
            {"status": "agendada", "placar_suprema": 0, "placar_adversario": 0},
        ]
    )
    assert historico["jogos"] == 2 and historico["derrotas"] == 2 and historico["gols_contra"] == 7
    assert tt.sugerir_contra_estrategia({}, historico)["tatica"] == "defensiva"


# ---------------------------------------------------------------------------
# Aviso quando igualar é impossível por causa das posições
# ---------------------------------------------------------------------------
def test_aviso_de_atacantes_demais():
    from escalacao import avisos_de_igualdade

    elenco_ = elenco(14)  # flexível: sem aviso
    assert avisos_de_igualdade(elenco_, "J0", 90) == []
    # 3 atacantes puros para 2 vagas de ataque
    rigido = elenco(11) + [
        {"id": f"A{i}", "nome": f"Ata{i}", "posicoes": ["atacante"]} for i in range(3)
    ]
    for j in rigido:
        if j["id"] in ("J8", "J9", "J10"):  # tira os atacantes flexíveis
            j["posicoes"] = ["meia"]
    avisos = avisos_de_igualdade(rigido, "J0", 90)
    assert any("Ata0" in a and "atacante" in a and "no máximo 60" in a for a in avisos), avisos
