"""
Escalador V2 — rotas INTERNAS do admin: atributos, nota do time, adversários.

Todas exigem papel 'editor'. Usuário comum não vê nada disto.
"""

from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import tatica
from auth import exige_editor
from database import supabase

router = APIRouter(tags=["Escalação (interno)"])


class AtributosPayload(BaseModel):
    pace: Optional[int] = Field(default=None, ge=1, le=100)
    fisico: Optional[int] = Field(default=None, ge=1, le=100)
    defesa: Optional[int] = Field(default=None, ge=1, le=100)
    finalizacao: Optional[int] = Field(default=None, ge=1, le=100)
    passe: Optional[int] = Field(default=None, ge=1, le=100)
    visao: Optional[int] = Field(default=None, ge=1, le=100)
    nota: Optional[str] = Field(default=None, max_length=1000)


class AdversarioPayload(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    ataque: Optional[int] = Field(default=None, ge=1, le=10)
    meio: Optional[int] = Field(default=None, ge=1, le=10)
    defesa: Optional[int] = Field(default=None, ge=1, le=10)
    estilo: Optional[Literal["equilibrado", "retranca", "ataque", "posse", "contra_ataque"]] = None
    observacoes: Optional[str] = Field(default=None, max_length=1000)


class NotaPayload(BaseModel):
    texto: str = Field(default="", max_length=4000)


def carregar_atributos() -> dict[str, dict]:
    """{jogador_id: {pace:.., ...}} — uso interno (nunca devolver a quem não é editor)."""
    linhas = supabase.table("atributos_jogador").select("*").execute().data or []
    return {l["jogador_id"]: l for l in linhas}


# ---------------------------------------------------------------------------
# Catálogo (nomes de táticas etc., para montar as telas)
# ---------------------------------------------------------------------------
@router.get("/escalacao/catalogo")
def catalogo(usuario: dict = Depends(exige_editor)):
    return {
        "atributos": [{"id": a, "nome": tatica.ATRIBUTO_NOMES[a]} for a in tatica.ATRIBUTOS],
        "taticas": [
            {"id": k, "nome": v["nome"], "descricao": v["descricao"]}
            for k, v in tatica.TATICAS.items()
        ],
        "estrategias": [{"id": k, **v} for k, v in tatica.ESTRATEGIAS.items()],
        "estilos": [{"id": k, "nome": v} for k, v in tatica.ESTILOS_ADVERSARIO.items()],
    }


# ---------------------------------------------------------------------------
# Atributos dos jogadores
# ---------------------------------------------------------------------------
@router.get("/atributos")
def listar_atributos(usuario: dict = Depends(exige_editor)):
    """Todos os jogadores ativos com seus atributos (campos vazios = não preenchido)."""
    jogadores = supabase.table("jogadores").select("*").order("nome").execute().data or []
    atributos = carregar_atributos()
    saida = []
    for j in jogadores:
        if not j.get("ativo", True):
            continue
        a = atributos.get(j["id"], {})
        saida.append(
            {
                "jogador_id": j["id"],
                "nome": j.get("apelido") or j["nome"],
                "posicoes": j.get("posicoes") or [],
                "numero_camisa": j.get("numero_camisa"),
                **{k: a.get(k) for k in tatica.ATRIBUTOS},
                "nota": a.get("nota"),
            }
        )
    return saida


@router.put("/atributos/{jogador_id}")
def salvar_atributos(
    jogador_id: UUID, corpo: AtributosPayload, usuario: dict = Depends(exige_editor)
):
    jid = str(jogador_id)
    if not supabase.table("jogadores").select("id").eq("id", jid).execute().data:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")
    dados = {k: getattr(corpo, k) for k in [*tatica.ATRIBUTOS, "nota"]}
    tabela = supabase.table("atributos_jogador")
    if tabela.select("*").eq("jogador_id", jid).execute().data:
        return (
            supabase.table("atributos_jogador").update(dados).eq("jogador_id", jid).execute().data[0]
        )
    return supabase.table("atributos_jogador").insert({"jogador_id": jid, **dados}).execute().data[0]


# ---------------------------------------------------------------------------
# Nota interna da escalação de uma partida (fora do PDF)
# ---------------------------------------------------------------------------
@router.get("/partidas/{partida_id}/escalacao/nota")
def ler_nota(partida_id: UUID, usuario: dict = Depends(exige_editor)):
    achada = (
        supabase.table("escalacao_notas").select("*").eq("partida_id", str(partida_id)).execute().data
    )
    return {"texto": achada[0]["texto"] if achada else ""}


@router.put("/partidas/{partida_id}/escalacao/nota")
def salvar_nota(partida_id: UUID, corpo: NotaPayload, usuario: dict = Depends(exige_editor)):
    pid = str(partida_id)
    if not supabase.table("partidas").select("id").eq("id", pid).execute().data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")
    if supabase.table("escalacao_notas").select("*").eq("partida_id", pid).execute().data:
        supabase.table("escalacao_notas").update({"texto": corpo.texto}).eq(
            "partida_id", pid
        ).execute()
    else:
        supabase.table("escalacao_notas").insert({"partida_id": pid, "texto": corpo.texto}).execute()
    return {"texto": corpo.texto}


# ---------------------------------------------------------------------------
# Adversários
# ---------------------------------------------------------------------------
def achar_adversario(nome: str) -> Optional[dict]:
    alvo = (nome or "").strip().lower()
    todos = supabase.table("adversarios").select("*").execute().data or []
    return next((a for a in todos if a["nome"].strip().lower() == alvo), None)


@router.get("/adversarios")
def listar_adversarios(usuario: dict = Depends(exige_editor)):
    return supabase.table("adversarios").select("*").order("nome").execute().data or []


@router.put("/adversarios")
def salvar_adversario(corpo: AdversarioPayload, usuario: dict = Depends(exige_editor)):
    """Cria o perfil do adversário ou, se o nome já existir, atualiza."""
    dados = corpo.model_dump()
    dados["nome"] = dados["nome"].strip()
    existente = achar_adversario(dados["nome"])
    if existente:
        return (
            supabase.table("adversarios").update(dados).eq("id", existente["id"]).execute().data[0]
        )
    return supabase.table("adversarios").insert(dados).execute().data[0]


@router.delete("/adversarios/{adversario_id}", status_code=204)
def apagar_adversario(adversario_id: UUID, usuario: dict = Depends(exige_editor)):
    supabase.table("adversarios").delete().eq("id", str(adversario_id)).execute()
