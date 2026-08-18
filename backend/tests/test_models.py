from models import numero_camisa_disponivel


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
