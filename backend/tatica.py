"""
Escalador V2 — atributos, táticas, estratégias, nota interna e contra-estratégia.

Funções puras (sem banco). Tudo aqui é INTERNO do admin: atributos e notas
nunca vão para o PDF nem para a escalação que o usuário comum enxerga.

Conceitos
---------
- Atributos: 6 notas de 1 a 100 por jogador (pace, físico, defesa,
  finalização, passe, visão). Sem atributo preenchido vale 50 (neutro).
- Qualidade: quão bom o jogador é numa função (ZAG, LAT...), pesando os
  atributos que importam para a função e, por cima, a tática escolhida.
- Tática: estilo de jogo (ofensiva, defensiva, posse...). Muda os pesos e,
  com isso, quem o escalador prefere pôr em campo.
- Estratégia: *quando* usar os melhores (uniforme, força no início, no final).
- Nota do time: média de qualidade de quem está em campo em cada momento.
- Contra-estratégia: sugere tática/estratégia a partir do perfil e do
  histórico do adversário.
"""

from __future__ import annotations

from typing import Any, Optional

ATRIBUTOS = ["pace", "fisico", "defesa", "finalizacao", "passe", "visao"]
ATRIBUTO_NOMES = {
    "pace": "Velocidade",
    "fisico": "Físico",
    "defesa": "Defesa",
    "finalizacao": "Finalização",
    "passe": "Passe",
    "visao": "Visão de jogo",
}
PADRAO = 50  # valor quando o atributo não foi preenchido

# Quais atributos pesam em cada função (somam 1).
PESOS_FUNCAO: dict[str, dict[str, float]] = {
    "GOL": {"defesa": 0.6, "visao": 0.2, "passe": 0.2},
    "ZAG": {"defesa": 0.5, "fisico": 0.3, "pace": 0.1, "passe": 0.1},
    "LAT": {"pace": 0.3, "defesa": 0.3, "passe": 0.2, "fisico": 0.2},
    "VOL": {"defesa": 0.3, "passe": 0.3, "fisico": 0.25, "visao": 0.15},
    "MEI": {"passe": 0.35, "visao": 0.35, "pace": 0.15, "finalizacao": 0.15},
    "ATA": {"finalizacao": 0.45, "pace": 0.25, "visao": 0.15, "passe": 0.15},
}

TATICAS: dict[str, dict[str, Any]] = {
    "equilibrada": {
        "nome": "Equilibrada",
        "descricao": "Sem ênfase: escolhe o time mais completo.",
        "attr": {},
        "funcao": {},
    },
    "ofensiva": {
        "nome": "Ofensiva",
        "descricao": "Valoriza finalização e quem ataca; aceita arriscar atrás.",
        "attr": {"finalizacao": 1.2},
        "funcao": {"ATA": 1.25, "MEI": 1.1, "VOL": 0.95, "ZAG": 0.9},
    },
    "defensiva": {
        "nome": "Defensiva",
        "descricao": "Valoriza defesa e marcação; fecha os espaços.",
        "attr": {"defesa": 1.2},
        "funcao": {"ZAG": 1.25, "VOL": 1.15, "LAT": 1.05, "ATA": 0.9},
    },
    "posse": {
        "nome": "Posse de bola",
        "descricao": "Valoriza passe e visão para controlar o jogo.",
        "attr": {"passe": 1.3, "visao": 1.2},
        "funcao": {"MEI": 1.1, "VOL": 1.1},
    },
    "contra_ataque": {
        "nome": "Contra-ataque",
        "descricao": "Valoriza velocidade e finalização para sair rápido.",
        "attr": {"pace": 1.3, "finalizacao": 1.1},
        "funcao": {"ATA": 1.1, "LAT": 1.05},
    },
    "pressao": {
        "nome": "Pressão alta",
        "descricao": "Valoriza físico e velocidade para marcar no campo do rival.",
        "attr": {"fisico": 1.3, "pace": 1.15, "defesa": 1.1},
        "funcao": {},
    },
}

ESTRATEGIAS: dict[str, dict[str, str]] = {
    "uniforme": {
        "nome": "Uniforme",
        "descricao": "Os melhores jogam o jogo todo, sem preferência de momento.",
    },
    "forca_no_inicio": {
        "nome": "Força no início",
        "descricao": "Os melhores começam e saem depois: abre o jogo com o time mais forte.",
    },
    "forca_no_final": {
        "nome": "Força no final",
        "descricao": "Os melhores entram mais para o fim: decide o jogo com pernas frescas.",
    },
}


def _validar(tatica: str, estrategia: str) -> None:
    if tatica not in TATICAS:
        raise ValueError(f"Tática desconhecida: {tatica!r}")
    if estrategia not in ESTRATEGIAS:
        raise ValueError(f"Estratégia desconhecida: {estrategia!r}")


# ---------------------------------------------------------------------------
# Qualidade
# ---------------------------------------------------------------------------
def qualidade(atributos: Optional[dict], funcao: str, tatica: str = "equilibrada") -> float:
    """
    Qualidade (aprox. 0–130) de um jogador numa função, sob uma tática.

    `atributos`: {"pace": 70, ...}; o que faltar vale 50.
    """
    _validar(tatica, "uniforme")
    config = TATICAS[tatica]
    atributos = atributos or {}
    total = 0.0
    peso_total = 0.0
    for atributo, peso in PESOS_FUNCAO[funcao].items():
        peso *= config["attr"].get(atributo, 1.0)
        valor = atributos.get(atributo)
        total += peso * (PADRAO if valor is None else valor)
        peso_total += peso
    return total / peso_total * config["funcao"].get(funcao, 1.0)


def qualidade_do_jogador(
    atributos: Optional[dict], funcoes: list[str], tatica: str = "equilibrada"
) -> float:
    """Qualidade normalizada (1.0 = 100) na melhor função que ele joga."""
    if not funcoes:
        return PADRAO / 100
    return max(qualidade(atributos, f, tatica) for f in funcoes) / 100


def pesos_das_janelas(quantidade: int, estrategia: str) -> list[float]:
    """Quanto vale a qualidade em cada janela, conforme a estratégia (média 1)."""
    _validar("equilibrada", estrategia)
    if quantidade <= 1 or estrategia == "uniforme":
        return [1.0] * max(quantidade, 1)
    passos = [1.5 - i / (quantidade - 1) for i in range(quantidade)]  # 1.5 -> 0.5
    return passos if estrategia == "forca_no_inicio" else passos[::-1]


# ---------------------------------------------------------------------------
# Nota do time (interna)
# ---------------------------------------------------------------------------
SETORES = {"defesa": ("GOL", "ZAG", "LAT"), "meio": ("VOL", "MEI"), "ataque": ("ATA",)}


def _media(valores: list[float]) -> float:
    return sum(valores) / len(valores) if valores else 0.0


def analisar(
    resultado: dict,
    atributos_por_id: dict[str, dict],
    tatica: str = "equilibrada",
) -> dict[str, Any]:
    """
    Nota de cada momento do jogo e do jogo todo (0–100) + pontos de atenção.

    Resultado de `escalacao.gerar_escalacao`. Só para o admin: nunca incluir
    isto no PDF nem no que o usuário comum vê.
    """
    _validar(tatica, "uniforme")
    janelas = []
    por_funcao_total: dict[str, list[float]] = {}
    for janela in resultado["janelas"]:
        notas_funcao: dict[str, list[float]] = {}
        for lugar, jid in janela["lugares"].items():
            funcao = lugar[:3]
            notas_funcao.setdefault(funcao, []).append(
                qualidade(atributos_por_id.get(jid), funcao, tatica)
            )
        jogadores = [n for notas in notas_funcao.values() for n in notas]
        setores = {
            setor: _media([n for f in funcoes for n in notas_funcao.get(f, [])])
            for setor, funcoes in SETORES.items()
        }
        duracao = janela["fim"] - janela["inicio"]
        janelas.append(
            {
                "inicio": janela["inicio"],
                "fim": janela["fim"],
                "nota": min(100, round(_media(jogadores))),
                "setores": {k: min(100, round(v)) for k, v in setores.items()},
                "_duracao": duracao,
                "_bruta": _media(jogadores),
            }
        )
        for funcao, notas in notas_funcao.items():
            por_funcao_total.setdefault(funcao, []).extend(notas)

    total_minutos = sum(j["_duracao"] for j in janelas) or 1
    nota_geral = sum(j["_bruta"] * j["_duracao"] for j in janelas) / total_minutos
    for j in janelas:
        del j["_duracao"], j["_bruta"]

    sem_atributos = [
        resultado["jogadores"][jid]["nome"]
        for jid in resultado["minutos"]
        if jid in resultado["jogadores"]
        and resultado["minutos"][jid] > 0
        and not atributos_por_id.get(jid)
    ]
    atencao: list[str] = []
    if sem_atributos:
        atencao.append(
            f"{len(sem_atributos)} jogador(es) sem atributos preenchidos "
            f"({', '.join(sem_atributos[:4])}{'...' if len(sem_atributos) > 4 else ''}): "
            "a nota usa 50 para eles."
        )
    geral = round(nota_geral)
    for j in janelas:
        if j["nota"] <= geral - 5:
            atencao.append(
                f"Dos {j['inicio']} aos {j['fim']} min o time fica mais fraco (nota {j['nota']})."
            )
        for setor, valor in j["setores"].items():
            if valor < 45:
                atencao.append(
                    f"Dos {j['inicio']} aos {j['fim']} min o setor de {setor} está fraco (nota {valor})."
                )
    return {
        "tatica": tatica,
        "nota_geral": min(100, geral),
        "janelas": janelas,
        "pontos_de_atencao": atencao,
    }


# ---------------------------------------------------------------------------
# Contra-estratégia
# ---------------------------------------------------------------------------
ESTILOS_ADVERSARIO = {
    "equilibrado": "Equilibrado",
    "retranca": "Retranca (joga fechado)",
    "ataque": "Ataque (joga aberto)",
    "posse": "Toque de bola",
    "contra_ataque": "Contra-ataque",
}


def resumir_historico(partidas: list[dict]) -> dict[str, Any]:
    """Resumo dos jogos já realizados contra o adversário (dicts de `partidas`)."""
    jogos = [p for p in partidas if p.get("status") == "realizada"]
    pro = [p.get("placar_suprema") or 0 for p in jogos]
    contra = [p.get("placar_adversario") or 0 for p in jogos]
    return {
        "jogos": len(jogos),
        "vitorias": sum(1 for a, b in zip(pro, contra) if a > b),
        "empates": sum(1 for a, b in zip(pro, contra) if a == b),
        "derrotas": sum(1 for a, b in zip(pro, contra) if a < b),
        "gols_pro": sum(pro),
        "gols_contra": sum(contra),
    }


def sugerir_contra_estrategia(perfil: dict, historico: Optional[dict] = None) -> dict[str, Any]:
    """
    Sugere tática e estratégia contra um adversário.

    perfil: {"ataque": 1-10, "meio": 1-10, "defesa": 1-10, "estilo": ...}
    historico: saída de `resumir_historico` (opcional).
    Devolve a sugestão e os motivos em português simples.
    """
    pontos = {t: 0 for t in TATICAS}
    pontos["equilibrada"] = 1  # padrão quando nada chama a atenção
    motivos: list[str] = []
    ataque, meio, defesa = perfil.get("ataque"), perfil.get("meio"), perfil.get("defesa")
    estilo = perfil.get("estilo")

    def mais(tatica: str, valor: int, motivo: str):
        pontos[tatica] += valor
        motivos.append(motivo)

    if ataque is not None and ataque >= 7:
        mais("defensiva", 2, "O ataque do adversário é forte: vale reforçar a defesa.")
        pontos["contra_ataque"] += 1
    if ataque is not None and ataque <= 4:
        mais("pressao", 1, "O ataque do adversário é fraco: dá para marcar mais alto.")
        pontos["ofensiva"] += 1
    if defesa is not None and defesa >= 7:
        mais("posse", 2, "A defesa do adversário é forte: passe e visão para abrir espaços.")
    if defesa is not None and defesa <= 4:
        mais("ofensiva", 2, "A defesa do adversário é frágil: vale atacar mais.")
        pontos["pressao"] += 1
    if meio is not None and meio >= 7:
        mais("pressao", 2, "O meio do adversário é forte: pressionar atrapalha a saída de bola.")
    if meio is not None and meio <= 4:
        mais("posse", 1, "O meio do adversário é fraco: dá para controlar a bola.")

    if estilo == "retranca":
        mais("posse", 2, "Adversário joga fechado: paciência e troca de passes.")
        pontos["ofensiva"] += 1
    elif estilo == "ataque":
        mais("contra_ataque", 2, "Adversário joga aberto: sobram espaços para o contra-ataque.")
        pontos["defensiva"] += 1
    elif estilo == "posse":
        mais("pressao", 2, "Adversário gosta da bola: pressão alta atrapalha o toque.")
    elif estilo == "contra_ataque":
        mais("posse", 2, "Adversário espera para contra-atacar: melhor controlar a bola e não se expor.")
        pontos["defensiva"] += 1

    jogos = (historico or {}).get("jogos", 0)
    if jogos:
        if (historico["gols_contra"] / jogos) >= 2:
            mais("defensiva", 2, f"Nos {jogos} jogo(s) anteriores o time sofreu muitos gols.")
        if (historico["gols_pro"] / jogos) >= 3:
            mais("ofensiva", 1, "Nos jogos anteriores o time marcou bastante contra este adversário.")
        if jogos >= 2 and historico["derrotas"] > historico["vitorias"]:
            mais("defensiva", 1, "O histórico contra este adversário é negativo: mais cuidado.")

    tatica = max(pontos, key=lambda t: (pontos[t], -list(TATICAS).index(t)))
    if estilo == "retranca" or (defesa is not None and defesa >= 7):
        estrategia = "forca_no_final"
        motivos.append("Contra defesa fechada, guardar os melhores para o fim ajuda a decidir.")
    elif (ataque is not None and ataque >= 7) or estilo in ("ataque", "contra_ataque"):
        estrategia = "forca_no_inicio"
        motivos.append("Começar com o time mais forte evita tomar gol cedo.")
    else:
        estrategia = "uniforme"
    if not motivos:
        motivos.append("Nada chama a atenção no adversário: time equilibrado.")
    return {
        "tatica": tatica,
        "estrategia": estrategia,
        "motivos": motivos,
        "pontuacoes": pontos,
    }
