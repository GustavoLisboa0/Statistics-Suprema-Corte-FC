from uuid import UUID

from fastapi import APIRouter, HTTPException

from database import supabase
from models import Estatistica, EstatisticaCreate, EstatisticaUpdate

router = APIRouter(prefix="/estatisticas", tags=["Estatísticas"])

TABLE = "estatisticas_partida"


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
@router.get("/", response_model=list[Estatistica])
def listar_estatisticas(partida_id: UUID | None = None, jogador_id: UUID | None = None):
    query = supabase.table(TABLE).select("*")
    if partida_id:
        query = query.eq("partida_id", str(partida_id))
    if jogador_id:
        query = query.eq("jogador_id", str(jogador_id))
    resposta = query.execute()
    return resposta.data


@router.post("/", response_model=Estatistica, status_code=201)
def criar_estatistica(estatistica: EstatisticaCreate):
    payload = estatistica.model_dump(mode="json")
    resposta = supabase.table(TABLE).insert(payload).execute()
    return resposta.data[0]


@router.patch("/{estatistica_id}", response_model=Estatistica)
def atualizar_estatistica(estatistica_id: UUID, estatistica: EstatisticaUpdate):
    payload = {k: v for k, v in estatistica.model_dump(mode="json").items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    resposta = supabase.table(TABLE).update(payload).eq("id", str(estatistica_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Estatística não encontrada")
    return resposta.data[0]


@router.delete("/{estatistica_id}", status_code=204)
def remover_estatistica(estatistica_id: UUID):
    resposta = supabase.table(TABLE).delete().eq("id", str(estatistica_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Estatística não encontrada")


# ---------------------------------------------------------------------------
# Dashboard (usa as views criadas em database/schema.sql)
# ---------------------------------------------------------------------------
@router.get("/dashboard/artilheiros")
def dashboard_artilheiros(limite: int = 10):
    resposta = (
        supabase.table("vw_artilheiros")
        .select("*")
        .order("total_gols", desc=True)
        .limit(limite)
        .execute()
    )
    return resposta.data


@router.get("/dashboard/cartoes")
def dashboard_cartoes(limite: int = 10):
    resposta = (
        supabase.table("vw_cartoes")
        .select("*")
        .order("total_amarelos", desc=True)
        .limit(limite)
        .execute()
    )
    return resposta.data


@router.get("/dashboard/desempenho-time")
def dashboard_desempenho_time():
    resposta = supabase.table("vw_desempenho_time").select("*").execute()
    return resposta.data[0] if resposta.data else {}