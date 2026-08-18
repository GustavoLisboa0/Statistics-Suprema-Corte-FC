from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from auth import usuario_atual
from database import supabase
from models import Lesao, LesaoCreate, LesaoUpdate, lesao_ativa

# Diferente de punições: aqui a leitura é aberta a qualquer conta logada
# (visibilidade é o objetivo — o time inteiro deve ver quem está machucado).
# Escrita é autoatendimento: o próprio jogador, ou um editor em nome dele.
router = APIRouter(prefix="/jogadores", tags=["Lesões"], dependencies=[Depends(usuario_atual)])

# Rota à parte, sem o prefixo /jogadores: agrega lesões de todo o elenco pra
# pintar a tag "Machucado" na lista sem precisar de uma chamada por jogador.
router_ativas = APIRouter(prefix="/lesoes", tags=["Lesões"], dependencies=[Depends(usuario_atual)])

TABLE = "lesoes"
TABLE_JOGADORES = "jogadores"
TABLE_PARTIDAS = "partidas"


def _garantir_dono_ou_editor(jogador_id: UUID, usuario: dict) -> None:
    if usuario["papel"] == "editor":
        return
    atual = supabase.table(TABLE_JOGADORES).select("perfil_id").eq("id", str(jogador_id)).execute()
    if not atual.data or atual.data[0].get("perfil_id") != usuario["id"]:
        raise HTTPException(status_code=403, detail="Você só pode gerenciar a própria lesão")


def _status_da_partida(partida_id: str | None) -> str | None:
    if not partida_id:
        return None
    resposta = supabase.table(TABLE_PARTIDAS).select("status").eq("id", partida_id).execute()
    return resposta.data[0]["status"] if resposta.data else None


@router.get("/{jogador_id}/lesoes", response_model=list[Lesao])
def listar_lesoes(jogador_id: UUID):
    resposta = (
        supabase.table(TABLE)
        .select("*")
        .eq("jogador_id", str(jogador_id))
        .order("criado_em", desc=True)
        .execute()
    )
    return resposta.data


@router.post("/{jogador_id}/lesoes", response_model=Lesao, status_code=201)
def registrar_lesao(jogador_id: UUID, lesao: LesaoCreate, usuario: dict = Depends(usuario_atual)):
    _garantir_dono_ou_editor(jogador_id, usuario)

    existentes = supabase.table(TABLE).select("*").eq("jogador_id", str(jogador_id)).execute().data or []
    for existente in existentes:
        status_atual = _status_da_partida(existente.get("partida_id"))
        if lesao_ativa(existente, status_atual):
            raise HTTPException(
                status_code=409,
                detail="Já existe uma lesão ativa registrada. Atualize ou encerre a atual antes de registrar outra.",
            )

    payload: dict = {"jogador_id": str(jogador_id), "motivo": lesao.motivo, "tipo": lesao.tipo}

    if lesao.tipo == "data":
        if not lesao.termina_em:
            raise HTTPException(status_code=400, detail="Informe até quando vale a lesão")
        payload["termina_em"] = lesao.termina_em.isoformat()
    else:
        proxima = (
            supabase.table(TABLE_PARTIDAS)
            .select("id")
            .eq("status", "agendada")
            .order("data")
            .limit(1)
            .execute()
        )
        if not proxima.data:
            raise HTTPException(status_code=400, detail="Não há nenhuma partida agendada no momento")
        payload["partida_id"] = proxima.data[0]["id"]

    resposta = supabase.table(TABLE).insert(payload).execute()
    return resposta.data[0]


@router.patch("/{jogador_id}/lesoes/{lesao_id}", response_model=Lesao)
def atualizar_lesao(
    jogador_id: UUID, lesao_id: UUID, lesao: LesaoUpdate, usuario: dict = Depends(usuario_atual)
):
    _garantir_dono_ou_editor(jogador_id, usuario)

    payload = {k: v for k, v in lesao.model_dump(mode="json").items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    resposta = (
        supabase.table(TABLE)
        .update(payload)
        .eq("id", str(lesao_id))
        .eq("jogador_id", str(jogador_id))
        .execute()
    )
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Lesão não encontrada")
    return resposta.data[0]


@router.delete("/{jogador_id}/lesoes/{lesao_id}", status_code=204)
def remover_lesao(jogador_id: UUID, lesao_id: UUID, usuario: dict = Depends(usuario_atual)):
    _garantir_dono_ou_editor(jogador_id, usuario)

    resposta = (
        supabase.table(TABLE)
        .delete()
        .eq("id", str(lesao_id))
        .eq("jogador_id", str(jogador_id))
        .execute()
    )
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Lesão não encontrada")


@router_ativas.get("/ativas")
def lesoes_ativas():
    """Todas as lesões atualmente ativas de todo o elenco, uma linha por jogador machucado."""
    lesoes = supabase.table(TABLE).select("*").execute().data or []
    status_por_partida: dict[str, str] = {}

    ativas = []
    for lesao in lesoes:
        partida_id = lesao.get("partida_id")
        if partida_id:
            if partida_id not in status_por_partida:
                status_por_partida[partida_id] = _status_da_partida(partida_id)
            status_atual = status_por_partida[partida_id]
        else:
            status_atual = None
        if lesao_ativa(lesao, status_atual):
            ativas.append(lesao)

    return ativas
