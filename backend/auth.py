import asyncio
import os
import time

import httpx
from fastapi import Depends, Header, HTTPException

from database import LOCAL_DB, supabase

if LOCAL_DB:
    import local_auth

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


def _auth_headers(access_token: str | None = None) -> dict:
    headers = {"apikey": SUPABASE_KEY}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def login(email: str, password: str) -> dict:
    """Autentica no Supabase Auth com email/senha."""
    if LOCAL_DB:
        return local_auth.login(email, password)
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


def criar_conta(
    email: str, password: str, nome: str | None = None, telefone: str | None = None
) -> dict:
    """
    Cria a conta no Supabase Auth.

    `nome`/`telefone` vão como `user_metadata` — não existe jogador ainda pra
    guardar esses dados, mas assim eles sobrevivem até a tela de criação do
    próprio jogador (`/meu-jogador`), inclusive no caso de o projeto exigir
    confirmação de email (a pessoa fecha a aba, confirma, loga depois — o
    metadata volta junto no login, do mesmo jeito que o email já volta).

    Devolve o corpo do Supabase como veio: dependendo de o projeto exigir
    confirmação de email, pode ou não vir uma sessão junto.
    """
    if LOCAL_DB:
        return local_auth.criar_conta(email, password, nome, telefone)

    corpo: dict = {"email": email, "password": password}
    metadata = {k: v for k, v in {"nome": nome, "telefone": telefone}.items() if v}
    if metadata:
        corpo["data"] = metadata

    resposta = httpx.post(
        f"{SUPABASE_URL}/auth/v1/signup",
        headers=_auth_headers(),
        json=corpo,
        timeout=10,
    )
    if resposta.status_code not in (200, 201):
        detalhe = "Não foi possível criar a conta"
        try:
            corpo = resposta.json()
            detalhe = corpo.get("msg") or corpo.get("error_description") or detalhe
        except Exception:  # noqa: BLE001 - resposta sem JSON
            pass
        raise HTTPException(status_code=400, detail=detalhe)
    return resposta.json()


def refresh(refresh_token: str) -> dict:
    """Troca um refresh_token por um novo access_token."""
    if LOCAL_DB:
        return local_auth.refresh(refresh_token)
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
    if LOCAL_DB:
        return local_auth.validar_token(access_token)
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


# Cache curto de "token -> usuário". Cada tela dispara várias requisições
# seguidas (jogadores, partidas, estatísticas...) e CADA uma validava o token
# no Supabase Auth e consultava o papel: 2 viagens de rede (~0,3-1s no plano
# gratuito) antes de qualquer trabalho. Com o cache, só a primeira de cada
# minuto paga isso.
#
# Contrapartida assumida: um token revogado, ou um papel trocado pelo admin
# (editor <-> visualizador), só vale na API depois de até `_CACHE_TTL_S`
# segundos. Tokens inválidos/expirados NUNCA entram no cache (a falha levanta
# antes), então um 401 continua imediato para quem não está logado.
_CACHE_TTL_S = 60
_CACHE_MAX = 500
_cache_usuarios: dict[str, tuple[float, dict]] = {}


def _usuario_em_cache(token: str) -> dict | None:
    item = _cache_usuarios.get(token)
    if item is None:
        return None
    expira_em, usuario = item
    if expira_em < time.monotonic():
        _cache_usuarios.pop(token, None)
        return None
    return usuario


def _guardar_usuario(token: str, usuario: dict) -> None:
    if len(_cache_usuarios) >= _CACHE_MAX:
        agora = time.monotonic()
        for chave in [k for k, (exp, _) in _cache_usuarios.items() if exp < agora]:
            _cache_usuarios.pop(chave, None)
        if len(_cache_usuarios) >= _CACHE_MAX:  # tudo ainda válido: descarta o mais antigo
            _cache_usuarios.pop(next(iter(_cache_usuarios)), None)
    _cache_usuarios[token] = (time.monotonic() + _CACHE_TTL_S, usuario)


def limpar_cache_usuarios() -> None:
    """Esvazia o cache (usado em testes e no logout, se houver)."""
    _cache_usuarios.clear()


async def usuario_atual(authorization: str | None = Header(default=None)) -> dict:
    """Dependency: exige um Bearer token válido em qualquer requisição."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Faça login para continuar")

    token = authorization.split(" ", 1)[1]
    em_cache = _usuario_em_cache(token)
    if em_cache is not None:
        return dict(em_cache)  # cópia: quem recebe pode mexer sem sujar o cache

    # _validar_token e papel_do_usuario usam httpx/supabase-py de forma
    # bloqueante. Chamados direto aqui (função async), cada um trava o único
    # loop de eventos do Uvicorn por ~0,5-1s — o servidor não processa NENHUMA
    # outra requisição nesse meio tempo, mesmo que o cliente tenha disparado
    # várias em paralelo. `to_thread` tira essas chamadas do loop principal.
    usuario = await asyncio.to_thread(_validar_token, token)
    papel = await asyncio.to_thread(papel_do_usuario, usuario["id"])
    metadata = usuario.get("user_metadata") or {}
    resultado = {
        "id": usuario["id"],
        "email": usuario.get("email"),
        "nome": metadata.get("nome"),
        # `phone` é o campo nativo do Supabase Auth (login por SMS, que não
        # usamos); metadata.telefone é o que a pessoa digitou no cadastro.
        # Usado para casar a conta com o jogador do elenco (ver routers/presenca.py).
        "telefone": usuario.get("phone") or metadata.get("telefone"),
        "papel": papel,
    }
    _guardar_usuario(token, dict(resultado))
    return resultado


async def exige_editor(usuario: dict = Depends(usuario_atual)) -> dict:
    """Dependency: exige, além de login, que o papel seja 'editor'."""
    if usuario["papel"] != "editor":
        raise HTTPException(status_code=403, detail="Sua conta só tem permissão de visualização")
    return usuario