from datetime import date, timedelta

from models import lesao_ativa, numero_camisa_disponivel, punicao_ativa


def _jogador(id_: str, numero: int | None, ativo: bool = True) -> dict:
    return {"id": id_, "numero_camisa": numero, "ativo": ativo}


def test_numero_livre_quando_ninguem_usa():
    jogadores = [_jogador("1", 7), _jogador("2", 9)]
    assert numero_camisa_disponivel(jogadores, 10) is True


def test_numero_indisponivel_quando_jogador_ativo_ja_usa():
    jogadores = [_jogador("1", 10)]
    assert numero_camisa_disponivel(jogadores, 10) is False


def test_numero_disponivel_quando_so_jogador_inativo_usa():
    # Inativo não segura o número — ele perde o próprio número ao ser
    # desativado, então nunca deveria travar outro jogador ativo.
    jogadores = [_jogador("1", 10, ativo=False)]
    assert numero_camisa_disponivel(jogadores, 10) is True


def test_numero_none_sempre_disponivel():
    # Sem número atribuído não é obrigatório nem conflita com nada.
    jogadores = [_jogador("1", 10), _jogador("2", None)]
    assert numero_camisa_disponivel(jogadores, None) is True


def test_editar_proprio_jogador_com_mesmo_numero_nao_conflita():
    jogadores = [_jogador("1", 10)]
    assert numero_camisa_disponivel(jogadores, 10, jogador_id="1") is True


def test_editar_jogador_tentando_pegar_numero_de_outro_ativo():
    jogadores = [_jogador("1", 10), _jogador("2", 5)]
    assert numero_camisa_disponivel(jogadores, 10, jogador_id="2") is False


def test_numero_de_jogador_inativo_fica_livre_para_reuso():
    # Cenário completo: jogador ativo usava o 10, foi desativado (perdeu o
    # número no processo), e agora outro jogador ativo pode assumir o 10.
    jogadores = [_jogador("1", None, ativo=False), _jogador("2", 5)]
    assert numero_camisa_disponivel(jogadores, 10, jogador_id="2") is True


def _punicao_dias(termina_em: date) -> dict:
    return {"tipo": "dias", "termina_em": termina_em.isoformat()}


def _punicao_jogos(totais: int, cumpridos: int) -> dict:
    return {"tipo": "jogos", "jogos_totais": totais, "jogos_cumpridos": cumpridos}


def test_punicao_por_dias_ativa_quando_prazo_no_futuro():
    amanha = date.today() + timedelta(days=1)
    assert punicao_ativa(_punicao_dias(amanha)) is True


def test_punicao_por_dias_ativa_no_ultimo_dia():
    # O próprio dia final ainda conta como punido.
    hoje = date.today()
    assert punicao_ativa(_punicao_dias(hoje)) is True


def test_punicao_por_dias_encerrada_quando_prazo_passou():
    ontem = date.today() - timedelta(days=1)
    assert punicao_ativa(_punicao_dias(ontem)) is False


def test_punicao_por_jogos_ativa_enquanto_nao_cumpriu_todos():
    assert punicao_ativa(_punicao_jogos(totais=3, cumpridos=1)) is True


def test_punicao_por_jogos_encerrada_ao_completar():
    assert punicao_ativa(_punicao_jogos(totais=3, cumpridos=3)) is False


def test_punicao_por_jogos_encerrada_se_passar_do_total():
    # Defensivo: não deveria acontecer (o desconto é sempre limitado ao
    # total), mas não pode ficar "ativa" numericamente errado se acontecer.
    assert punicao_ativa(_punicao_jogos(totais=3, cumpridos=4)) is False


def _lesao_data(termina_em: date) -> dict:
    return {"tipo": "data", "termina_em": termina_em.isoformat()}


def _lesao_proximo_jogo() -> dict:
    return {"tipo": "proximo_jogo", "partida_id": "abc"}


def test_lesao_por_data_ativa_quando_prazo_no_futuro():
    amanha = date.today() + timedelta(days=1)
    assert lesao_ativa(_lesao_data(amanha)) is True


def test_lesao_por_data_ativa_no_ultimo_dia():
    hoje = date.today()
    assert lesao_ativa(_lesao_data(hoje)) is True


def test_lesao_por_data_encerrada_quando_prazo_passou():
    ontem = date.today() - timedelta(days=1)
    assert lesao_ativa(_lesao_data(ontem)) is False


def test_lesao_proximo_jogo_ativa_enquanto_partida_agendada():
    assert lesao_ativa(_lesao_proximo_jogo(), status_partida_travada="agendada") is True


def test_lesao_proximo_jogo_encerrada_quando_partida_realizada():
    assert lesao_ativa(_lesao_proximo_jogo(), status_partida_travada="realizada") is False


def test_lesao_proximo_jogo_encerrada_quando_partida_cancelada():
    assert lesao_ativa(_lesao_proximo_jogo(), status_partida_travada="cancelada") is False
