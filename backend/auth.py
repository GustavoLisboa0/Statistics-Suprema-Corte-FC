import os

import httpx
from fastapi import Depends, Header, HTTPException

from database import supabase

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


def _auth_headers(access_token: str | None = None) -> dict:
    headers = {"apikey": SUPABASE_KEY}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def login(email: str, password: str) -> dict:
    """Autentica no Supabase Auth com email/senha."""
    resposta = httpx.post(
        f"{SUPABASE_URL}/auth/v1/token",
        params={"grant_type": "password"},
        headers=_auth_headers(),
        json={"email": email, "password": password},
        timeout=10,
    )
    if resposta.status_code != 200:
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")
    return resposta.json()


def refresh(refresh_token: str) -> dict:
    """Troca um refresh_token por um novo access_token."""
    resposta = httpx.post(
        f"{SUPABASE_URL}/auth/v1/token",
        params={"grant_type": "refresh_token"},
        headers=_auth_headers(),
        json={"refresh_token": refresh_token},
        timeout=10,
    )
    if resposta.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessão expirada, faça login novamente")
    return resposta.json()


def _validar_token(access_token: str) -> dict:
    """Pergunta pro próprio Supabase Auth se o token ainda é válido."""
    resposta = httpx.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers=_auth_headers(access_token),
        timeout=10,
    )
    if resposta.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada")
    return resposta.json()


def papel_do_usuario(user_id: str) -> str:
    resposta = supabase.table("perfis").select("papel").eq("id", user_id).execute()
    if not resposta.data:
        return "visualizador"
    return resposta.data[0]["papel"]


async def usuario_atual(authorization: str | None = Header(default=None)) -> dict:
    """Dependency: exige um Bearer token válido em qualquer requisição."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Faça login para continuar")

    token = authorization.split(" ", 1)[1]
    usuario = _validar_token(token)
    papel = papel_do_usuario(usuario["id"])
    return {"id": usuario["id"], "email": usuario.get("email"), "papel": papel}


async def exige_editor(usuario: dict = Depends(usuario_atual)) -> dict:
    """Dependency: exige, além de login, que o papel seja 'editor'."""
    if usuario["papel"] != "editor":
        raise HTTPException(status_code=403, detail="Sua conta só tem permissão de visualização")
    return usuario