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
from escalacao import FORMACOES
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
    caracteristicas: list[str] = []


class AdversarioPayload(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    ataque: Optional[int] = Field(default=None, ge=1, le=10)
    meio: Optional[int] = Field(default=None, ge=1, le=10)
    defesa: Optional[int] = Field(default=None, ge=1, le=10)
    estilo: Optional[Literal["equilibrado", "retranca", "ataque", "posse", "contra_ataque"]] = None
    observacoes: Optional[str] = Field(default=None, max_length=1000)


class TaticaPayload(BaseModel):
    """Quadro tático montado pelo administrador (orientação do time; não mexe na escalação)."""

    nome: str = Field(min_length=1, max_length=60)
    descricao: Optional[str] = Field(default=None, max_length=300)
    plano: dict = {}


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
        "caracteristicas": [{"id": k, "nome": v} for k, v in tatica.CARACTERISTICAS.items()],
        "modos_atributo": [{"id": k, "nome": v} for k, v in tatica.MODOS_ATRIBUTO.items()],
        "modos_caracteristica": [
            {"id": k, "nome": v} for k, v in tatica.MODOS_CARACTERISTICA.items()
        ],
        "formacoes": [{"id": k, "contagem": v} for k, v in FORMACOES.items()],
        # Como o sistema calcula a "qualidade" de cada jogador (para você ver e entender).
        "pesos_funcao": tatica.PESOS_FUNCAO,
        "bonus_caracteristica": tatica.BONUS_CARACTERISTICA,
        "taticas": [
            {"id": k, "nome": v["nome"], "descricao": v["descricao"], "attr": v["attr"], "funcao": v["funcao"]}
            for k, v in tatica.TATICAS.items()
        ],
        "estrategias": [{"id": k, **v} for k, v in tatica.ESTRATEGIAS.items()],
        # Quadro tático (estilo FIFA): papéis por posição e modelos prontos.
        "papeis": tatica.PAPEIS,
        "saidas_de_bola": [{"id": k, "nome": v} for k, v in tatica.SAIDAS_DE_BOLA.items()],
        "modelos": [{"id": k, **v} for k, v in tatica.MODELOS_PLANO.items()],
        "situacoes_ensaiadas": [{"id": k, "nome": v} for k, v in tatica.SITUACOES_ENSAIADAS.items()],
        "estilos": [{"id": k, "nome": v} for k, v in tatica.ESTILOS_ADVERSARIO.items()],
    }


# ---------------------------------------------------------------------------
# Atributos dos jogadores
# ---------------------------------------------------------------------------
@router.get("/escalacao/sugestao-formacao")
def sugestao_formacao(
    tatica_id: str = "equilibrada", duracao: int = 90, usuario: dict = Depends(exige_editor)
):
    """Formação (e mudança durante o jogo) que o sistema sugere para uma tática."""
    resolvida = resolver_tatica(tatica_id)
    if not resolvida:
        raise HTTPException(status_code=422, detail="Tática desconhecida")
    return tatica.sugerir_formacoes(resolvida["estilo"], duracao)


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
                "caracteristicas": a.get("caracteristicas") or [],
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
    desconhecidas = [c for c in corpo.caracteristicas if c not in tatica.CARACTERISTICAS]
    if desconhecidas:
        raise HTTPException(status_code=422, detail=f"Característica desconhecida: {desconhecidas[0]}")
    dados = {k: getattr(corpo, k) for k in [*tatica.ATRIBUTOS, "nota", "caracteristicas"]}
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


# ---------------------------------------------------------------------------
# Táticas montadas pelo administrador
# ---------------------------------------------------------------------------
def resolver_tatica(tatica_id: Optional[str]) -> Optional[dict]:
    """
    Aceita o id de um modelo antigo ("ofensiva"...) ou de uma tática salva. Devolve
    {id, nome, descricao, config, estilo} ou None se não existir. O quadro tático
    salvo é só orientação: não muda a nota dos jogadores (config neutra).
    """
    if not tatica_id:
        return None
    if tatica_id in tatica.TATICAS:
        modelo = tatica.TATICAS[tatica_id]
        return {
            "id": tatica_id,
            "nome": modelo["nome"],
            "descricao": modelo["descricao"],
            "config": tatica_id,
            "estilo": tatica_id,
        }
    achadas = supabase.table("taticas").select("*").eq("id", tatica_id).execute().data
    if not achadas:
        return None
    t = achadas[0]
    return {
        "id": t["id"],
        "nome": t["nome"],
        "descricao": t.get("descricao") or "",
        "config": tatica.config_da_tatica({}),
        "estilo": "equilibrada",
    }


def _dados_da_tatica(corpo: TaticaPayload) -> dict:
    try:
        plano = tatica.validar_plano(corpo.plano)
    except ValueError as erro:
        raise HTTPException(status_code=422, detail=str(erro))
    return {
        "nome": corpo.nome.strip(),
        "descricao": (corpo.descricao or "").strip() or None,
        "plano": plano,
    }


@router.get("/taticas")
def listar_taticas(usuario: dict = Depends(exige_editor)):
    return supabase.table("taticas").select("*").order("nome").execute().data or []


@router.post("/taticas", status_code=201)
def criar_tatica(corpo: TaticaPayload, usuario: dict = Depends(exige_editor)):
    return supabase.table("taticas").insert(_dados_da_tatica(corpo)).execute().data[0]


@router.put("/taticas/{tatica_id}")
def editar_tatica(tatica_id: UUID, corpo: TaticaPayload, usuario: dict = Depends(exige_editor)):
    tid = str(tatica_id)
    if not supabase.table("taticas").select("id").eq("id", tid).execute().data:
        raise HTTPException(status_code=404, detail="Tática não encontrada")
    return supabase.table("taticas").update(_dados_da_tatica(corpo)).eq("id", tid).execute().data[0]


@router.delete("/taticas/{tatica_id}", status_code=204)
def apagar_tatica(tatica_id: UUID, usuario: dict = Depends(exige_editor)):
    supabase.table("taticas").delete().eq("id", str(tatica_id)).execute()


# ---------------------------------------------------------------------------
# Jogadas ensaiadas (escanteio, falta, saída de bola...): só o administrador.
# ---------------------------------------------------------------------------
class JogadaPayload(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    descricao: Optional[str] = Field(default=None, max_length=300)
    situacao: str
    plano: dict = {}


def _dados_da_jogada(corpo: JogadaPayload) -> dict:
    try:
        plano = tatica.validar_jogada(corpo.plano, corpo.situacao)
    except ValueError as erro:
        raise HTTPException(status_code=422, detail=str(erro))
    return {
        "nome": corpo.nome.strip(),
        "descricao": (corpo.descricao or "").strip() or None,
        "situacao": corpo.situacao,
        "plano": plano,
    }


@router.get("/jogadas-ensaiadas")
def listar_jogadas(usuario: dict = Depends(exige_editor)):
    return supabase.table("jogadas_ensaiadas").select("*").order("nome").execute().data or []


@router.post("/jogadas-ensaiadas", status_code=201)
def criar_jogada(corpo: JogadaPayload, usuario: dict = Depends(exige_editor)):
    return supabase.table("jogadas_ensaiadas").insert(_dados_da_jogada(corpo)).execute().data[0]


@router.put("/jogadas-ensaiadas/{jogada_id}")
def editar_jogada(jogada_id: UUID, corpo: JogadaPayload, usuario: dict = Depends(exige_editor)):
    jid = str(jogada_id)
    if not supabase.table("jogadas_ensaiadas").select("id").eq("id", jid).execute().data:
        raise HTTPException(status_code=404, detail="Jogada não encontrada")
    return (
        supabase.table("jogadas_ensaiadas").update(_dados_da_jogada(corpo)).eq("id", jid).execute().data[0]
    )


@router.delete("/jogadas-ensaiadas/{jogada_id}", status_code=204)
def apagar_jogada(jogada_id: UUID, usuario: dict = Depends(exige_editor)):
    supabase.table("jogadas_ensaiadas").delete().eq("id", str(jogada_id)).execute()
