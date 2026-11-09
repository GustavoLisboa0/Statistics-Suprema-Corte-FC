"""
Autenticação local (sem Supabase Auth), usada quando `LOCAL_DB=1`.

Imita o que `auth.py` recebe do Supabase: devolve dicionários no mesmo
formato (`access_token`, `refresh_token`, `expires_in` e `user` com
`id`/`email`/`user_metadata`). As contas ficam na tabela `contas` do banco
local (senha com PBKDF2) e o papel (editor/visualizador) continua na tabela
`perfis`, exatamente como no Supabase.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import HTTPException

from local_db import criar_cliente

_db = criar_cliente()

# Só para uso local. Pode trocar pela variável LOCAL_AUTH_SECRET.
SEGREDO = (os.getenv("LOCAL_AUTH_SECRET") or "suprema-corte-fc-segredo-local").encode()
ACCESS_SEGUNDOS = 60 * 60
REFRESH_SEGUNDOS = 60 * 60 * 24 * 30
_ITERACOES = 120_000


def hash_senha(senha: str, sal: str | None = None) -> str:
    sal = sal or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", senha.encode(), bytes.fromhex(sal), _ITERACOES)
    return f"{sal}${h.hex()}"


def _senha_confere(senha: str, guardado: str) -> bool:
    sal, _ = guardado.split("$", 1)
    return hmac.compare_digest(hash_senha(senha, sal), guardado)


def _b64(dados: bytes) -> str:
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode()


def _b64_inverso(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def _assinar(tipo: str, user_id: str, validade: int) -> str:
    corpo = _b64(json.dumps({"sub": user_id, "tipo": tipo, "exp": int(time.time()) + validade}).encode())
    assinatura = _b64(hmac.new(SEGREDO, corpo.encode(), hashlib.sha256).digest())
    return f"{corpo}.{assinatura}"


def _ler_token(token: str, tipo: str) -> str | None:
    """Devolve o id do usuário se o token for válido, do tipo certo e não expirado."""
    try:
        corpo, assinatura = token.split(".")
        esperada = _b64(hmac.new(SEGREDO, corpo.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(assinatura, esperada):
            return None
        dados = json.loads(_b64_inverso(corpo))
    except Exception:  # noqa: BLE001 - qualquer token malformado é inválido
        return None
    if dados.get("tipo") != tipo or dados.get("exp", 0) < time.time():
        return None
    return dados["sub"]


def _usuario_publico(conta: dict) -> dict:
    return {
        "id": conta["id"],
        "email": conta["email"],
        "phone": conta.get("phone"),
        "user_metadata": conta.get("user_metadata") or {},
    }


def _sessao(conta: dict) -> dict:
    return {
        "access_token": _assinar("access", conta["id"], ACCESS_SEGUNDOS),
        "refresh_token": _assinar("refresh", conta["id"], REFRESH_SEGUNDOS),
        "expires_in": ACCESS_SEGUNDOS,
        "user": _usuario_publico(conta),
    }


def _conta_por_email(email: str) -> dict | None:
    email = (email or "").strip().lower()
    return next((c for c in _db.table("contas").select("*").execute().data if c["email"] == email), None)


def _conta_por_id(user_id: str) -> dict | None:
    achadas = _db.table("contas").select("*").eq("id", user_id).execute().data
    return achadas[0] if achadas else None


def criar_conta_local(
    email: str,
    password: str,
    metadata: dict | None = None,
    papel: str = "visualizador",
) -> dict:
    """Cria conta + perfil. Usado pelo cadastro e pelo seed."""
    email = email.strip().lower()
    if _conta_por_email(email):
        raise HTTPException(status_code=400, detail="Este email já está cadastrado")
    conta = _db.table("contas").insert(
        {"email": email, "senha": hash_senha(password), "user_metadata": metadata or {}}
    ).execute().data[0]
    _db.table("perfis").insert({"id": conta["id"], "papel": papel}).execute()
    return conta


# --- mesma interface que auth.py usa com o Supabase -------------------------
def login(email: str, password: str) -> dict:
    conta = _conta_por_email(email)
    if not conta or not _senha_confere(password, conta["senha"]):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")
    return _sessao(conta)


def criar_conta(email: str, password: str, nome: str | None = None, telefone: str | None = None) -> dict:
    metadata = {k: v for k, v in {"nome": nome, "telefone": telefone}.items() if v}
    return _sessao(criar_conta_local(email, password, metadata))


def refresh(refresh_token: str) -> dict:
    user_id = _ler_token(refresh_token, "refresh")
    conta = _conta_por_id(user_id) if user_id else None
    if not conta:
        raise HTTPException(status_code=401, detail="Sessão expirada, faça login novamente")
    return _sessao(conta)


def validar_token(access_token: str) -> dict:
    user_id = _ler_token(access_token, "access")
    conta = _conta_por_id(user_id) if user_id else None
    if not conta:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada")
    return _usuario_publico(conta)
