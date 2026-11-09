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


def _validar(tatica: Any, estrategia: str) -> None:
    if isinstance(tatica, dict):  # tática montada pelo administrador (ver `config_da_tatica`)
        pass
    elif tatica not in TATICAS:
        raise ValueError(f"Tática desconhecida: {tatica!r}")
    if estrategia not in ESTRATEGIAS:
        raise ValueError(f"Estratégia desconhecida: {estrategia!r}")


# ---------------------------------------------------------------------------
# Qualidade
# ---------------------------------------------------------------------------
def qualidade(
    atributos: Optional[dict],
    funcao: str,
    tatica: Any = "equilibrada",
    caracteristicas: Optional[list[str]] = None,
) -> float:
    """
    Qualidade (aprox. 0–130) de um jogador numa função, sob uma tática.

    `atributos`: {"pace": 70, ...}; o que faltar vale 50.
    `caracteristicas`: ["marcador", ...] — dão um pequeno bônus conforme a tática.
    """
    _validar(tatica, "uniforme")
    montada = isinstance(tatica, dict)
    config = tatica if montada else TATICAS[tatica]
    atributos = atributos or {}
    total = 0.0
    peso_total = 0.0
    por_funcao = config.get("attr_funcao", {}).get(funcao, {}) if montada else {}
    for atributo, peso in PESOS_FUNCAO[funcao].items():
        peso *= config["attr"].get(atributo, 1.0) * por_funcao.get(atributo, 1.0)
        valor = atributos.get(atributo)
        total += peso * (PADRAO if valor is None else valor)
        peso_total += peso
    tabela_bonus = (
        config.get("bonus_funcao", {}).get(funcao, {})
        if montada
        else BONUS_CARACTERISTICA.get(tatica, {})
    )
    bonus = sum(tabela_bonus.get(c, 0) for c in caracteristicas or [])
    return (total / peso_total + bonus) * config["funcao"].get(funcao, 1.0)


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
    tatica: Any = "equilibrada",
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


# ---------------------------------------------------------------------------
# Características (além dos números) e formações sugeridas
# ---------------------------------------------------------------------------
CARACTERISTICAS = {
    "canhoto": "Canhoto",
    "destro": "Destro",
    "ambidestro": "Joga com os dois pés",
    "alto": "Alto",
    "jogo_aereo": "Bom no jogo aéreo",
    "marcador": "Bom marcador",
    "desarme": "Forte no desarme",
    "passe_longo": "Passe longo",
    "armador": "Armador (cria jogadas)",
    "driblador": "Driblador",
    "finalizador": "Faro de gol",
    "chute_longe": "Chute de longe",
    "bola_parada": "Bola parada",
    "folego": "Muito fôlego",
    "lider": "Líder",
    "cabeca_fria": "Cabeça fria",
}

# Bônus pequeno (em pontos de qualidade) que cada tática dá a quem tem a característica.
BONUS_CARACTERISTICA: dict[str, dict[str, float]] = {
    "ofensiva": {"finalizador": 6, "driblador": 4, "chute_longe": 3},
    "defensiva": {"marcador": 6, "desarme": 5, "jogo_aereo": 4},
    "posse": {"armador": 6, "passe_longo": 4, "cabeca_fria": 3},
    "contra_ataque": {"driblador": 4, "finalizador": 4, "folego": 4},
    "pressao": {"folego": 6, "desarme": 5, "marcador": 3},
}

MODOS_ATRIBUTO = {
    "pelo_menos_um": "Pelo menos um bom no atributo",
    "misto": "Um alto e um baixo",
    "altos": "Todos altos",
    "baixos": "Todos baixos",
}
MODOS_CARACTERISTICA = {
    "pelo_menos_um": "Pelo menos um com a característica",
    "todos": "Todos com a característica",
    "nenhum": "Nenhum com a característica",
}

# tática -> (formação inicial, mudança durante o jogo ou None, motivo)
FORMACAO_POR_TATICA: dict[str, tuple[str, Optional[tuple[float, str]], str]] = {
    "equilibrada": ("4-4-2", None, "4-4-2 é o jeito mais equilibrado e simples de jogar."),
    "ofensiva": (
        "4-4-2",
        (0.67, "4-3-3"),
        "Começa equilibrado e, no último terço do jogo, vai com 3 atacantes para buscar o resultado.",
    ),
    "defensiva": (
        "4-4-2",
        (0.67, "5-4-1"),
        "Começa equilibrado e, no último terço, fecha com 5 na defesa para segurar o resultado.",
    ),
    "posse": ("4-2-3-1", None, "Dois volantes protegem a saída e três meias trocam passes à frente."),
    "contra_ataque": (
        "4-5-1",
        (0.67, "4-4-2"),
        "Espera bem fechado, com 5 no meio, e no fim sobe com mais um atacante.",
    ),
    "pressao": ("4-3-3", None, "Três atacantes pressionam a saída de bola do adversário."),
}


def sugerir_formacoes(tatica: Optional[str], duracao: int = 90) -> dict[str, Any]:
    """Formação inicial e (opcional) mudança durante o jogo para a tática."""
    inicial, mudanca, motivo = FORMACAO_POR_TATICA.get(tatica or "equilibrada", FORMACAO_POR_TATICA["equilibrada"])
    return {
        "formacao": inicial,
        "mudancas": (
            [{"minuto": round(duracao * mudanca[0]), "formacao": mudanca[1]}] if mudanca else []
        ),
        "motivo": motivo,
    }


# ---------------------------------------------------------------------------
# Táticas montadas pelo administrador (estilo FIFA / eFootball)
# ---------------------------------------------------------------------------
# Cada função (zagueiro, lateral...) recebe uma instrução para cada situação
# do jogo. O sistema traduz isso em "o que esta função precisa ter" (velocidade,
# marcação, passe...) e prefere escalar quem tem isso — sempre que possível.
SITUACOES: dict[str, str] = {
    "com_bola": "Com a bola",
    "sem_bola": "Sem a bola",
    "ataque": "Atacando",
    "defesa": "Defendendo",
    "contra_ataque": "No contra-ataque",
}

COMPORTAMENTOS: dict[str, dict[str, Any]] = {
    "fica": {"nome": "Fica na posição", "attr": {}, "carac": {}},
    "sobe": {
        "nome": "Sobe ao ataque",
        "attr": {"pace": 1.2, "fisico": 1.1, "passe": 1.1, "finalizacao": 1.1},
        "carac": {"folego": 3, "driblador": 2},
    },
    "apoia": {
        "nome": "Apoia quem tem a bola",
        "attr": {"passe": 1.2, "visao": 1.1},
        "carac": {"armador": 2},
    },
    "recua": {
        "nome": "Recua e protege",
        "attr": {"defesa": 1.25, "fisico": 1.05},
        "carac": {"marcador": 3, "desarme": 3, "jogo_aereo": 2},
    },
    "pressiona": {
        "nome": "Pressiona a saída",
        "attr": {"fisico": 1.25, "pace": 1.15, "defesa": 1.1},
        "carac": {"folego": 4, "desarme": 3},
    },
    "abre": {
        "nome": "Abre pelos lados",
        "attr": {"pace": 1.25, "passe": 1.1},
        "carac": {"driblador": 3},
    },
    "fecha": {
        "nome": "Fecha por dentro",
        "attr": {"passe": 1.15, "visao": 1.2},
        "carac": {"armador": 3, "passe_longo": 2},
    },
    "infiltra": {
        "nome": "Infiltra no espaço",
        "attr": {"pace": 1.25, "finalizacao": 1.2},
        "carac": {"finalizador": 4, "driblador": 2},
    },
}

# O que faz sentido para cada posição (o primeiro é o padrão).
COMPORTAMENTOS_POR_FUNCAO: dict[str, list[str]] = {
    "ZAG": ["fica", "sobe", "recua", "pressiona", "fecha"],
    "LAT": ["fica", "sobe", "apoia", "recua", "abre", "fecha", "pressiona"],
    "VOL": ["fica", "recua", "apoia", "sobe", "pressiona", "fecha"],
    "MEI": ["fica", "apoia", "abre", "fecha", "infiltra", "sobe", "pressiona", "recua"],
    "ATA": ["fica", "infiltra", "pressiona", "abre", "fecha", "recua"],
}


def validar_instrucoes(instrucoes: Any) -> dict[str, dict[str, str]]:
    """Confere e limpa {função: {situação: comportamento}}. Levanta ValueError se inválido."""
    if not isinstance(instrucoes, dict):
        raise ValueError("Instruções inválidas")
    limpo: dict[str, dict[str, str]] = {}
    for funcao, situacoes in instrucoes.items():
        if funcao not in COMPORTAMENTOS_POR_FUNCAO or not isinstance(situacoes, dict):
            raise ValueError(f"Posição desconhecida: {funcao!r}")
        for situacao, comportamento in situacoes.items():
            if situacao not in SITUACOES:
                raise ValueError(f"Situação desconhecida: {situacao!r}")
            if comportamento not in COMPORTAMENTOS_POR_FUNCAO[funcao]:
                raise ValueError(f"{comportamento!r} não vale para {funcao}")
            if comportamento != "fica":
                limpo.setdefault(funcao, {})[situacao] = comportamento
    return limpo


def config_da_tatica(instrucoes: dict[str, dict[str, str]]) -> dict[str, Any]:
    """Traduz as instruções em multiplicadores de atributo e bônus por função."""
    attr_funcao: dict[str, dict[str, float]] = {}
    bonus_funcao: dict[str, dict[str, float]] = {}
    for funcao, situacoes in instrucoes.items():
        extra: dict[str, float] = {}
        bonus: dict[str, float] = {}
        for comportamento in situacoes.values():
            info = COMPORTAMENTOS[comportamento]
            for atributo, mult in info["attr"].items():
                extra[atributo] = extra.get(atributo, 0.0) + (mult - 1.0)
            for carac, valor in info["carac"].items():
                bonus[carac] = bonus.get(carac, 0.0) + valor / 2
        attr_funcao[funcao] = {a: min(1.8, max(0.7, 1.0 + v / 2.5)) for a, v in extra.items()}
        bonus_funcao[funcao] = bonus
    return {"attr": {}, "funcao": {}, "attr_funcao": attr_funcao, "bonus_funcao": bonus_funcao}


def estilo_da_tatica(instrucoes: dict[str, dict[str, str]]) -> str:
    """Estilo (id de TATICAS) mais parecido com as instruções — usado para sugerir formação."""
    pontos = {"ofensiva": 0, "defensiva": 0, "posse": 0, "contra_ataque": 0, "pressao": 0}
    for situacoes in instrucoes.values():
        for situacao, c in situacoes.items():
            if c in ("sobe", "infiltra"):
                pontos["contra_ataque" if situacao == "contra_ataque" else "ofensiva"] += 1
            elif c == "recua":
                pontos["defensiva"] += 1
            elif c in ("apoia", "fecha"):
                pontos["posse"] += 1
            elif c == "pressiona":
                pontos["pressao"] += 1
            elif c == "abre":
                pontos["ofensiva"] += 1
    melhor = max(pontos, key=lambda k: pontos[k])
    return melhor if pontos[melhor] > 0 else "equilibrada"


# Modelos prontos para começar (o administrador pode copiar e mexer).
MODELOS_INSTRUCOES: dict[str, dict[str, dict[str, str]]] = {
    "equilibrada": {},
    "ofensiva": {
        "LAT": {"ataque": "sobe", "com_bola": "sobe", "contra_ataque": "sobe"},
        "VOL": {"ataque": "apoia", "com_bola": "apoia"},
        "MEI": {"ataque": "infiltra", "com_bola": "apoia", "contra_ataque": "infiltra"},
        "ATA": {"ataque": "infiltra", "contra_ataque": "infiltra", "sem_bola": "pressiona"},
    },
    "defensiva": {
        "ZAG": {"defesa": "recua", "sem_bola": "recua"},
        "LAT": {"defesa": "recua", "sem_bola": "recua"},
        "VOL": {"defesa": "recua", "sem_bola": "recua", "contra_ataque": "apoia"},
        "MEI": {"defesa": "recua", "sem_bola": "recua"},
        "ATA": {"defesa": "recua", "contra_ataque": "infiltra"},
    },
    "posse": {
        "ZAG": {"com_bola": "fecha"},
        "LAT": {"com_bola": "apoia", "ataque": "fecha"},
        "VOL": {"com_bola": "apoia", "ataque": "fecha"},
        "MEI": {"com_bola": "fecha", "ataque": "apoia"},
        "ATA": {"com_bola": "fecha"},
    },
    "contra_ataque": {
        "ZAG": {"defesa": "recua", "sem_bola": "recua"},
        "VOL": {"defesa": "recua", "contra_ataque": "apoia"},
        "LAT": {"contra_ataque": "sobe", "defesa": "recua"},
        "MEI": {"contra_ataque": "infiltra", "defesa": "recua"},
        "ATA": {"contra_ataque": "infiltra"},
    },
    "pressao": {
        "ZAG": {"sem_bola": "pressiona"},
        "LAT": {"sem_bola": "pressiona", "ataque": "sobe"},
        "VOL": {"sem_bola": "pressiona"},
        "MEI": {"sem_bola": "pressiona"},
        "ATA": {"sem_bola": "pressiona"},
    },
}


# ---------------------------------------------------------------------------
# Quadro tático (orientação do time) — NÃO interfere na escalação
# ---------------------------------------------------------------------------
# O administrador desenha, para cada lugar da formação, o que o jogador faz com
# a bola e sem a bola (posição no campo, papel e uma orientação em texto), mais
# ajustes do time todo. Serve para treino e para gerar o PDF de táticas.
FASES = ("com_bola", "sem_bola")

PAPEIS: dict[str, list[dict[str, str]]] = {
    "ZAG": [
        {"id": "seguranca", "nome": "Zagueiro de segurança", "descricao": "Fica atrás da linha da bola, protege a área e não sobe."},
        {"id": "sai_jogando", "nome": "Zagueiro que sai jogando", "descricao": "Avança com a bola e começa a armar o jogo."},
        {"id": "marcador", "nome": "Zagueiro marcador", "descricao": "Antecipa e cola no atacante, sem deixar virar."},
    ],
    "LAT": [
        {"id": "apoiador", "nome": "Lateral apoiador", "descricao": "Sobe para apoiar o ataque e volta para recompor."},
        {"id": "seguranca", "nome": "Lateral de segurança", "descricao": "Fica na linha da defesa, só cobre."},
        {"id": "ala", "nome": "Ala", "descricao": "Vive na linha de fundo, ataca e defende pelo lado todo."},
        {"id": "por_dentro", "nome": "Lateral por dentro", "descricao": "Fecha no meio na saída de bola, ajuda a criar."},
    ],
    "VOL": [
        {"id": "marcador", "nome": "Volante marcador", "descricao": "Protege a defesa e desarma antes da área."},
        {"id": "primeiro_passe", "nome": "Volante de primeiro passe", "descricao": "Recebe da defesa e distribui o jogo."},
        {"id": "box_to_box", "nome": "Volante que vai e volta", "descricao": "Ajuda nos dois lados, chega ao ataque e recompõe."},
    ],
    "MEI": [
        {"id": "armador", "nome": "Meia armador", "descricao": "Cria as jogadas e acha o passe decisivo."},
        {"id": "infiltrado", "nome": "Meia que chega à área", "descricao": "Aparece na área para finalizar."},
        {"id": "aberto", "nome": "Meia aberto", "descricao": "Abre pelo lado para dar amplitude."},
        {"id": "pressao", "nome": "Meia de pressão", "descricao": "Pressiona a saída de bola e recupera rápido."},
    ],
    "ATA": [
        {"id": "referencia", "nome": "Atacante de referência", "descricao": "Fixa na área, segura a bola e finaliza."},
        {"id": "movel", "nome": "Atacante móvel", "descricao": "Sai da área, abre espaço para os outros chegarem."},
        {"id": "pressao", "nome": "Atacante de pressão", "descricao": "Pressiona os zagueiros e o goleiro adversário."},
        {"id": "ponta", "nome": "Ponta", "descricao": "Abre pelo lado, dribla e cruza ou finaliza."},
    ],
}
SAIDAS_DE_BOLA = {"curta": "Curta (toca desde a defesa)", "mista": "Mista", "longa": "Longa (bola direta no ataque)"}

# Modelos prontos: ajustes do time + papel de cada função (aplicados a todos os lugares dela).
MODELOS_PLANO: dict[str, dict[str, Any]] = {
    "equilibrada": {
        "nome": "Equilibrada",
        "descricao": "Time compacto, sem exageros para nenhum lado.",
        "time": {"defesa": 3, "pressao": 3, "largura": 3, "saida": "mista"},
        "papeis": {"ZAG": "seguranca", "LAT": "apoiador", "VOL": "primeiro_passe", "MEI": "armador", "ATA": "movel"},
    },
    "ofensiva": {
        "nome": "Ofensiva",
        "descricao": "Linhas altas, laterais no ataque e muita gente na frente.",
        "time": {"defesa": 4, "pressao": 4, "largura": 4, "saida": "curta"},
        "papeis": {"ZAG": "sai_jogando", "LAT": "ala", "VOL": "box_to_box", "MEI": "infiltrado", "ATA": "referencia"},
    },
    "defensiva": {
        "nome": "Defensiva",
        "descricao": "Bloco baixo, laterais de segurança e saída em velocidade.",
        "time": {"defesa": 1, "pressao": 2, "largura": 2, "saida": "longa"},
        "papeis": {"ZAG": "seguranca", "LAT": "seguranca", "VOL": "marcador", "MEI": "pressao", "ATA": "movel"},
    },
    "posse": {
        "nome": "Posse de bola",
        "descricao": "Sai tocando desde a defesa e controla o jogo pelo meio.",
        "time": {"defesa": 3, "pressao": 3, "largura": 3, "saida": "curta"},
        "papeis": {"ZAG": "sai_jogando", "LAT": "por_dentro", "VOL": "primeiro_passe", "MEI": "armador", "ATA": "movel"},
    },
    "contra_ataque": {
        "nome": "Contra-ataque",
        "descricao": "Espera fechado e sai rápido para o ataque.",
        "time": {"defesa": 2, "pressao": 2, "largura": 3, "saida": "longa"},
        "papeis": {"ZAG": "seguranca", "LAT": "apoiador", "VOL": "marcador", "MEI": "aberto", "ATA": "ponta"},
    },
    "pressao": {
        "nome": "Pressão alta",
        "descricao": "Pressiona no campo do adversário para roubar a bola alta.",
        "time": {"defesa": 5, "pressao": 5, "largura": 3, "saida": "curta"},
        "papeis": {"ZAG": "marcador", "LAT": "apoiador", "VOL": "box_to_box", "MEI": "pressao", "ATA": "pressao"},
    },
}


def validar_plano(plano: Any) -> dict[str, Any]:
    """Confere e limpa o quadro tático. Levanta ValueError se algo estiver errado."""
    from escalacao import FORMACOES, slots_da_formacao

    if not isinstance(plano, dict):
        raise ValueError("Quadro tático inválido")
    formacao = plano.get("formacao", "4-4-2")
    if formacao not in FORMACOES:
        raise ValueError("Formação desconhecida")
    time = plano.get("time") or {}
    limpo_time: dict[str, Any] = {}
    for chave in ("defesa", "pressao", "largura"):
        v = time.get(chave, 3)
        if not isinstance(v, int) or isinstance(v, bool) or not 1 <= v <= 5:
            raise ValueError(f"Ajuste {chave!r} precisa ser de 1 a 5")
        limpo_time[chave] = v
    saida = time.get("saida", "mista")
    if saida not in SAIDAS_DE_BOLA:
        raise ValueError("Saída de bola desconhecida")
    limpo_time["saida"] = saida

    lugares = set(slots_da_formacao(formacao))
    jogadores: dict[str, Any] = {}
    for lugar, dados in (plano.get("jogadores") or {}).items():
        if lugar not in lugares or lugar == "GOL" or not isinstance(dados, dict):
            raise ValueError(f"Lugar desconhecido: {lugar!r}")
        item: dict[str, Any] = {}
        papel = dados.get("papel")
        if papel:
            if papel not in {p["id"] for p in PAPEIS[lugar[:3]]}:
                raise ValueError(f"Papel {papel!r} não existe para {lugar[:3]}")
            item["papel"] = papel
        nota = (dados.get("nota") or "").strip()
        if nota:
            item["nota"] = nota[:200]
        for fase in FASES:
            pos = dados.get(fase)
            if pos:
                x, y = pos.get("x"), pos.get("y")
                if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (x, y)):
                    raise ValueError("Posição inválida")
                item[fase] = {"x": round(min(max(x, 14), 386)), "y": round(min(max(y, 14), 546))}
        if item:
            jogadores[lugar] = item
    jogadas = plano.get("jogadas") or []
    if not isinstance(jogadas, list) or not all(isinstance(j, str) for j in jogadas):
        raise ValueError("Lista de jogadas ensaiadas inválida")
    return {
        "formacao": formacao,
        "time": limpo_time,
        "jogadores": jogadores,
        "notas": (plano.get("notas") or "").strip()[:600],
        "jogadas": list(dict.fromkeys(jogadas))[:30],
    }


# ---------------------------------------------------------------------------
# Jogadas ensaiadas: uma jogada combinada para um momento específico (escanteio,
# falta, saída de bola...). Diferente da tática (como cada um age em geral).
# Cada jogada tem passos; em cada passo o jogador pode ter uma posição no campo.
# ---------------------------------------------------------------------------
SITUACOES_ENSAIADAS = {
    "escanteio_ataque": "Escanteio a favor",
    "escanteio_defesa": "Escanteio contra",
    "falta_ataque": "Falta a favor",
    "falta_defesa": "Falta contra",
    "lateral": "Lateral",
    "saida_de_bola": "Saída de bola",
    "tiro_de_meta": "Tiro de meta",
    "outra": "Outra situação",
}
MAX_PASSOS = 8


def _ponto(pos: Any) -> dict[str, int]:
    if not isinstance(pos, dict):
        raise ValueError("Posição inválida")
    x, y = pos.get("x"), pos.get("y")
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (x, y)):
        raise ValueError("Posição inválida")
    return {"x": round(min(max(x, 14), 386)), "y": round(min(max(y, 14), 546))}


def validar_jogada(plano: Any, situacao: str) -> dict[str, Any]:
    """Confere e limpa uma jogada ensaiada. Levanta ValueError se algo estiver errado."""
    from escalacao import FORMACOES, slots_da_formacao

    if situacao not in SITUACOES_ENSAIADAS:
        raise ValueError("Situação desconhecida")
    if not isinstance(plano, dict):
        raise ValueError("Jogada inválida")
    formacao = plano.get("formacao", "4-4-2")
    if formacao not in FORMACOES:
        raise ValueError("Formação desconhecida")
    lugares = set(slots_da_formacao(formacao)) | {"GOL"}

    passos = plano.get("passos") or []
    if not isinstance(passos, list) or not 1 <= len(passos) <= MAX_PASSOS:
        raise ValueError(f"A jogada precisa ter de 1 a {MAX_PASSOS} passos")
    limpos = []
    for passo in passos:
        if not isinstance(passo, dict):
            raise ValueError("Passo inválido")
        posicoes = {}
        for lugar, pos in (passo.get("posicoes") or {}).items():
            if lugar not in lugares:
                raise ValueError(f"Lugar desconhecido: {lugar!r}")
            posicoes[lugar] = _ponto(pos)
        item: dict[str, Any] = {
            "texto": (passo.get("texto") or "").strip()[:300],
            "posicoes": posicoes,
        }
        if passo.get("bola"):
            item["bola"] = _ponto(passo["bola"])
        limpos.append(item)

    papeis = {}
    for lugar, texto in (plano.get("papeis") or {}).items():
        if lugar not in lugares:
            raise ValueError(f"Lugar desconhecido: {lugar!r}")
        texto = (texto or "").strip()
        if texto:
            papeis[lugar] = texto[:200]
    return {
        "formacao": formacao,
        "passos": limpos,
        "papeis": papeis,
        "notas": (plano.get("notas") or "").strip()[:600],
    }
