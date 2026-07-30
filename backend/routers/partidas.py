from uuid import UUID

from fastapi import APIRouter, HTTPException

from database import supabase
from models import Partida, PartidaCreate, PartidaUpdate

router = APIRouter(prefix="/partidas", tags=["Partidas"])

TABLE = "partidas"


@router.get("/", response_model=list[Partida])
def listar_partidas(status: str | None = None):
    query = supabase.table(TABLE).select("*")
    if status:
        query = query.eq("status", status)
    resposta = query.order("data", desc=True).execute()
    return resposta.data


@router.get("/proximas", response_model=list[Partida])
def proximas_partidas(limite: int = 5):
    resposta = (
        supabase.table(TABLE)
        .select("*")
        .eq("status", "agendada")
        .order("data")
        .limit(limite)
        .execute()
    )
    return resposta.data


@router.get("/resultados", response_model=list[Partida])
def ultimos_resultados(limite: int = 5):
    resposta = (
        supabase.table(TABLE)
        .select("*")
        .eq("status", "realizada")
        .order("data", desc=True)
        .limit(limite)
        .execute()
    )
    return resposta.data


@router.get("/{partida_id}", response_model=Partida)
def obter_partida(partida_id: UUID):
    resposta = supabase.table(TABLE).select("*").eq("id", str(partida_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")
    return resposta.data[0]


@router.post("/", response_model=Partida, status_code=201)
def criar_partida(partida: PartidaCreate):
    payload = partida.model_dump(mode="json")
    resposta = supabase.table(TABLE).insert(payload).execute()
    return resposta.data[0]


@router.patch("/{partida_id}", response_model=Partida)
def atualizar_partida(partida_id: UUID, partida: PartidaUpdate):
    payload = {k: v for k, v in partida.model_dump(mode="json").items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    resposta = supabase.table(TABLE).update(payload).eq("id", str(partida_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")
    return resposta.data[0]


@router.delete("/{partida_id}", status_code=204)
def remover_partida(partida_id: UUID):
    resposta = supabase.table(TABLE).delete().eq("id", str(partida_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")