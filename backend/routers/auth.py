from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import (
    criar_conta,
    login as autenticar,
    papel_do_usuario,
    refresh as renovar,
    usuario_atual,
)
from database import supabase
from models import EMAIL_REGEX, TELEFONE_REGEX

router = APIRouter(prefix="/auth", tags=["Autenticação"])

# Mínimo aceito pelo Supabase Auth.
MIN_SENHA = 6


class LoginPayload(BaseModel):
    email: str
    password: str


class CadastroPayload(BaseModel):
    nome: str = Field(min_length=1, max_length=100)
    telefone: str = Field(pattern=TELEFONE_REGEX)
    email: str = Field(pattern=EMAIL_REGEX)
    password: str = Field(min_length=MIN_SENHA)


class RefreshPayload(BaseModel):
    refresh_token: str


def _formatar_sessao(resultado: dict) -> dict:
    papel = papel_do_usuario(resultado["user"]["id"])
    metadata = resultado["user"].get("user_metadata") or {}
    return {
        "access_token": resultado["access_token"],
        "refresh_token": resultado["refresh_token"],
        "expires_in": resultado["expires_in"],
        "usuario": {
            "id": resultado["user"]["id"],
            "email": resultado["user"]["email"],
            # Nome/telefone digitados no cadastro (ver `criar_conta`). Servem
            # só pra pré-preencher a tela de criação do jogador — o dado que
            # vale de verdade é o que ficar salvo no cadastro de jogador.
            "nome": metadata.get("nome"),
            "telefone": metadata.get("telefone"),
            "papel": papel,
        },
    }


@router.post("/login")
def login(payload: LoginPayload):
    resultado = autenticar(payload.email, payload.password)
    return _formatar_sessao(resultado)


@router.post("/cadastro", status_code=201)
def cadastro(payload: CadastroPayload):
    """
    Cria a conta do usuário.

    Cadastro aberto: qualquer pessoa pode criar login (não depende mais de um
    editor ter pré-cadastrado o jogador). Se o email ou telefone informado
    bater com um jogador do elenco que ainda não tem conta vinculada, a conta
    é amarrada a ele na hora — o front leva pra uma tela de revisão pra
    pessoa conferir os dados antes de seguir, em vez de linkar em silêncio.
    Sem match, a pessoa cai numa tela em branco pra criar o próprio jogador.
    """
    email = payload.email.strip().lower()
    telefone = payload.telefone.strip()

    jogadores = supabase.table("jogadores").select("id,email,telefone,perfil_id").execute().data or []
    jogador = next(
        (
            j
            for j in jogadores
            if not j.get("perfil_id")
            and (
                (j.get("email") or "").strip().lower() == email
                or (j.get("telefone") or "").strip() == telefone
            )
        ),
        None,
    )

    resultado = criar_conta(email, payload.password, payload.nome.strip(), telefone)

    usuario = resultado.get("user") or resultado
    user_id = usuario.get("id")
    if user_id and jogador:
        supabase.table("jogadores").update({"perfil_id": user_id}).eq("id", jogador["id"]).execute()

    # Projeto com confirmação de email ativada não devolve sessão na hora.
    if resultado.get("access_token"):
        return {"sessao": _formatar_sessao(resultado), "precisa_confirmar_email": False}

    return {"sessao": None, "precisa_confirmar_email": True}


@router.post("/refresh")
def refresh_token(payload: RefreshPayload):
    resultado = renovar(payload.refresh_token)
    return _formatar_sessao(resultado)


@router.get("/me")
def me(usuario: dict = Depends(usuario_atual)):
    return usuario