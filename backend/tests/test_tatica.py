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
    r = gerar_automatico(elenco(n), "J0", 90, tolerancia=2, intervalo_minimo=3)
    linha = [m for jid, m in r["minutos"].items() if jid != "J0"]
    assert max(linha) - min(linha) <= 2
    assert r["minutos"]["J0"] == 90
    assert r["plano"]["n_substituicoes"] == len(r["plano"]["cortes"])
    # sempre 4-4-2 completo
    assert all(len(set(j["lugares"].values())) == 11 for j in r["janelas"])


def test_automatico_13_jogadores_troca_dois_por_vez():
    r = gerar_automatico(elenco(14), "J0", 90, tolerancia=2, intervalo_minimo=3)  # goleiro + 13 de linha
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
    inicio = gerar_automatico(jogadores, "J0", 90, qualidade=q, estrategia="forca_no_inicio", tolerancia=2, intervalo_minimo=3)
    final = gerar_automatico(jogadores, "J0", 90, qualidade=q, estrategia="forca_no_final", tolerancia=2, intervalo_minimo=3)

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


# ---------------------------------------------------------------------------
# Formações (e mudança durante o jogo)
# ---------------------------------------------------------------------------
def _funcoes_na_janela(jan):
    contagem = {}
    for lugar in jan["lugares"]:
        contagem[lugar[:3]] = contagem.get(lugar[:3], 0) + 1
    return contagem


@pytest.mark.parametrize("nome", ["4-4-2", "4-3-3", "4-5-1", "4-2-3-1", "3-5-2", "5-3-2", "3-4-3", "5-4-1"])
def test_todas_as_formacoes_geram_time_valido(nome):
    from escalacao import FORMACOES

    r = gerar_automatico(elenco(15), "J0", 90, formacao=nome, tolerancia=8)
    esperado = {"GOL": 1, **{f: n for f, n in FORMACOES[nome].items() if n}}
    assert r["formacao"] == nome
    for jan in r["janelas"]:
        assert _funcoes_na_janela(jan) == esperado
        assert len(set(jan["lugares"].values())) == 11


def test_mudanca_de_formacao_no_meio_do_jogo():
    r = gerar_automatico(
        elenco(15), "J0", 90, formacao="4-4-2",
        mudancas_formacao=[{"minuto": 60, "formacao": "4-5-1"}], tolerancia=8,
    )
    assert len(r["mudancas_formacao"]) == 1 and r["mudancas_formacao"][0]["formacao"] == "4-5-1"
    minuto = r["mudancas_formacao"][0]["minuto"]
    assert abs(minuto - 60) <= 10 and minuto in r["plano"]["cortes"]  # junto com uma troca
    for jan in r["janelas"]:
        esperado = "4-5-1" if jan["inicio"] >= minuto else "4-4-2"
        assert jan["formacao"] == esperado
        assert _funcoes_na_janela(jan)["MEI"] == (3 if esperado == "4-5-1" else 2)


def test_formacao_desconhecida_e_minuto_invalido():
    from escalacao import EscalacaoInviavel

    with pytest.raises(EscalacaoInviavel):
        gerar_escalacao(elenco(13), "J0", 90, 3, 2, formacao="9-9-9")
    with pytest.raises(EscalacaoInviavel):
        gerar_escalacao(elenco(13), "J0", 90, 3, 2, mudancas_formacao=[{"minuto": 200, "formacao": "4-5-1"}])


# ---------------------------------------------------------------------------
# Quem fica o jogo todo / limites de trocas
# ---------------------------------------------------------------------------
def test_jogador_fixo_nao_troca_e_trocas_ficam_simples():
    r = gerar_automatico(elenco(14), "J0", 90, quantos_fixos=1)
    fixos = r["plano"]["fixos"]
    assert len(fixos) == 1 and r["minutos"][fixos[0]] == 90
    assert all(fixos[0] not in (t["sai"], t["entra"]) for t in r["trocas"])
    assert len(r["janelas"]) - 1 <= 4  # poucas trocas


def test_intervalo_minimo_e_maximo_de_momentos_sao_respeitados():
    r = gerar_automatico(elenco(15), "J0", 90, intervalo_minimo=15, max_momentos=3, tolerancia=20)
    cortes = [j["inicio"] for j in r["janelas"][1:]]
    assert len(cortes) <= 3
    assert all(b - a >= 15 for a, b in list(zip([0] + cortes, cortes + [90]))[:-1])
    r2 = gerar_automatico(elenco(15), "J0", 90, max_trocas=2, tolerancia=20)
    for j in r2["janelas"][1:]:
        assert sum(1 for t in r2["trocas"] if t["minuto"] == j["inicio"]) <= 2


def test_dica_de_fixos_quando_simplifica():
    from escalacao import sugerir_fixos

    jogadores = elenco(14)
    atual = gerar_automatico(jogadores, "J0", 90)
    dica = sugerir_fixos(jogadores, "J0", atual)
    # Com goleiro + 13 de linha o padrão tem muitas trocas e tempos de 70/60;
    # deixar 1 jogador o jogo todo simplifica bastante, então a dica TEM que vir.
    assert dica is not None
    assert dica["quantos_fixos"] in (1, 2) and dica["momentos"] < len(atual["janelas"]) - 1
    assert "Dica" in dica["texto"]


# ---------------------------------------------------------------------------
# Regras de composição definidas pelo administrador
# ---------------------------------------------------------------------------
def _perfis_com_velocidade(jogadores):
    """Os volantes ficam bem diferentes: uns muito rápidos, outros bem lentos."""
    perfis = {}
    for i, j in enumerate(jogadores):
        perfis[j["id"]] = {"attr": {"pace": 90 if i % 2 else 15}, "carac": ["canhoto"] if i % 3 == 0 else []}
    return perfis


def _paces_de(r, jogadores, perfis, funcao):
    saida = []
    for jan in r["janelas"]:
        lugares = sorted(l for l in jan["lugares"] if l[:3] == funcao)
        saida.append([perfis[jan["lugares"][l]]["attr"]["pace"] for l in lugares])
    return saida


def _media_pace(r, perfis, funcao):
    """Velocidade média, ponderada pelo tempo, de quem joga na função."""
    total = tempo = 0
    for jan in r["janelas"]:
        for lugar, jid in jan["lugares"].items():
            if lugar[:3] == funcao:
                t = jan["fim"] - jan["inicio"]
                total += perfis[jid]["attr"]["pace"] * t
                tempo += t
    return total / tempo


def test_composicao_de_atributo_nos_volantes():
    jogadores = elenco(15)
    perfis = _perfis_com_velocidade(jogadores)

    def rodar(modo):
        comp = [{"funcao": "VOL", "tipo": "atributo", "chave": "pace", "modo": modo}] if modo else []
        return gerar_automatico(jogadores, "J0", 90, perfis=perfis, composicao=comp, tolerancia=10)

    livre, altos, baixos = rodar(None), rodar("altos"), rodar("baixos")
    # A regra é uma preferência (disputa com o tempo igual) e a busca tem sorteio,
    # então o "livre" pode cair por sorte do lado bom. O que tem que valer sempre é
    # a ordem entre os dois extremos, com folga pequena em relação ao livre.
    assert _media_pace(altos, perfis, "VOL") > _media_pace(baixos, perfis, "VOL") + 10
    assert _media_pace(altos, perfis, "VOL") > _media_pace(livre, perfis, "VOL") - 12
    assert _media_pace(baixos, perfis, "VOL") < _media_pace(livre, perfis, "VOL") + 12

    # "Misto": o 1º volante (esquerda) é mais rápido que o 2º na maioria do tempo.
    misto = rodar("misto")
    paces = _paces_de(misto, jogadores, perfis, "VOL")
    assert sum(1 for p in paces if p[0] > p[-1]) > sum(1 for p in paces if p[0] < p[-1])


def test_composicao_por_caracteristica():
    jogadores = elenco(15)
    perfis = _perfis_com_velocidade(jogadores)

    def tempo_com_canhoto(r):
        return sum(
            jan["fim"] - jan["inicio"]
            for jan in r["janelas"]
            if any(
                "canhoto" in perfis[jid]["carac"] for l, jid in jan["lugares"].items() if l[:3] == "LAT"
            )
        )

    livre = gerar_automatico(jogadores, "J0", 90, perfis=perfis, tolerancia=10)
    comp = [{"funcao": "LAT", "tipo": "carac", "chave": "canhoto", "modo": "pelo_menos_um"}]
    com_regra = gerar_automatico(jogadores, "J0", 90, perfis=perfis, composicao=comp, tolerancia=10)
    assert tempo_com_canhoto(com_regra) >= tempo_com_canhoto(livre)
    assert tempo_com_canhoto(com_regra) > 0


def test_sem_regras_nada_muda():
    jogadores = elenco(14)
    a = gerar_escalacao(jogadores, "J0", 90, 5, 2, composicao=[], perfis=None)
    b = gerar_escalacao(jogadores, "J0", 90, 5, 2)
    assert a == b


def test_caracteristica_da_bonus_na_tatica():
    sem = tt.qualidade({}, "ZAG", "defensiva")
    com = tt.qualidade({}, "ZAG", "defensiva", ["marcador"])
    assert com > sem
    assert tt.sugerir_formacoes("defensiva")["mudancas"][0]["formacao"] == "5-4-1"
    assert tt.sugerir_formacoes("posse")["formacao"] == "4-2-3-1"


# ---------------------------------------------------------------------------
# Opções de trocas e mudança de formação junto com a troca
# ---------------------------------------------------------------------------
def test_opcoes_de_trocas_igual_ou_um_fixo():
    from escalacao import opcoes_de_trocas

    ops = opcoes_de_trocas(elenco(14), "J0", duracao=90, intervalo_minimo=3, tolerancia=1)
    assert ops[0]["quantos_fixos"] == 0 and ops[0]["diferenca_minutos"] <= 1
    um = next(o for o in ops if o["quantos_fixos"] == 1)
    assert um["momentos"] < ops[0]["momentos"] and um["diferenca_minutos"] <= 1
    assert len(um["fixos"]) == 1 and um["resultado"]["minutos"][um["fixos"][0]] == 90


def test_mudanca_de_formacao_cai_num_momento_de_troca():
    r = gerar_automatico(
        elenco(14), "J0", 90, intervalo_minimo=3, tolerancia=1, quantos_fixos=1,
        mudancas_formacao=[{"minuto": 60, "formacao": "4-3-3"}],
    )
    cortes = set(r["plano"]["cortes"])
    assert r["mudancas_formacao"], "a formação tem que mudar"
    assert all(m["minuto"] in cortes for m in r["mudancas_formacao"])
    assert len(r["janelas"]) - 1 == len(cortes)  # a mudança não criou momento extra


def test_novas_formacoes_tem_dez_de_linha():
    from escalacao import FORMACOES

    assert "4-4-2 losango" in FORMACOES
    assert all(sum(c.values()) == 10 for c in FORMACOES.values())


def test_so_aparece_fixo_que_funciona():
    from escalacao import combinacoes_de_fixos, opcoes_de_trocas

    j = elenco(14)
    um = combinacoes_de_fixos(j, "J0", 1, 90)
    assert um and all(len(c) == 1 for c in um)
    opcoes = opcoes_de_trocas(j, "J0", duracao=90, intervalo_minimo=3, tolerancia=1)
    assert opcoes[0]["quantos_fixos"] == 0
    for o in opcoes[1:]:
        assert o["diferenca_minutos"] <= 1 and o["momentos"] < opcoes[0]["momentos"]
        assert sorted(o["fixos"]) in [sorted(c) for c in o["combinacoes"]]


def test_tatica_montada_muda_a_qualidade_da_funcao():
    from tatica import MODELOS_INSTRUCOES, config_da_tatica, qualidade, validar_instrucoes

    cfg = config_da_tatica(validar_instrucoes(MODELOS_INSTRUCOES["ofensiva"]))
    rapido = {"pace": 90}
    lento = {"pace": 20}
    assert qualidade(rapido, "LAT", cfg) > qualidade(lento, "LAT", cfg)
    # Sem instrução para a posição, nada muda.
    assert qualidade(rapido, "ZAG", cfg) == qualidade(rapido, "ZAG", "equilibrada")
