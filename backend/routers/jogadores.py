from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from auth import exige_editor, usuario_atual
from database import supabase
from models import Jogador, JogadorCreate, JogadorUpdate, numero_camisa_disponivel

# Toda rota daqui exige login; escrita exige papel de editor.
router = APIRouter(
    prefix="/jogadores",
    tags=["Jogadores"],
    dependencies=[Depends(usuario_atual)],
)

TABLE = "jogadores"


def _checar_numero_camisa(numero_camisa: int | None, jogador_id: str | None = None) -> None:
    """Levanta 409 se `numero_camisa` já estiver em uso por outro jogador ativo."""
    if numero_camisa is None:
        return
    jogadores = supabase.table(TABLE).select("id,numero_camisa,ativo").execute().data or []
    if not numero_camisa_disponivel(jogadores, numero_camisa, jogador_id):
        raise HTTPException(
            status_code=409,
            detail=f"O número {numero_camisa} já está sendo usado por outro jogador ativo",
        )


@router.get("/", response_model=list[Jogador])
def listar_jogadores(apenas_ativos: bool = False):
    query = supabase.table(TABLE).select("*").order("nome")
    if apenas_ativos:
        query = query.eq("ativo", True)
    resposta = query.execute()
    return resposta.data


@router.get("/meu", response_model=Jogador)
def meu_jogador(usuario: dict = Depends(usuario_atual)):
    """Jogador vinculado à conta logada (via `perfil_id`), se houver."""
    resposta = supabase.table(TABLE).select("*").eq("perfil_id", usuario["id"]).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Você ainda não tem um jogador cadastrado")
    return resposta.data[0]


@router.post("/meu", response_model=Jogador, status_code=201)
def criar_meu_jogador(jogador: JogadorCreate, usuario: dict = Depends(usuario_atual)):
    """
    Autoatendimento: qualquer conta logada cria o próprio jogador, sem depender
    de um editor. Email e vínculo vêm sempre da conta (nunca do corpo da
    requisição), e o jogador nasce ativo.
    """
    existente = supabase.table(TABLE).select("id").eq("perfil_id", usuario["id"]).execute()
    if existente.data:
        raise HTTPException(status_code=409, detail="Você já tem um jogador cadastrado")

    _checar_numero_camisa(jogador.numero_camisa)

    payload = jogador.model_dump(mode="json")
    payload["email"] = usuario["email"]
    payload["ativo"] = True
    payload["perfil_id"] = usuario["id"]
    resposta = supabase.table(TABLE).insert(payload).execute()
    return resposta.data[0]


@router.get("/{jogador_id}", response_model=Jogador)
def obter_jogador(jogador_id: UUID):
    resposta = supabase.table(TABLE).select("*").eq("id", str(jogador_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")
    return resposta.data[0]


@router.post("/", response_model=Jogador, status_code=201)
def criar_jogador(jogador: JogadorCreate, usuario: dict = Depends(exige_editor)):
    _checar_numero_camisa(jogador.numero_camisa)
    payload = jogador.model_dump(mode="json")
    resposta = supabase.table(TABLE).insert(payload).execute()
    return resposta.data[0]


@router.patch("/{jogador_id}", response_model=Jogador)
def atualizar_jogador(
    jogador_id: UUID, jogador: JogadorUpdate, usuario: dict = Depends(usuario_atual)
):
    """
    Editor edita qualquer jogador. Quem não é editor só edita o próprio
    cadastro (jogador com `perfil_id` igual ao da conta logada) — e nem
    assim pode mexer em `ativo`, que é decisão de gestão do elenco.
    """
    if usuario["papel"] != "editor":
        atual = supabase.table(TABLE).select("perfil_id").eq("id", str(jogador_id)).execute()
        if not atual.data or atual.data[0].get("perfil_id") != usuario["id"]:
            raise HTTPException(
                status_code=403,
                detail="Você só pode editar o seu próprio cadastro de jogador",
            )

    payload = {k: v for k, v in jogador.model_dump(mode="json").items() if v is not None}
    if usuario["papel"] != "editor":
        payload.pop("ativo", None)

    if payload.get("ativo") is False:
        # Desativar libera o número na hora — sem isso ele ficaria reservado
        # pra sempre por alguém que nem está mais jogando.
        payload["numero_camisa"] = None
    elif "numero_camisa" in payload:
        _checar_numero_camisa(payload["numero_camisa"], jogador_id=str(jogador_id))

    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    resposta = supabase.table(TABLE).update(payload).eq("id", str(jogador_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")
    return resposta.data[0]


@router.delete("/{jogador_id}", status_code=204)
def remover_jogador(jogador_id: UUID, usuario: dict = Depends(exige_editor)):
    resposta = supabase.table(TABLE).delete().eq("id", str(jogador_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")