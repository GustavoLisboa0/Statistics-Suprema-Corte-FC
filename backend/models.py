from datetime import date
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

Posicao = Literal[
    "goleiro",
    "lateral_direito",
    "lateral_esquerdo",
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
    pass


class JogadorUpdate(BaseModel):
    nome: Optional[str] = None
    apelido: Optional[str] = None
    posicoes: Optional[list[Posicao]] = None
    numero_camisa: Optional[int] = None
    data_nascimento: Optional[date] = None
    ativo: Optional[bool] = None


class Jogador(JogadorBase):
    id: UUID


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