from datetime import date
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

Posicao = Literal[
    "goleiro",
    "lateral_direito",
    "lateral_esquerdo",
    "zagueiro",
    "volante",
    "meia",
    "meia_esquerda",
    "meia_direita",
    "meia_atacante",
    "atacante",
    "ponta_esquerda",
    "ponta_direita",
    "centro_avante",
]
Local = Literal["trieste", "iguacu", "outro"]
Mando = Literal["mandante", "visitante"]
StatusPartida = Literal["agendada", "realizada", "cancelada"]
StatusPresenca = Literal["confirmado", "espera", "ausente"]
StatusPagamento = Literal["pendente", "pago"]

TELEFONE_REGEX = r"^\(\d{2}\) \d{5}-\d{4}$"
# Validação simples e sem dependência extra (`EmailStr` exigiria o pacote
# email-validator, que teria de entrar também no deploy).
EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"

# Vagas de linha por partida: o time joga com no mínimo 10 e no máximo 20.
MIN_VAGAS_LINHA = 10
MAX_VAGAS_LINHA = 20


# ---------------------------------------------------------------------------
# Jogadores
# ---------------------------------------------------------------------------
class JogadorBase(BaseModel):
    nome: str
    apelido: Optional[str] = None
    email: Optional[str] = Field(default=None, pattern=EMAIL_REGEX)
    posicoes: list[Posicao] = Field(min_length=1)
    numero_camisa: Optional[int] = None
    data_nascimento: Optional[date] = None
    ativo: bool = True


class JogadorCreate(JogadorBase):
    telefone: str = Field(pattern=TELEFONE_REGEX)


class JogadorUpdate(BaseModel):
    nome: Optional[str] = None
    apelido: Optional[str] = None
    email: Optional[str] = Field(default=None, pattern=EMAIL_REGEX)
    telefone: Optional[str] = Field(default=None, pattern=TELEFONE_REGEX)
    posicoes: Optional[list[Posicao]] = None
    numero_camisa: Optional[int] = None
    data_nascimento: Optional[date] = None
    ativo: Optional[bool] = None


class Jogador(JogadorBase):
    id: UUID
    # Opcional aqui (diferente de JogadorCreate) para não quebrar a leitura
    # de jogadores cadastrados antes deste campo existir, que ficam com
    # telefone nulo no banco até serem editados.
    telefone: Optional[str] = None
    # Conta de login amarrada a este jogador (null enquanto ninguém reivindicou).
    perfil_id: Optional[UUID] = None


def numero_camisa_disponivel(
    jogadores: list[dict], numero_camisa: Optional[int], jogador_id: Optional[str] = None
) -> bool:
    """
    Verifica se `numero_camisa` está livre entre os jogadores ativos.

    Sem número (`None`) está sempre disponível — nem todo jogador precisa ter
    um. Jogador inativo nunca disputa o número com ninguém: ele perde o
    próprio número ao ser desativado (ver `atualizar_jogador` no router), então
    só jogadores ativos entram na checagem. `jogador_id` exclui o próprio
    jogador da comparação, pra não bloquear a edição de quem já tem o número.
    """
    if numero_camisa is None:
        return True
    return not any(
        j.get("numero_camisa") == numero_camisa
        and j.get("ativo", True)
        and j.get("id") != jogador_id
        for j in jogadores
    )


# ---------------------------------------------------------------------------
# Partidas
# ---------------------------------------------------------------------------
class PartidaBase(BaseModel):
    data: date
    adversario: str
    local: Local
    local_detalhe: Optional[str] = None
    mando: Mando = "mandante"
    status: StatusPartida = "agendada"
    placar_suprema: int = 0
    placar_adversario: int = 0
    campeonato_ou_amistoso: Optional[str] = None
    observacoes: Optional[str] = None
    # Quantas vagas de linha a partida tem. Goleiros ficam fora dessa conta.
    # Null = sem limite (partidas antigas continuam assim).
    vagas_linha: Optional[int] = Field(default=None, ge=MIN_VAGAS_LINHA, le=MAX_VAGAS_LINHA)
    # Custo do jogo, valores cheios como são cobrados no local.
    # Quadra e arbitragem são rachadas com o time adversário; o goleiro é só
    # nosso. Ver `custo_do_time()` para o rateio.
    valor_quadra: Optional[Decimal] = Field(default=None, ge=0)
    valor_arbitragem: Optional[Decimal] = Field(default=None, ge=0)
    valor_goleiro: Optional[Decimal] = Field(default=None, ge=0)


class PartidaCreate(PartidaBase):
    pass


class PartidaUpdate(BaseModel):
    data: Optional[date] = None
    adversario: Optional[str] = None
    local: Optional[Local] = None
    local_detalhe: Optional[str] = None
    mando: Optional[Mando] = None
    status: Optional[StatusPartida] = None
    placar_suprema: Optional[int] = None
    placar_adversario: Optional[int] = None
    campeonato_ou_amistoso: Optional[str] = None
    observacoes: Optional[str] = None
    vagas_linha: Optional[int] = Field(default=None, ge=MIN_VAGAS_LINHA, le=MAX_VAGAS_LINHA)
    valor_quadra: Optional[Decimal] = Field(default=None, ge=0)
    valor_arbitragem: Optional[Decimal] = Field(default=None, ge=0)
    valor_goleiro: Optional[Decimal] = Field(default=None, ge=0)


class Partida(PartidaBase):
    id: UUID


def custo_do_time(partida: "PartidaBase | dict") -> Decimal:
    """
    Quanto o Suprema Corte paga pela partida.

    Quadra e arbitragem são rachadas com o time adversário; o goleiro é
    despesa só nossa. O valor por jogador é esse total dividido pelas vagas
    de linha (o goleiro não paga).
    """
    dados = partida if isinstance(partida, dict) else partida.model_dump()
    valor = lambda campo: Decimal(str(dados.get(campo) or 0))  # noqa: E731
    return valor("valor_quadra") / 2 + valor("valor_arbitragem") / 2 + valor("valor_goleiro")


# ---------------------------------------------------------------------------
# Estatísticas por partida
# ---------------------------------------------------------------------------
class EstatisticaBase(BaseModel):
    jogador_id: UUID
    partida_id: UUID
    # Posição em que o jogador atuou nesta partida. Opcional: lançamentos
    # antigos não têm o dado, e o front assume a posição principal dele.
    posicao: Optional[Posicao] = None
    gols: int = 0
    assistencias: int = 0
    cartoes_amarelos: int = 0
    cartoes_vermelhos: int = 0
    minutos_jogados: int = 0
    titular: bool = False
    defesas: Optional[int] = None
    gols_sofridos: Optional[int] = None


class EstatisticaCreate(EstatisticaBase):
    pass


class EstatisticaUpdate(BaseModel):
    posicao: Optional[Posicao] = None
    gols: Optional[int] = None
    assistencias: Optional[int] = None
    cartoes_amarelos: Optional[int] = None
    cartoes_vermelhos: Optional[int] = None
    minutos_jogados: Optional[int] = None
    titular: Optional[bool] = None
    defesas: Optional[int] = None
    gols_sofridos: Optional[int] = None


class Estatistica(EstatisticaBase):
    id: UUID


# ---------------------------------------------------------------------------
# Presença e pagamento
# ---------------------------------------------------------------------------
class PresencaCreate(BaseModel):
    """
    O que o jogador envia ao confirmar (ou desmarcar) presença.

    Não recebe `jogador_id`: quem está confirmando é sempre a conta logada, e
    o backend resolve o jogador a partir dela. Isso evita alguém confirmar
    presença no lugar de outro.
    """

    status: StatusPresenca
    posicao: Optional[Posicao] = None
    termos_aceitos: bool = False


class PresencaConfirmarEditor(BaseModel):
    """
    Usado pelo editor pra confirmar presença em nome de um jogador que avisou
    por fora (ligação, WhatsApp) e não usa o app, ou não tem conta ainda.

    Sempre confirma (respeitando a fila de espera se lotar); termos_aceitos
    fica implícito — o editor está assumindo a responsabilidade por essa
    entrada, não faz sentido pedir pro jogador clicar num checkbox que ele
    nem vai ver.
    """

    posicao: Posicao


class PresencaUpdatePagamento(BaseModel):
    status_pagamento: StatusPagamento


class PresencaUpdateStatus(BaseModel):
    """
    Usado pelo editor pra promover alguém da espera, ou cancelar a presença
    de alguém (status "ausente") em nome do jogador.
    """

    status: StatusPresenca


class PresencaUpdatePosicao(BaseModel):
    """Usado pelo editor pra corrigir a posição que o jogador escolheu."""

    posicao: Posicao


class Presenca(BaseModel):
    id: UUID
    partida_id: UUID
    jogador_id: UUID
    status: StatusPresenca
    posicao: Optional[Posicao] = None
    termos_aceitos: bool = False
    status_pagamento: StatusPagamento = "pendente"
