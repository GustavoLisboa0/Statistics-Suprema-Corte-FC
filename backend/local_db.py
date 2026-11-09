"""
Banco local (SQLite) que imita só o pedaço do supabase-py que o backend usa.

Ligado com a variável de ambiente `LOCAL_DB=1` (ver database.py). Serve para
rodar e testar o sistema no próprio computador, sem conta no Supabase.

Como funciona: cada linha de cada tabela é guardada como um documento JSON
dentro de uma única tabela SQLite (`docs`). O filtro/ordenação é feito em
Python — são poucos dados, então não há problema de desempenho.

Suporta apenas o que o projeto usa:
    client.table("x").select("a,b" | "*").eq(col, val).order(col, desc=).limit(n).execute()
    client.table("x").insert(dict | list).execute()
    client.table("x").update(dict).eq(...).execute()
    client.table("x").delete().eq(...).execute()
    client.table("x").upsert(dict, on_conflict="a,b").execute()
O resultado sempre tem `.data` (lista de dicionários), como no Supabase.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable

DB_PATH = Path(os.getenv("LOCAL_DB_PATH") or Path(__file__).parent / "local.db")

_lock = threading.RLock()


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Valores padrão do Postgres (o que o banco preencheria sozinho no INSERT)
# ---------------------------------------------------------------------------
_PADROES: dict[str, dict[str, Any]] = {
    "jogadores": {"ativo": True, "created_at": _agora},
    "partidas": {
        "status": "agendada",
        "placar_suprema": 0,
        "placar_adversario": 0,
        "created_at": _agora,
    },
    "presenca": {
        "status_pagamento": "pendente",
        "termos_aceitos": False,
        "created_at": _agora,
        "updated_at": _agora,
    },
    "estatisticas_partida": {
        "gols": 0,
        "assistencias": 0,
        "cartoes_amarelos": 0,
        "cartoes_vermelhos": 0,
        "minutos_jogados": 0,
        "titular": False,
        "created_at": _agora,
    },
    "punicoes": {"jogos_cumpridos": 0, "criado_em": _agora},
    "lesoes": {"criado_em": _agora},
    "escalacoes": {"formacao": "4-4-2", "created_at": _agora},
    "perfis": {"papel": "visualizador", "created_at": _agora},
    "contas": {"created_at": _agora},
}

# Chaves que o Postgres garante únicas (usadas pelo upsert e pela checagem).
_UNICOS: dict[str, tuple[str, ...]] = {
    "presenca": ("partida_id", "jogador_id"),
    "estatisticas_partida": ("jogador_id", "partida_id"),
}

# Apagar a linha-pai apaga as filhas (on delete cascade do schema.sql).
_CASCATA: dict[str, list[tuple[str, str]]] = {
    "jogadores": [
        ("estatisticas_partida", "jogador_id"),
        ("presenca", "jogador_id"),
        ("punicoes", "jogador_id"),
        ("lesoes", "jogador_id"),
    ],
    "partidas": [
        ("estatisticas_partida", "partida_id"),
        ("presenca", "partida_id"),
        ("escalacoes", "partida_id"),
    ],
}
# Apagar o pai só zera a referência (on delete set null).
_SET_NULL: dict[str, list[tuple[str, str]]] = {
    "partidas": [("lesoes", "partida_id")],
}


def _conectar() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute(
        "create table if not exists docs ("
        " seq integer primary key autoincrement,"
        " tabela text not null,"
        " id text not null,"
        " doc text not null)"
    )
    conn.execute("create index if not exists idx_docs_tabela on docs (tabela, id)")
    return conn


# ---------------------------------------------------------------------------
# Leitura / escrita bruta
# ---------------------------------------------------------------------------
def _ler(tabela: str) -> list[dict]:
    with _lock, _conectar() as conn:
        linhas = conn.execute(
            "select doc from docs where tabela = ? order by seq", (tabela,)
        ).fetchall()
    return [json.loads(doc) for (doc,) in linhas]


def _inserir_linha(tabela: str, doc: dict) -> None:
    with _lock, _conectar() as conn:
        conn.execute(
            "insert into docs (tabela, id, doc) values (?, ?, ?)",
            (tabela, str(doc["id"]), json.dumps(doc, default=str)),
        )


def _gravar_linha(tabela: str, doc: dict) -> None:
    with _lock, _conectar() as conn:
        conn.execute(
            "update docs set doc = ? where tabela = ? and id = ?",
            (json.dumps(doc, default=str), tabela, str(doc["id"])),
        )


def _apagar_linha(tabela: str, id_: str) -> None:
    with _lock, _conectar() as conn:
        conn.execute("delete from docs where tabela = ? and id = ?", (tabela, str(id_)))


def limpar_tudo() -> None:
    """Apaga todos os dados locais (usado pelo seed e pelos testes)."""
    with _lock, _conectar() as conn:
        conn.execute("delete from docs")


# ---------------------------------------------------------------------------
# Views (espelham database/schema.sql)
# ---------------------------------------------------------------------------
def _soma(linhas: list[dict], campo: str) -> int:
    return sum(l.get(campo) or 0 for l in linhas)


def _vw_artilheiros() -> list[dict]:
    stats = _ler("estatisticas_partida")
    saida = []
    for j in _ler("jogadores"):
        proprias = [e for e in stats if e.get("jogador_id") == j["id"]]
        saida.append(
            {
                "jogador_id": j["id"],
                "nome": j.get("nome"),
                "apelido": j.get("apelido"),
                "total_gols": _soma(proprias, "gols"),
                "total_assistencias": _soma(proprias, "assistencias"),
            }
        )
    return sorted(saida, key=lambda r: -r["total_gols"])


def _vw_cartoes() -> list[dict]:
    stats = _ler("estatisticas_partida")
    saida = []
    for j in _ler("jogadores"):
        proprias = [e for e in stats if e.get("jogador_id") == j["id"]]
        saida.append(
            {
                "jogador_id": j["id"],
                "nome": j.get("nome"),
                "apelido": j.get("apelido"),
                "total_amarelos": _soma(proprias, "cartoes_amarelos"),
                "total_vermelhos": _soma(proprias, "cartoes_vermelhos"),
            }
        )
    return sorted(saida, key=lambda r: (-r["total_amarelos"], -r["total_vermelhos"]))


def _vw_desempenho_time() -> list[dict]:
    jogos = [p for p in _ler("partidas") if p.get("status") == "realizada"]
    pro = lambda p: p.get("placar_suprema") or 0  # noqa: E731
    contra = lambda p: p.get("placar_adversario") or 0  # noqa: E731
    return [
        {
            "total_partidas": len(jogos),
            "vitorias": sum(1 for p in jogos if pro(p) > contra(p)),
            "empates": sum(1 for p in jogos if pro(p) == contra(p)),
            "derrotas": sum(1 for p in jogos if pro(p) < contra(p)),
            "gols_marcados": sum(pro(p) for p in jogos),
            "gols_sofridos": sum(contra(p) for p in jogos),
        }
    ]


_VIEWS: dict[str, Callable[[], list[dict]]] = {
    "vw_artilheiros": _vw_artilheiros,
    "vw_cartoes": _vw_cartoes,
    "vw_desempenho_time": _vw_desempenho_time,
}


# ---------------------------------------------------------------------------
# Consulta encadeável
# ---------------------------------------------------------------------------
def _resultado(dados: list[dict]) -> SimpleNamespace:
    return SimpleNamespace(data=dados, count=None)


def _aplicar_padroes(tabela: str, linha: dict) -> dict:
    doc = dict(linha)
    for campo, padrao in _PADROES.get(tabela, {}).items():
        if doc.get(campo) is None:
            doc[campo] = padrao() if callable(padrao) else padrao
    if not doc.get("id"):
        doc["id"] = str(uuid.uuid4())
    doc["id"] = str(doc["id"])
    return doc


def _chave_ordem(valor: Any):
    # None vai pro fim, como o Postgres faz em ordem crescente.
    return (valor is None, valor if valor is not None else 0)


class _Consulta:
    def __init__(self, tabela: str):
        self._tabela = tabela
        self._acao = "select"
        self._colunas: list[str] | None = None
        self._filtros: list[tuple[str, Any]] = []
        self._ordem: list[tuple[str, bool]] = []
        self._limite: int | None = None
        self._payload: Any = None
        self._on_conflict: tuple[str, ...] = ()

    # --- construção ------------------------------------------------------
    def select(self, colunas: str = "*"):
        self._acao = "select"
        colunas = (colunas or "*").replace(" ", "")
        self._colunas = None if colunas == "*" else colunas.split(",")
        return self

    def insert(self, payload):
        self._acao, self._payload = "insert", payload
        return self

    def update(self, payload: dict):
        self._acao, self._payload = "update", payload
        return self

    def delete(self):
        self._acao = "delete"
        return self

    def upsert(self, payload, on_conflict: str | None = None):
        self._acao, self._payload = "upsert", payload
        self._on_conflict = tuple((on_conflict or "").replace(" ", "").split(",")) if on_conflict else ()
        return self

    def eq(self, coluna: str, valor: Any):
        self._filtros.append((coluna, valor))
        return self

    def order(self, coluna: str, desc: bool = False):
        self._ordem.append((coluna, desc))
        return self

    def limit(self, n: int):
        self._limite = n
        return self

    # --- execução --------------------------------------------------------
    def _casa(self, linha: dict) -> bool:
        return all(str(linha.get(c)) == str(v) if v is not None else linha.get(c) is None
                   for c, v in self._filtros)

    def execute(self):
        with _lock:
            return getattr(self, f"_executar_{self._acao}")()

    def _executar_select(self):
        if self._tabela in _VIEWS:
            linhas = _VIEWS[self._tabela]()
        else:
            linhas = _ler(self._tabela)
        linhas = [l for l in linhas if self._casa(l)]
        # Ordena do critério menos importante para o mais (sort estável).
        for coluna, desc in reversed(self._ordem):
            linhas.sort(key=lambda l, c=coluna: _chave_ordem(l.get(c)), reverse=desc)
        if self._limite is not None:
            linhas = linhas[: self._limite]
        if self._colunas:
            linhas = [{c: l.get(c) for c in self._colunas} for l in linhas]
        return _resultado(linhas)

    def _novas_linhas(self) -> list[dict]:
        bruto = self._payload if isinstance(self._payload, list) else [self._payload]
        return [json.loads(json.dumps(l, default=str)) for l in bruto]

    def _checar_unico(self, linha: dict, ignorar_id: str | None = None):
        chave = _UNICOS.get(self._tabela)
        if not chave:
            return
        for existente in _ler(self._tabela):
            if existente["id"] != ignorar_id and all(
                existente.get(c) == linha.get(c) for c in chave
            ):
                raise ValueError(f"duplicate key value violates unique constraint ({', '.join(chave)})")

    def _executar_insert(self):
        criadas = []
        for linha in self._novas_linhas():
            doc = _aplicar_padroes(self._tabela, linha)
            self._checar_unico(doc)
            _inserir_linha(self._tabela, doc)
            criadas.append(doc)
        return _resultado(criadas)

    def _executar_upsert(self):
        resultado = []
        for linha in self._novas_linhas():
            chave = self._on_conflict or _UNICOS.get(self._tabela, ("id",))
            existente = None
            if all(linha.get(c) is not None for c in chave):
                existente = next(
                    (e for e in _ler(self._tabela) if all(e.get(c) == linha.get(c) for c in chave)),
                    None,
                )
            if existente:
                existente.update(linha)
                if self._tabela == "presenca":
                    existente["updated_at"] = _agora()
                _gravar_linha(self._tabela, existente)
                resultado.append(existente)
            else:
                doc = _aplicar_padroes(self._tabela, linha)
                _inserir_linha(self._tabela, doc)
                resultado.append(doc)
        return _resultado(resultado)

    def _executar_update(self):
        alteradas = []
        novos = json.loads(json.dumps(self._payload, default=str))
        for linha in _ler(self._tabela):
            if self._casa(linha):
                linha.update(novos)
                if self._tabela == "presenca":
                    linha["updated_at"] = _agora()
                self._checar_unico(linha, ignorar_id=linha["id"])
                _gravar_linha(self._tabela, linha)
                alteradas.append(linha)
        return _resultado(alteradas)

    def _executar_delete(self):
        apagadas = [l for l in _ler(self._tabela) if self._casa(l)]
        for linha in apagadas:
            for filha, coluna in _CASCATA.get(self._tabela, []):
                for f in _ler(filha):
                    if f.get(coluna) == linha["id"]:
                        _apagar_linha(filha, f["id"])
            for filha, coluna in _SET_NULL.get(self._tabela, []):
                for f in _ler(filha):
                    if f.get(coluna) == linha["id"]:
                        f[coluna] = None
                        _gravar_linha(filha, f)
            _apagar_linha(self._tabela, linha["id"])
        return _resultado(apagadas)


class LocalClient:
    """Faz o papel do `supabase` em database.py quando LOCAL_DB=1."""

    def table(self, nome: str) -> _Consulta:
        return _Consulta(nome)


def criar_cliente() -> LocalClient:
    return LocalClient()
