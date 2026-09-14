from datetime import date, time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from auth import exige_editor, usuario_atual
from clima import buscar_clima
from database import supabase
from models import Partida, PartidaCreate, PartidaUpdate
from routers.punicoes import avancar_punicoes_por_jogos

# Toda rota daqui exige login; escrita exige papel de editor.
router = APIRouter(
    prefix="/partidas",
    tags=["Partidas"],
    dependencies=[Depends(usuario_atual)],
)

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
def criar_partida(partida: PartidaCreate, usuario: dict = Depends(exige_editor)):
    payload = partida.model_dump(mode="json")
    # Best-effort: buscar_clima decide sozinho previsão (data futura) vs
    # clima real (data passada) e devolve None se a chamada externa falhar
    # ou a data estiver fora do alcance da API — a partida salva do mesmo
    # jeito sem clima.
    clima = buscar_clima(partida.data, partida.horario)
    if clima:
        payload["clima"] = clima
    resposta = supabase.table(TABLE).insert(payload).execute()
    return resposta.data[0]


@router.patch("/{partida_id}", response_model=Partida)
def atualizar_partida(
    partida_id: UUID, partida: PartidaUpdate, usuario: dict = Depends(exige_editor)
):
    payload = {k: v for k, v in partida.model_dump(mode="json").items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    atual = (
        supabase.table(TABLE).select("status,data,horario").eq("id", str(partida_id)).execute()
    )
    if not atual.data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")
    estado_atual = atual.data[0]

    # Descobre se a partida está VIRANDO "realizada" (não se já estava), pra
    # descontar jogo de punição uma única vez por partida.
    vira_realizada = (
        payload.get("status") == "realizada" and estado_atual["status"] != "realizada"
    )

    # Refaz a busca de clima se data/horário mudaram nesta edição (pode virar
    # previsão diferente, ou até virar consulta histórica se a nova data já
    # passou), OU se a partida está virando "realizada" agora — nesse caso
    # busca o clima real que ocorreu, substituindo a última previsão salva
    # (que era só uma estimativa de antes do jogo acontecer). Sem nenhuma
    # dessas duas razões, não há por quê bater na API à toa (placar,
    # observações etc. não afetam o clima).
    data_final = payload.get("data", estado_atual.get("data"))
    horario_final = payload.get("horario", estado_atual.get("horario"))
    if ("data" in payload or "horario" in payload or vira_realizada) and data_final and horario_final:
        clima = buscar_clima(date.fromisoformat(data_final), time.fromisoformat(horario_final))
        if clima:
            payload["clima"] = clima

    resposta = supabase.table(TABLE).update(payload).eq("id", str(partida_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")

    if vira_realizada:
        avancar_punicoes_por_jogos()

    return resposta.data[0]


@router.post("/{partida_id}/clima", response_model=Partida)
def atualizar_clima(partida_id: UUID, usuario: dict = Depends(exige_editor)):
    """
    Busca o clima de novo pro horário já salvo da partida — botão
    "Atualizar clima" do front. Útil quando a partida foi criada fora do
    alcance da API na hora (previsão além de ~16 dias, ou clima real de um
    dia tão recente que a Open-Meteo ainda não processou), e pra buscar o
    clima real depois que o jogo acontece, se a busca automática não pegou.
    """
    atual = supabase.table(TABLE).select("*").eq("id", str(partida_id)).execute()
    if not atual.data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")
    partida_atual = atual.data[0]

    if not partida_atual.get("horario"):
        raise HTTPException(status_code=400, detail="Esta partida não tem horário definido")

    clima = buscar_clima(
        date.fromisoformat(partida_atual["data"]), time.fromisoformat(partida_atual["horario"])
    )
    if not clima:
        raise HTTPException(
            status_code=422,
            detail="Clima ainda não disponível para essa data.",
        )

    resposta = supabase.table(TABLE).update({"clima": clima}).eq("id", str(partida_id)).execute()
    return resposta.data[0]


@router.delete("/{partida_id}", status_code=204)
def remover_partida(partida_id: UUID, usuario: dict = Depends(exige_editor)):
    resposta = supabase.table(TABLE).delete().eq("id", str(partida_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")