from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import login as autenticar, papel_do_usuario, refresh as renovar, usuario_atual

router = APIRouter(prefix="/auth", tags=["Autenticação"])


class LoginPayload(BaseModel):
    email: str
    password: str


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


@router.post("/refresh")
def refresh_token(payload: RefreshPayload):
    resultado = renovar(payload.refresh_token)
    return _formatar_sessao(resultado)


@router.get("/me")
def me(usuario: dict = Depends(usuario_atual)):
    return usuario