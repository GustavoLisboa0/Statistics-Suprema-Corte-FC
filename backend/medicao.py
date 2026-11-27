"""
Medição da duração de cada rota (item I11 da auditoria de rotas/infra).

Um middleware ASGI puro (sem BaseHTTPMiddleware, que muda o comportamento de
contextvars e de streaming) que, por requisição:
- escreve UMA linha de log no stdout, em chave=valor:
  `metodo=POST rota=/partidas/{partida_id}/escalacao/gerar status=200 dur_ms=812.4 auth_ms=0.3 auth_cache=1 dados_ms=41.0 solver_ms=702.9`
- manda o cabeçalho `Server-Timing` com o total (`app`) e as fases, para ver
  no painel Timing do DevTools.

Privacidade: o log tem só método, MOLDE da rota (com `{partida_id}`, nunca o
caminho com ids), status, duração e fases. Nunca query string, cabeçalhos,
token, corpo ou dado de usuário: quem tem acesso ao painel da Render lê esse
log.

Fases: o código marca trechos com `with medir("nome"):`, funções inteiras com
`@cronometrado("nome")` e valores com `marcar("chave", valor)`. O coletor de cada requisição vive num contextvar,
que o Starlette/anyio copia para a threadpool dos handlers `def`. Fora de
uma requisição medida (testes de unidade, scripts, MEDICAO_ATIVA=0),
`medir`/`marcar` não fazem nada.

Desligar sem mexer no código: variável de ambiente MEDICAO_ATIVA=0.
"""

from __future__ import annotations

import functools
import logging
import os
import sys
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterable, Iterator

LIMITE_LENTO_MS = 2000  # acima disso a linha vai como WARNING

logger = logging.getLogger("medicao")
if not logger.handlers:
    # O Uvicorn só configura os loggers dele: sem um handler próprio, INFO
    # deste logger não apareceria no stdout (e portanto nem no log da Render).
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(levelname)s medicao %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

_coletor: ContextVar[dict | None] = ContextVar("medicao_coletor", default=None)


def ativa() -> bool:
    """MEDICAO_ATIVA ligada por padrão; 0/false/off/nao desligam."""
    return os.getenv("MEDICAO_ATIVA", "1").strip().lower() not in ("0", "false", "off", "nao", "não")


@contextmanager
def medir(nome: str) -> Iterator[None]:
    """Soma a duração do bloco na fase `nome` da requisição atual (se houver)."""
    coletor = _coletor.get()
    if coletor is None:
        yield
        return
    inicio = time.perf_counter()
    try:
        yield
    finally:
        fases = coletor["fases"]
        fases[nome] = fases.get(nome, 0.0) + (time.perf_counter() - inicio) * 1000


def cronometrado(nome: str):
    """
    Decorador: cada chamada da função soma na fase `nome`. Serve para medir
    sem mexer no corpo de quem chama (ex.: as funções do solver na rota
    `gerar`). Exceções passam do mesmo jeito.
    """

    def decorar(funcao):
        @functools.wraps(funcao)
        def envolvida(*args, **kwargs):
            with medir(nome):
                return funcao(*args, **kwargs)

        return envolvida

    return decorar


def marcar(chave: str, valor: int | str) -> None:
    """Anota um valor curto da requisição atual (ex.: auth_cache=1). Nunca dado de usuário."""
    coletor = _coletor.get()
    if coletor is not None:
        coletor["marcas"][chave] = valor


def _ignorar(scope: dict) -> bool:
    metodo = scope.get("method", "")
    return metodo == "OPTIONS" or (metodo in ("GET", "HEAD") and scope.get("path") == "/")


def _molde_da_rota(scope: dict) -> str:
    # O roteador do FastAPI grava a rota casada em scope["route"] (o mesmo
    # dict que passa por aqui); `.path` é o molde com os parâmetros.
    rota = scope.get("route")
    return getattr(rota, "path", None) or "sem_rota"


def _server_timing(total_ms: float, coletor: dict) -> str:
    partes = [f"app;dur={total_ms:.1f}"]
    for nome, ms in coletor["fases"].items():
        parte = f"{nome};dur={ms:.1f}"
        if nome == "auth" and "auth_cache" in coletor["marcas"]:
            parte += ';desc="cache"' if coletor["marcas"]["auth_cache"] else ';desc="supabase"'
        partes.append(parte)
    return ", ".join(partes)


class MedicaoMiddleware:
    """Mede o app inteiro: registrar por último no main.py (fica por fora)."""

    def __init__(self, app, origens_timing: Iterable[str] = ()):
        self.app = app
        # Timing-Allow-Origin segue as origens do CORS: sem ele, o front
        # (outra origem) não enxerga as fases do Server-Timing.
        self.origens_timing = list(origens_timing)

    def _timing_allow_origin(self, scope: dict) -> bytes | None:
        if "*" in self.origens_timing:
            return b"*"
        origem = dict(scope.get("headers") or []).get(b"origin")
        if origem and origem.decode("latin-1") in self.origens_timing:
            return origem
        return None

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or _ignorar(scope) or not ativa():
            await self.app(scope, receive, send)
            return

        inicio = time.perf_counter()
        coletor: dict = {"fases": {}, "marcas": {}}
        token = _coletor.set(coletor)
        status = 500  # se nada for enviado (exceção), fica 500

        async def enviar(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                total_ms = (time.perf_counter() - inicio) * 1000
                headers = list(message.get("headers") or [])
                headers.append((b"server-timing", _server_timing(total_ms, coletor).encode("latin-1")))
                tao = self._timing_allow_origin(scope)
                if tao:
                    headers.append((b"timing-allow-origin", tao))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, enviar)
        except Exception:
            status = 500
            raise  # o comportamento de erro continua o mesmo de antes
        finally:
            dur_ms = (time.perf_counter() - inicio) * 1000
            _coletor.reset(token)
            campos = [
                f"metodo={scope.get('method', '')}",
                f"rota={_molde_da_rota(scope)}",
                f"status={status}",
                f"dur_ms={dur_ms:.1f}",
            ]
            campos += [f"{nome}_ms={ms:.1f}" for nome, ms in coletor["fases"].items()]
            campos += [f"{chave}={valor}" for chave, valor in coletor["marcas"].items()]
            nivel = logging.WARNING if dur_ms > LIMITE_LENTO_MS else logging.INFO
            logger.log(nivel, " ".join(campos))
