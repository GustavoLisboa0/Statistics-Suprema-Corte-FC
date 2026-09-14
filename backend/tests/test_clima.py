from datetime import date, time

from clima import descricao_condicao, hora_mais_proxima, indice_da_hora


def test_descricao_condicao_codigo_conhecido():
    assert descricao_condicao(0) == "Céu limpo"
    assert descricao_condicao(61) == "Chuva fraca"


def test_descricao_condicao_codigo_desconhecido():
    assert descricao_condicao(999) == "Condição desconhecida"


def test_hora_mais_proxima_arredonda_pra_baixo():
    assert hora_mais_proxima(time(19, 10)) == "19:00"


def test_hora_mais_proxima_arredonda_pra_cima():
    assert hora_mais_proxima(time(19, 45)) == "20:00"


def test_hora_mais_proxima_exatamente_na_hora():
    assert hora_mais_proxima(time(19, 0)) == "19:00"


def test_hora_mais_proxima_meia_hora_conta_como_cima():
    assert hora_mais_proxima(time(19, 30)) == "20:00"


def test_hora_mais_proxima_vira_o_dia():
    assert hora_mais_proxima(time(23, 45)) == "00:00"


def _corpo(horas: list[str]) -> dict:
    return {"hourly": {"time": horas}}


def test_indice_da_hora_encontra_a_hora_exata():
    corpo = _corpo(["2026-08-20T18:00", "2026-08-20T19:00", "2026-08-20T20:00"])
    assert indice_da_hora(corpo, date(2026, 8, 20), time(19, 0)) == 1


def test_indice_da_hora_arredonda_antes_de_buscar():
    corpo = _corpo(["2026-08-20T18:00", "2026-08-20T19:00", "2026-08-20T20:00"])
    assert indice_da_hora(corpo, date(2026, 8, 20), time(19, 40)) == 2


def test_indice_da_hora_nao_encontrada():
    corpo = _corpo(["2026-08-20T18:00", "2026-08-20T19:00"])
    assert indice_da_hora(corpo, date(2026, 8, 20), time(23, 0)) is None


def test_indice_da_hora_corpo_vazio():
    assert indice_da_hora({}, date(2026, 8, 20), time(19, 0)) is None
