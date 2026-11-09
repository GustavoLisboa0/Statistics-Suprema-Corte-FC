"""
Escalador automático (4-4-2) — rotas.

Toda a lógica de montar o time está em `escalacao.py` (funções puras). Aqui
só buscamos os dados (presença, jogadores, punições, lesões), chamamos o
escalador e guardamos/devolvemos o resultado.

Quem gera e salva é só o editor (admin); qualquer usuário logado pode ver a
escalação já salva.
"""

from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import exige_editor, usuario_atual
from database import supabase
from escalacao import (
    DURACAO_PADRAO,
    SUBSTITUICOES_PADRAO,
    TROCAS_POR_VEZ_PADRAO,
    EscalacaoInviavel,
    gerar_escalacao,
)
from models import lesao_ativa, punicao_ativa

router = APIRouter(prefix="/partidas", tags=["Escalação"])

TABLE = "escalacoes"

FuncaoLinha = Literal["ZAG", "LAT", "VOL", "MEI", "ATA"]


class RegraJogador(BaseModel):
    """Regras opcionais de um jogador na escalação."""

    minutos_max: Optional[int] = Field(default=None, ge=1, le=120)  # "só X minutos"
    so_segundo_tempo: bool = False  # "entra só no 2º tempo"
    comeca: Optional[Literal["titular", "reserva"]] = None
    nao_sai: bool = False  # "não sai" depois que entra
    grupo_fixo: bool = False  # grupo que não roda: começa e fica o jogo todo
    funcao: Optional[FuncaoLinha] = None


class Restricao(BaseModel):
    """Ajuste feito na prévia: 'X começa dentro/fora', 'Y joga na função Z'."""

    jogador_id: UUID
    tipo: Literal["comeca_dentro", "comeca_fora", "funcao"]
    funcao: Optional[FuncaoLinha] = None


class GerarPayload(BaseModel):
    goleiro_id: UUID
    # Ajustes manuais sobre a lista padrão (confirmados sem punição/lesão).
    incluir: list[UUID] = []
    remover: list[UUID] = []
    duracao: int = Field(default=DURACAO_PADRAO, ge=10, le=120)
    n_substituicoes: int = Field(default=SUBSTITUICOES_PADRAO, ge=0, le=20)
    trocas_por_vez: int = Field(default=TROCAS_POR_VEZ_PADRAO, ge=1, le=10)
    regras: dict[UUID, RegraJogador] = {}
    restricoes: list[Restricao] = []
    # Muda a semente para pedir "outra opção" igualmente válida.
    semente: int = 0


class SalvarPayload(BaseModel):
    config: dict
    resultado: dict


# ---------------------------------------------------------------------------
# Convocados
# ---------------------------------------------------------------------------
def _partida_ou_404(partida_id: UUID) -> dict:
    resposta = supabase.table("partidas").select("*").eq("id", str(partida_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")
    return resposta.data[0]


def _motivo_bloqueio(jogador_id: str, partida: dict, punicoes: list, lesoes: list) -> str | None:
    """Mesmas regras de routers/presenca.py, mas com dados já carregados."""
    if any(p["jogador_id"] == jogador_id and punicao_ativa(p) for p in punicoes):
        return "punição ativa"
    for lesao in (l for l in lesoes if l["jogador_id"] == jogador_id):
        if lesao["tipo"] == "proximo_jogo":
            if lesao.get("partida_id") == str(partida["id"]) and lesao_ativa(
                lesao, partida.get("status")
            ):
                return "lesão"
        elif lesao_ativa(lesao) and (lesao.get("termina_em") or "") >= partida.get("data", ""):
            return "lesão"
    return None


def _resumo(jogador: dict, presenca: dict | None = None) -> dict:
    posicoes = list(jogador.get("posicoes") or [])
    # A posição que a pessoa escolheu ao confirmar presença vem primeiro.
    escolhida = (presenca or {}).get("posicao")
    if escolhida:
        posicoes = [escolhida] + [p for p in posicoes if p != escolhida]
    return {
        "id": jogador["id"],
        "nome": jogador.get("apelido") or jogador["nome"],
        "nome_completo": jogador["nome"],
        "numero_camisa": jogador.get("numero_camisa"),
        "posicoes": posicoes,
    }


def _carregar_convocados(partida: dict) -> dict:
    jogadores = supabase.table("jogadores").select("*").order("nome").execute().data or []
    por_id = {j["id"]: j for j in jogadores}
    presencas = (
        supabase.table("presenca").select("*").eq("partida_id", str(partida["id"])).execute().data
        or []
    )
    punicoes = supabase.table("punicoes").select("*").execute().data or []
    lesoes = supabase.table("lesoes").select("*").execute().data or []

    convocados, bloqueados = [], []
    ids_confirmados = set()
    for p in presencas:
        j = por_id.get(p["jogador_id"])
        if p["status"] != "confirmado" or not j:
            continue
        ids_confirmados.add(j["id"])
        motivo = _motivo_bloqueio(j["id"], partida, punicoes, lesoes)
        if not j.get("ativo", True):
            motivo = "jogador inativo"
        if motivo:
            bloqueados.append({**_resumo(j, p), "motivo": motivo})
        else:
            convocados.append(_resumo(j, p))

    outros = [
        _resumo(j) for j in jogadores if j.get("ativo", True) and j["id"] not in ids_confirmados
    ]
    return {"convocados": convocados, "bloqueados": bloqueados, "outros_ativos": outros}


@router.get("/{partida_id}/escalacao/convocados")
def listar_convocados(partida_id: UUID, usuario: dict = Depends(exige_editor)):
    """Ponto de partida do passo 'convocados': presença confirmada, já filtrada."""
    return _carregar_convocados(_partida_ou_404(partida_id))


# ---------------------------------------------------------------------------
# Gerar (prévia, não salva)
# ---------------------------------------------------------------------------
@router.post("/{partida_id}/escalacao/gerar")
def gerar(partida_id: UUID, payload: GerarPayload, usuario: dict = Depends(exige_editor)):
    partida = _partida_ou_404(partida_id)
    dados = _carregar_convocados(partida)

    todos = {j["id"]: j for j in dados["convocados"] + dados["bloqueados"] + dados["outros_ativos"]}
    ids = [j["id"] for j in dados["convocados"]]
    for jid in map(str, payload.incluir):
        if jid not in todos:
            raise HTTPException(status_code=404, detail="Jogador a incluir não encontrado (ou inativo)")
        if jid not in ids:
            ids.append(jid)
    remover = {str(j) for j in payload.remover}
    ids = [i for i in ids if i not in remover]

    goleiro_id = str(payload.goleiro_id)
    if goleiro_id not in ids:
        raise HTTPException(status_code=422, detail="O goleiro escolhido não está entre os convocados")

    convocados = [todos[i] for i in ids]
    try:
        resultado = gerar_escalacao(
            convocados,
            goleiro_id,
            duracao=payload.duracao,
            n_substituicoes=payload.n_substituicoes,
            trocas_por_vez=payload.trocas_por_vez,
            regras={str(k): v.model_dump(exclude_none=True) for k, v in payload.regras.items()},
            restricoes=[r.model_dump(mode="json", exclude_none=True) for r in payload.restricoes],
            semente=payload.semente,
        )
    except EscalacaoInviavel as erro:
        raise HTTPException(status_code=422, detail=str(erro))

    return {
        "partida_id": str(partida_id),
        "convocados": convocados,
        "config": payload.model_dump(mode="json"),
        "resultado": resultado,
    }


# ---------------------------------------------------------------------------
# Salvar / ler
# ---------------------------------------------------------------------------
def _salva_ou_none(partida_id: UUID) -> dict | None:
    achadas = supabase.table(TABLE).select("*").eq("partida_id", str(partida_id)).execute().data
    return achadas[0] if achadas else None


def _checar_resultado(corpo: SalvarPayload) -> None:
    resultado = corpo.resultado
    if not isinstance(resultado.get("titulares"), list) or not isinstance(
        resultado.get("janelas"), list
    ):
        raise HTTPException(status_code=422, detail="Resultado de escalação inválido")


@router.post("/{partida_id}/escalacao", status_code=201)
def salvar(partida_id: UUID, corpo: SalvarPayload, usuario: dict = Depends(exige_editor)):
    _partida_ou_404(partida_id)
    _checar_resultado(corpo)
    if _salva_ou_none(partida_id):
        raise HTTPException(
            status_code=409, detail="Esta partida já tem escalação salva; use PUT para atualizar"
        )
    linha = {
        "partida_id": str(partida_id),
        "formacao": corpo.resultado.get("formacao", "4-4-2"),
        "config": corpo.config,
        "resultado": corpo.resultado,
        "criado_por": usuario["id"],
    }
    return supabase.table(TABLE).insert(linha).execute().data[0]


@router.put("/{partida_id}/escalacao")
def atualizar(partida_id: UUID, corpo: SalvarPayload, usuario: dict = Depends(exige_editor)):
    _partida_ou_404(partida_id)
    _checar_resultado(corpo)
    existente = _salva_ou_none(partida_id)
    if not existente:
        raise HTTPException(status_code=404, detail="Esta partida ainda não tem escalação salva")
    mudancas = {
        "formacao": corpo.resultado.get("formacao", "4-4-2"),
        "config": corpo.config,
        "resultado": corpo.resultado,
    }
    return supabase.table(TABLE).update(mudancas).eq("id", existente["id"]).execute().data[0]


@router.get("/{partida_id}/escalacao")
def obter(partida_id: UUID, usuario: dict = Depends(usuario_atual)):
    salva = _salva_ou_none(partida_id)
    if not salva:
        raise HTTPException(status_code=404, detail="Esta partida ainda não tem escalação salva")
    return salva
