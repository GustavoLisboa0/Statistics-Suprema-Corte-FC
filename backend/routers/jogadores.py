from uuid import UUID

from fastapi import APIRouter, HTTPException

from database import supabase
from models import Jogador, JogadorCreate, JogadorUpdate

router = APIRouter(prefix="/jogadores", tags=["Jogadores"])

TABLE = "jogadores"


@router.get("/", response_model=list[Jogador])
def listar_jogadores(apenas_ativos: bool = False):
    query = supabase.table(TABLE).select("*").order("nome")
    if apenas_ativos:
        query = query.eq("ativo", True)
    resposta = query.execute()
    return resposta.data


@router.get("/{jogador_id}", response_model=Jogador)
def obter_jogador(jogador_id: UUID):
    resposta = supabase.table(TABLE).select("*").eq("id", str(jogador_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")
    return resposta.data[0]


@router.post("/", response_model=Jogador, status_code=201)
def criar_jogador(jogador: JogadorCreate):
    payload = jogador.model_dump(mode="json")
    resposta = supabase.table(TABLE).insert(payload).execute()
    return resposta.data[0]


@router.patch("/{jogador_id}", response_model=Jogador)
def atualizar_jogador(jogador_id: UUID, jogador: JogadorUpdate):
    payload = {k: v for k, v in jogador.model_dump(mode="json").items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    resposta = supabase.table(TABLE).update(payload).eq("id", str(jogador_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")
    return resposta.data[0]


@router.delete("/{jogador_id}", status_code=204)
def remover_jogador(jogador_id: UUID):
    resposta = supabase.table(TABLE).delete().eq("id", str(jogador_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")