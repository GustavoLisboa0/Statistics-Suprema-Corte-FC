from datetime import date
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

TELEFONE_REGEX = r"^\(\d{2}\) \d{5}-\d{4}$"


# ---------------------------------------------------------------------------
# Jogadores
# ---------------------------------------------------------------------------
class JogadorBase(BaseModel):
    nome: str
    apelido: Optional[str] = None
    posicoes: list[Posicao] = Field(min_length=1)
    numero_camisa: Optional[int] = None
    data_nascimento: Optional[date] = None
    ativo: bool = True


class JogadorCreate(JogadorBase):
    telefone: str = Field(pattern=TELEFONE_REGEX)


class JogadorUpdate(BaseModel):
    nome: Optional[str] = None
    apelido: Optional[str] = None
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


class Partida(PartidaBase):
    id: UUID


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
