from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from auth import exige_editor
from database import supabase
from models import Punicao, PunicaoCreate, PunicaoUpdate, punicao_ativa

# Inteiramente restrito a editor — nem a leitura é liberada pra quem não é
# admin. É isso que garante que o jogador nunca vê a própria punição: nenhuma
# rota aqui aceita `usuario_atual` sozinho, só `exige_editor`.
router = APIRouter(prefix="/jogadores", tags=["Punições"], dependencies=[Depends(exige_editor)])

TABLE = "punicoes"


def avancar_punicoes_por_jogos() -> None:
    """
    Avança 1 jogo cumprido em toda punição tipo "jogos" ainda ativa.

    Chamado por routers/partidas.py quando uma partida passa a "realizada".
    Conta todo jogo do time, não só os que o jogador punido participaria —
    ele nem pode confirmar presença enquanto está cumprindo a punição, então
    não daria pra descontar por presença.
    """
    punicoes = supabase.table(TABLE).select("*").eq("tipo", "jogos").execute().data or []
    for p in punicoes:
        if not punicao_ativa(p):
            continue
        novo = min(p["jogos_cumpridos"] + 1, p["jogos_totais"])
        supabase.table(TABLE).update({"jogos_cumpridos": novo}).eq("id", p["id"]).execute()


@router.get("/{jogador_id}/punicoes", response_model=list[Punicao])
def listar_punicoes(jogador_id: UUID):
    resposta = (
        supabase.table(TABLE)
        .select("*")
        .eq("jogador_id", str(jogador_id))
        .order("criado_em", desc=True)
        .execute()
    )
    return resposta.data


@router.post("/{jogador_id}/punicoes", response_model=Punicao, status_code=201)
def criar_punicao(jogador_id: UUID, punicao: PunicaoCreate, usuario: dict = Depends(exige_editor)):
    if punicao.tipo == "dias" and not punicao.termina_em:
        raise HTTPException(status_code=400, detail="Informe a data de término da punição")
    if punicao.tipo == "jogos" and not punicao.jogos_totais:
        raise HTTPException(status_code=400, detail="Informe o número de jogos da punição")

    payload = punicao.model_dump(mode="json")
    payload["jogador_id"] = str(jogador_id)
    payload["criado_por"] = usuario["id"]
    resposta = supabase.table(TABLE).insert(payload).execute()
    return resposta.data[0]


@router.patch("/{jogador_id}/punicoes/{punicao_id}", response_model=Punicao)
def atualizar_punicao(jogador_id: UUID, punicao_id: UUID, punicao: PunicaoUpdate):
    payload = {k: v for k, v in punicao.model_dump(mode="json").items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    resposta = (
        supabase.table(TABLE)
        .update(payload)
        .eq("id", str(punicao_id))
        .eq("jogador_id", str(jogador_id))
        .execute()
    )
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Punição não encontrada")
    return resposta.data[0]


@router.delete("/{jogador_id}/punicoes/{punicao_id}", status_code=204)
def remover_punicao(jogador_id: UUID, punicao_id: UUID):
    resposta = (
        supabase.table(TABLE)
        .delete()
        .eq("id", str(punicao_id))
        .eq("jogador_id", str(jogador_id))
        .execute()
    )
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Punição não encontrada")
