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
from models import EMAIL_REGEX

router = APIRouter(prefix="/auth", tags=["Autenticação"])

# Mínimo aceito pelo Supabase Auth.
MIN_SENHA = 6


class LoginPayload(BaseModel):
    email: str
    password: str


class CadastroPayload(BaseModel):
    email: str = Field(pattern=EMAIL_REGEX)
    password: str = Field(min_length=MIN_SENHA)


class RefreshPayload(BaseModel):
    refresh_token: str


def _formatar_sessao(resultado: dict) -> dict:
    papel = papel_do_usuario(resultado["user"]["id"])
    return {
        "access_token": resultado["access_token"],
        "refresh_token": resultado["refresh_token"],
        "expires_in": resultado["expires_in"],
        "usuario": {
            "id": resultado["user"]["id"],
            "email": resultado["user"]["email"],
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
    Cria a conta de um jogador que já está no elenco.

    O cadastro é fechado de propósito: o app é do time, então só quem já foi
    cadastrado como jogador (com este email) consegue criar login. Isso
    também é o que amarra a conta ao jogador.
    """
    email = payload.email.strip().lower()

    jogadores = supabase.table("jogadores").select("id,nome,email,perfil_id").execute().data or []
    jogador = next(
        (j for j in jogadores if (j.get("email") or "").strip().lower() == email),
        None,
    )

    if not jogador:
        raise HTTPException(
            status_code=403,
            detail=(
                "Este email não está no elenco. Peça para o responsável cadastrar "
                "você como jogador antes de criar a conta."
            ),
        )

    if jogador.get("perfil_id"):
        raise HTTPException(
            status_code=409,
            detail="Este jogador já tem uma conta. Use a tela de login.",
        )

    resultado = criar_conta(email, payload.password)

    usuario = resultado.get("user") or resultado
    user_id = usuario.get("id")
    if user_id:
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