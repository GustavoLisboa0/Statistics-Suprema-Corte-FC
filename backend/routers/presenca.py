import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from auth import exige_editor, usuario_atual
from database import supabase
from models import (
    Estatistica,
    Presenca,
    PresencaConfirmarEditor,
    PresencaCreate,
    PresencaUpdatePagamento,
    PresencaUpdatePosicao,
    PresencaUpdateStatus,
)

router = APIRouter(prefix="/partidas", tags=["Presença"])

TABLE = "presenca"
TABLE_JOGADORES = "jogadores"
TABLE_PARTIDAS = "partidas"
TABLE_ESTATISTICAS = "estatisticas_partida"


def _so_digitos(valor: str | None) -> str:
    return re.sub(r"\D", "", valor or "")


def jogador_da_conta(usuario: dict) -> dict:
    """
    Descobre qual jogador do elenco é a conta logada.

    Procura nesta ordem: vínculo já gravado (`perfil_id`), email e telefone.
    Ao casar por email/telefone grava o `perfil_id`, então a partir da segunda
    vez o vínculo não depende mais de o dado continuar igual.
    """
    resposta = supabase.table(TABLE_JOGADORES).select("*").eq("perfil_id", usuario["id"]).execute()
    if resposta.data:
        return resposta.data[0]

    todos = supabase.table(TABLE_JOGADORES).select("*").execute().data or []

    email = (usuario.get("email") or "").strip().lower()
    telefone = _so_digitos(usuario.get("telefone"))

    encontrado = None
    for jogador in todos:
        if email and (jogador.get("email") or "").strip().lower() == email:
            encontrado = jogador
            break
        if telefone and _so_digitos(jogador.get("telefone")) == telefone:
            encontrado = jogador
            break

    if not encontrado:
        raise HTTPException(
            status_code=403,
            detail=(
                "Sua conta ainda não está vinculada a um jogador do elenco. "
                "Peça para o responsável cadastrar seu email no seu perfil de jogador."
            ),
        )

    # Só grava o vínculo se ninguém mais tiver reivindicado esse jogador.
    if not encontrado.get("perfil_id"):
        supabase.table(TABLE_JOGADORES).update({"perfil_id": usuario["id"]}).eq(
            "id", encontrado["id"]
        ).execute()
        encontrado["perfil_id"] = usuario["id"]

    return encontrado


def _partida_ou_404(partida_id: UUID) -> dict:
    resposta = supabase.table(TABLE_PARTIDAS).select("*").eq("id", str(partida_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")
    return resposta.data[0]


def _jogador_ou_404(jogador_id: UUID) -> dict:
    resposta = supabase.table(TABLE_JOGADORES).select("*").eq("id", str(jogador_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")
    return resposta.data[0]


def _confirmados_de_linha(partida_id: UUID, ignorar_jogador: str | None = None) -> int:
    """Quantos jogadores de linha já estão confirmados. Goleiro não ocupa vaga."""
    linhas = (
        supabase.table(TABLE)
        .select("jogador_id,status,posicao")
        .eq("partida_id", str(partida_id))
        .eq("status", "confirmado")
        .execute()
        .data
        or []
    )
    return sum(
        1
        for linha in linhas
        if linha.get("posicao") != "goleiro" and linha["jogador_id"] != ignorar_jogador
    )


# ---------------------------------------------------------------------------
# Presença
# ---------------------------------------------------------------------------
@router.get("/{partida_id}/presenca", response_model=list[Presenca])
def listar_presenca(partida_id: UUID, usuario: dict = Depends(usuario_atual)):
    return (
        supabase.table(TABLE)
        .select("*")
        .eq("partida_id", str(partida_id))
        .order("created_at")
        .execute()
        .data
    )


@router.post("/{partida_id}/presenca", response_model=Presenca, status_code=201)
def confirmar_presenca(
    partida_id: UUID,
    presenca: PresencaCreate,
    usuario: dict = Depends(usuario_atual),
):
    """
    Confirma (ou desmarca) a presença de quem está logado.

    O `jogador_id` nunca vem do cliente: é resolvido a partir da sessão, então
    ninguém confirma presença no lugar de outro.
    """
    partida = _partida_ou_404(partida_id)
    jogador = jogador_da_conta(usuario)

    vai_jogar = presenca.status in ("confirmado", "espera")

    if vai_jogar and not presenca.termos_aceitos:
        raise HTTPException(status_code=400, detail="É preciso aceitar os termos para confirmar")

    if vai_jogar and not presenca.posicao:
        raise HTTPException(status_code=400, detail="Escolha a posição em que vai jogar")

    if presenca.posicao and presenca.posicao not in (jogador.get("posicoes") or []):
        raise HTTPException(
            status_code=400,
            detail="Essa posição não está cadastrada no seu perfil de jogador",
        )

    status = presenca.status

    # Lotou as vagas de linha? Entra na fila. Goleiro não ocupa vaga.
    vagas = partida.get("vagas_linha")
    if status == "confirmado" and presenca.posicao != "goleiro" and vagas:
        if _confirmados_de_linha(partida_id, ignorar_jogador=jogador["id"]) >= vagas:
            status = "espera"

    payload = {
        "partida_id": str(partida_id),
        "jogador_id": jogador["id"],
        "status": status,
        "posicao": presenca.posicao if vai_jogar else None,
        "termos_aceitos": presenca.termos_aceitos,
    }

    resposta = (
        supabase.table(TABLE).upsert(payload, on_conflict="partida_id,jogador_id").execute()
    )
    return resposta.data[0]


# ---------------------------------------------------------------------------
# Ações do editor
# ---------------------------------------------------------------------------
@router.post("/{partida_id}/presenca/{jogador_id}", response_model=Presenca, status_code=201)
def confirmar_presenca_editor(
    partida_id: UUID,
    jogador_id: UUID,
    dados: PresencaConfirmarEditor,
    usuario: dict = Depends(exige_editor),
):
    """
    Confirma presença em nome de um jogador — pra quem avisou por fora e não
    teve como (ou não quis) usar o app. Mesma regra de fila de espera do
    autoatendimento; termos_aceitos vai automaticamente como True.
    """
    partida = _partida_ou_404(partida_id)
    jogador = _jogador_ou_404(jogador_id)

    if dados.posicao not in (jogador.get("posicoes") or []):
        raise HTTPException(
            status_code=400,
            detail="Essa posição não está cadastrada no perfil do jogador",
        )

    status = "confirmado"
    vagas = partida.get("vagas_linha")
    if dados.posicao != "goleiro" and vagas:
        if _confirmados_de_linha(partida_id, ignorar_jogador=str(jogador_id)) >= vagas:
            status = "espera"

    payload = {
        "partida_id": str(partida_id),
        "jogador_id": str(jogador_id),
        "status": status,
        "posicao": dados.posicao,
        "termos_aceitos": True,
    }
    resposta = supabase.table(TABLE).upsert(payload, on_conflict="partida_id,jogador_id").execute()
    return resposta.data[0]


@router.patch("/{partida_id}/presenca/{jogador_id}/pagamento", response_model=Presenca)
def atualizar_pagamento(
    partida_id: UUID,
    jogador_id: UUID,
    dados: PresencaUpdatePagamento,
    usuario: dict = Depends(exige_editor),
):
    resposta = (
        supabase.table(TABLE)
        .update({"status_pagamento": dados.status_pagamento})
        .eq("partida_id", str(partida_id))
        .eq("jogador_id", str(jogador_id))
        .execute()
    )
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Presença não encontrada")
    return resposta.data[0]


@router.patch("/{partida_id}/presenca/{jogador_id}/status", response_model=Presenca)
def atualizar_status(
    partida_id: UUID,
    jogador_id: UUID,
    dados: PresencaUpdateStatus,
    usuario: dict = Depends(exige_editor),
):
    """
    Promove alguém da lista de espera, ou cancela a presença de alguém
    (status "ausente") em nome do jogador — mesmo efeito de o próprio
    jogador reabrir a confirmação e marcar "Não vou".
    """
    payload = {"status": dados.status}
    if dados.status == "ausente":
        # Mesma regra do autoatendimento: quem não vai não carrega posição.
        payload["posicao"] = None

    resposta = (
        supabase.table(TABLE)
        .update(payload)
        .eq("partida_id", str(partida_id))
        .eq("jogador_id", str(jogador_id))
        .execute()
    )
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Presença não encontrada")
    return resposta.data[0]


@router.patch("/{partida_id}/presenca/{jogador_id}/posicao", response_model=Presenca)
def atualizar_posicao(
    partida_id: UUID,
    jogador_id: UUID,
    dados: PresencaUpdatePosicao,
    usuario: dict = Depends(exige_editor),
):
    """Corrige a posição em que o jogador vai atuar, dentro das que ele tem cadastradas."""
    jogador = _jogador_ou_404(jogador_id)
    if dados.posicao not in (jogador.get("posicoes") or []):
        raise HTTPException(
            status_code=400,
            detail="Essa posição não está cadastrada no perfil do jogador",
        )

    resposta = (
        supabase.table(TABLE)
        .update({"posicao": dados.posicao})
        .eq("partida_id", str(partida_id))
        .eq("jogador_id", str(jogador_id))
        .execute()
    )
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Presença não encontrada")
    return resposta.data[0]


@router.delete("/{partida_id}/presenca/{jogador_id}", status_code=204)
def remover_presenca(
    partida_id: UUID,
    jogador_id: UUID,
    usuario: dict = Depends(exige_editor),
):
    """Retira o jogador da lista por completo — como se nunca tivesse respondido."""
    resposta = (
        supabase.table(TABLE)
        .delete()
        .eq("partida_id", str(partida_id))
        .eq("jogador_id", str(jogador_id))
        .execute()
    )
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Presença não encontrada")


# ---------------------------------------------------------------------------
# Estatísticas da partida, restritas a quem confirmou
# ---------------------------------------------------------------------------
@router.get("/{partida_id}/estatisticas", response_model=list[Estatistica])
def estatisticas_da_partida(partida_id: UUID, usuario: dict = Depends(usuario_atual)):
    """
    Estatísticas dos jogadores **confirmados** na partida.

    A posição vem da presença quando existir, substituindo a que estiver
    gravada na estatística. Se a partida não tem nenhum registro de presença
    (todas as partidas anteriores a esta feature), devolve as estatísticas
    como estão — senão elas sumiriam da tela.
    """
    estatisticas = (
        supabase.table(TABLE_ESTATISTICAS)
        .select("*")
        .eq("partida_id", str(partida_id))
        .execute()
        .data
        or []
    )

    presencas = (
        supabase.table(TABLE)
        .select("jogador_id,status,posicao")
        .eq("partida_id", str(partida_id))
        .execute()
        .data
        or []
    )

    if not presencas:
        return estatisticas

    posicao_por_jogador = {
        p["jogador_id"]: p.get("posicao") for p in presencas if p["status"] == "confirmado"
    }

    resultado = []
    for est in estatisticas:
        if est["jogador_id"] not in posicao_por_jogador:
            continue
        posicao = posicao_por_jogador[est["jogador_id"]]
        if posicao:
            est["posicao"] = posicao
        resultado.append(est)

    return resultado
