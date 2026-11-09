"""
Escalador automático V1 — formação fixa 4-4-2.

Funções puras (sem banco, sem rede): recebem dicionários e devolvem
dicionários, então são fáceis de testar. O router (routers/escalacao.py) só
busca os dados e chama `gerar_escalacao`.

Ideia geral
-----------
1. A partida é dividida em *janelas* de tempo (ex.: 60 min com 5 trocas = 6
   janelas de 10 min). Em cada janela jogam o goleiro (sempre o mesmo) e 10
   jogadores de linha.
2. Cada posição cadastrada do jogador (13 no sistema) vira uma das 5 funções
   do 4-4-2: ZAG, LAT, VOL, MEI, ATA (mais GOL).
3. Na 1ª janela escolhemos os 10 titulares; nas seguintes trocamos, no
   máximo, `trocas_por_vez` jogadores, sempre tirando quem já jogou mais e
   colocando quem jogou menos — assim os minutos ficam parecidos.
4. Toda escolha é validada com um casamento (algoritmo húngaro): os 10 de
   linha precisam caber nos 10 lugares (2 ZAG, 2 LAT, 2 VOL, 2 MEI, 2 ATA),
   cada um numa função que ele sabe jogar. Se não couber, a troca é
   descartada, então nunca falta gente numa posição.
"""

from __future__ import annotations

import math
import random
from functools import lru_cache
from itertools import combinations
from typing import Any, Optional

from tatica import pesos_das_janelas

FORMACAO = "4-4-2"

# Lugares em campo. A ordem aqui é a ordem em que aparecem no resultado.
SLOTS: list[str] = [
    "GOL",
    "ZAG1", "ZAG2",
    "LAT1", "LAT2",
    "VOL1", "VOL2",
    "MEI1", "MEI2",
    "ATA1", "ATA2",
]
SLOTS_LINHA: list[str] = [s for s in SLOTS if s != "GOL"]
FUNCOES_LINHA: list[str] = ["ZAG", "LAT", "VOL", "MEI", "ATA"]

NOMES_FUNCAO = {
    "GOL": "goleiro",
    "ZAG": "zagueiro",
    "LAT": "lateral",
    "VOL": "volante",
    "MEI": "meia",
    "ATA": "atacante",
}

# As 13 posições do cadastro -> função no 4-4-2.
POSICAO_PARA_FUNCAO: dict[str, str] = {
    "goleiro": "GOL",
    "zagueiro": "ZAG",
    "lateral_direito": "LAT",
    "lateral_esquerdo": "LAT",
    "volante": "VOL",
    "meia": "MEI",
    "meia_esquerda": "MEI",
    "meia_direita": "MEI",
    "meia_atacante": "MEI",
    "atacante": "ATA",
    "ponta_esquerda": "ATA",
    "ponta_direita": "ATA",
    "centro_avante": "ATA",
}

TENTATIVAS = 6  # quantas escalações candidatas gerar para escolher a mais equilibrada
DURACAO_PADRAO = 90
SUBSTITUICOES_PADRAO = 5
TROCAS_POR_VEZ_PADRAO = 2

_PROIBIDO = 1_000_000  # custo de um encaixe impossível no húngaro
_OBRIGATORIO = -1_000  # custo (bônus) de quem tem que estar em campo


class EscalacaoInviavel(ValueError):
    """Não existe escalação possível com os dados/regras recebidos."""


# ---------------------------------------------------------------------------
# Húngaro (casamento de custo mínimo) — sem bibliotecas externas
# ---------------------------------------------------------------------------
def _hungaro(custo: list[list[float]]) -> list[int]:
    """
    Para cada linha, devolve a coluna escolhida, minimizando o custo total.
    Exige n_linhas <= n_colunas (algoritmo clássico O(n²·m)).
    """
    n = len(custo)
    m = len(custo[0]) if n else 0
    inf = float("inf")
    u = [0.0] * (n + 1)
    v = [0.0] * (m + 1)
    p = [0] * (m + 1)
    caminho = [0] * (m + 1)
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [inf] * (m + 1)
        usado = [False] * (m + 1)
        while True:
            usado[j0] = True
            i0 = p[j0]
            delta = inf
            j1 = 0
            for j in range(1, m + 1):
                if not usado[j]:
                    atual = custo[i0 - 1][j - 1] - u[i0] - v[j]
                    if atual < minv[j]:
                        minv[j] = atual
                        caminho[j] = j0
                    if minv[j] < delta:
                        delta = minv[j]
                        j1 = j
            for j in range(m + 1):
                if usado[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = caminho[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    resposta = [0] * n
    for j in range(1, m + 1):
        if p[j]:
            resposta[p[j] - 1] = j - 1
    return resposta


@lru_cache(maxsize=None)
def _cabe_chaves(chaves: tuple[tuple[str, ...], ...]) -> bool:
    return _cabe_nos_lugares([set(c) for c in chaves])


def _cabe_nos_lugares(funcoes_por_jogador: list[set[str]]) -> bool:
    """
    Dá para colocar estes jogadores (um por lugar) nos 10 lugares de linha?
    Casamento simples por caminhos aumentantes — mais rápido que o húngaro,
    usado só para testar combinações.
    """
    dono: dict[int, int] = {}  # índice do lugar -> índice do jogador

    def tenta(j: int, vistos: set[int]) -> bool:
        for s, slot in enumerate(SLOTS_LINHA):
            if slot[:3] in funcoes_por_jogador[j] and s not in vistos:
                vistos.add(s)
                if s not in dono or tenta(dono[s], vistos):
                    dono[s] = j
                    return True
        return False

    return all(tenta(j, set()) for j in range(len(funcoes_por_jogador)))


# ---------------------------------------------------------------------------
# Preparação dos dados
# ---------------------------------------------------------------------------
def funcoes_do_jogador(posicoes: list[str]) -> list[str]:
    """Funções do 4-4-2 que o jogador joga, na ordem (principal primeiro)."""
    vistas: list[str] = []
    for pos in posicoes or []:
        funcao = POSICAO_PARA_FUNCAO.get(pos)
        if funcao and funcao not in vistas:
            vistas.append(funcao)
    return vistas


def aplicar_restricoes(
    regras: Optional[dict[str, dict]], restricoes: Optional[list[dict]]
) -> dict[str, dict]:
    """
    Junta as restrições do tipo "regerar com ajuste" às regras por jogador.

    Cada restrição: {"jogador_id": ..., "tipo": "comeca_dentro" | "comeca_fora"
    | "funcao", "funcao": "ZAG"}.
    """
    resultado = {k: dict(v) for k, v in (regras or {}).items()}
    for r in restricoes or []:
        regra = resultado.setdefault(str(r["jogador_id"]), {})
        tipo = r.get("tipo")
        if tipo == "comeca_dentro":
            regra["comeca"] = "titular"
        elif tipo == "comeca_fora":
            regra["comeca"] = "reserva"
        elif tipo == "funcao":
            if r.get("funcao") not in FUNCOES_LINHA:
                raise EscalacaoInviavel(f"Função inválida na restrição: {r.get('funcao')!r}")
            regra["funcao"] = r["funcao"]
        else:
            raise EscalacaoInviavel(f"Restrição desconhecida: {tipo!r}")
    return resultado


class _Jogador:
    """Dados de um jogador de linha já preparados para o algoritmo."""

    def __init__(self, dados: dict, regra: dict, qual: Optional[dict] = None):
        self.id = str(dados["id"])
        self.nome = dados.get("nome") or self.id
        self.funcoes = [f for f in funcoes_do_jogador(dados.get("posicoes", [])) if f != "GOL"]
        forcada = regra.get("funcao")
        if forcada:
            # "Y joga na função Z": só essa função vale para ele.
            self.funcoes = [forcada]
        self.minutos_max: Optional[int] = regra.get("minutos_max")
        self.so_segundo_tempo: bool = bool(regra.get("so_segundo_tempo"))
        self.comeca: Optional[str] = regra.get("comeca")  # "titular" | "reserva"
        self.grupo_fixo: bool = bool(regra.get("grupo_fixo"))
        self.nao_sai: bool = bool(regra.get("nao_sai")) or self.grupo_fixo
        # Quem está no grupo fixo começa em campo, a menos que o usuário
        # tenha dito o contrário (aí a regra é contraditória e dá erro).
        if self.grupo_fixo and self.comeca is None:
            self.comeca = "titular"
        self.chave = tuple(sorted(self.funcoes))  # para o cache de encaixe
        # Qualidade por função (V2, só com tática): {"ZAG": 0.6, ...}
        qual = qual or {}
        self.q = {f: qual.get(f, 0.5) for f in self.funcoes} if qual else {}
        self.qmax = max(self.q.values()) if self.q else 0.0
        self.acumulado = 0  # minutos já jogados
        self.dentro = False  # está em campo agora?

    def rank_funcao(self, funcao: str) -> int:
        return self.funcoes.index(funcao)

    def disponivel(self, janela: tuple[int, int], duracao: int, indice: int) -> bool:
        inicio, fim = janela
        if self.so_segundo_tempo and inicio < duracao / 2:
            return False
        if indice == 0 and self.comeca == "reserva":
            return False
        if self.minutos_max is not None and self.acumulado + (fim - inicio) > self.minutos_max:
            return False
        return True


# ---------------------------------------------------------------------------
# Janelas
# ---------------------------------------------------------------------------
def montar_janelas(duracao: int, n_substituicoes: int) -> list[tuple[int, int]]:
    """Divide o jogo em n_substituicoes + 1 janelas de tamanho (quase) igual."""
    total = n_substituicoes + 1
    cortes = [round(i * duracao / total) for i in range(total + 1)]
    return [(cortes[i], cortes[i + 1]) for i in range(total) if cortes[i + 1] > cortes[i]]


def janelas_dos_cortes(duracao: int, cortes: list[int]) -> list[tuple[int, int]]:
    """Janelas a partir dos minutos das substituições (ex.: [15, 30] -> 0-15, 15-30, 30-fim)."""
    pontos = [0] + sorted({c for c in cortes if 0 < c < duracao}) + [duracao]
    return list(zip(pontos[:-1], pontos[1:]))


# ---------------------------------------------------------------------------
# Validação de entrada
# ---------------------------------------------------------------------------
def _explicar_falta(jogadores: list[_Jogador]) -> str:
    """Mensagem clara dizendo qual posição não tem gente suficiente."""
    faltas = []
    for funcao in FUNCOES_LINHA:
        tem = sum(1 for j in jogadores if funcao in j.funcoes)
        if tem < 2:
            nome = NOMES_FUNCAO[funcao]
            faltas.append(f"{nome} (precisa de 2, tem {tem})")
    if faltas:
        return "Faltam jogadores para: " + ", ".join(faltas) + "."
    return (
        "Os jogadores convocados não conseguem cobrir as 10 vagas de linha ao mesmo tempo "
        "(2 zagueiros, 2 laterais, 2 volantes, 2 meias e 2 atacantes): alguns jogam só "
        "as mesmas posições. Convoque alguém para as posições mais concorridas."
    )


def _validar_entrada(
    jogadores: list[dict], goleiro_id: str, duracao: int, n_subs: int, trocas: int
) -> None:
    if duracao < 10 or duracao > 120:
        raise EscalacaoInviavel("A duração do jogo deve ficar entre 10 e 120 minutos.")
    if n_subs < 0 or n_subs > 20:
        raise EscalacaoInviavel("O número de substituições deve ficar entre 0 e 20.")
    if trocas < 1 or trocas > 10:
        raise EscalacaoInviavel("Quantos trocam por vez deve ficar entre 1 e 10.")
    ids = [str(j["id"]) for j in jogadores]
    if len(set(ids)) != len(ids):
        raise EscalacaoInviavel("Há jogador repetido na lista de convocados.")
    if goleiro_id not in ids:
        raise EscalacaoInviavel("Escolha um goleiro entre os convocados.")


# ---------------------------------------------------------------------------
# Atribuição de lugares
# ---------------------------------------------------------------------------
def _atribuir_lugares(
    campo: list[_Jogador], anterior: dict[str, str]
) -> Optional[dict[str, str]]:
    """
    Distribui os 10 de linha nos 10 lugares (ids -> lugar), ou None se não couber.

    `anterior` diz onde cada um estava na janela passada: quem continua em
    campo tende a ficar no mesmo lugar, e quem entra tende a pegar o lugar
    de quem saiu.
    """
    lugares_ocupados = set(anterior.values())
    ids_campo = {j.id for j in campo}
    vagos = {lugar for jid, lugar in anterior.items() if jid not in ids_campo}
    custo: list[list[float]] = []
    for lugar in SLOTS_LINHA:
        linha = []
        for j in campo:
            funcao = lugar[:3]
            if funcao not in j.funcoes:
                linha.append(_PROIBIDO)
            elif j.id in anterior:  # continua em campo
                if anterior[j.id] == lugar:
                    linha.append(0)
                elif anterior[j.id][:3] == funcao:
                    linha.append(1)
                else:
                    linha.append(10)
            else:  # entrando (ou 1ª janela)
                base = 3 * j.rank_funcao(funcao)
                if lugares_ocupados:
                    base += 0 if lugar in vagos else 5
                linha.append(base)
        custo.append(linha)
    escolha = _hungaro(custo)
    if any(custo[i][c] >= _PROIBIDO for i, c in enumerate(escolha)):
        return None
    return {campo[c].id: SLOTS_LINHA[i] for i, c in enumerate(escolha)}


def _escolher_titulares(
    linha: list[_Jogador],
    janela: tuple[int, int],
    duracao: int,
    rng: Optional[random.Random] = None,
    peso_q: float = 0.0,
) -> list[_Jogador]:
    """Escolhe os 10 de linha da 1ª janela respeitando as regras de início."""
    candidatos = [j for j in linha if j.disponivel(janela, duracao, 0)]
    for j in linha:
        if j.comeca == "titular" and j not in candidatos:
            raise EscalacaoInviavel(
                f"{j.nome} está marcado para começar jogando, mas outra regra dele "
                "(só 2º tempo / minutos máximos) o impede."
            )
    obrigatorios = [j for j in candidatos if j.comeca == "titular"]
    if len(obrigatorios) > len(SLOTS_LINHA):
        raise EscalacaoInviavel("Há mais de 10 jogadores de linha marcados para começar jogando.")
    if len(candidatos) < len(SLOTS_LINHA):
        raise EscalacaoInviavel(
            f"Só {len(candidatos)} jogador(es) de linha podem começar o jogo; são necessários 10."
        )

    custo = []
    for lugar in SLOTS_LINHA:
        funcao = lugar[:3]
        linha_custo = []
        for ordem, j in enumerate(candidatos):
            if funcao not in j.funcoes:
                linha_custo.append(_PROIBIDO)
            else:
                bonus = _OBRIGATORIO if j in obrigatorios else 0
                desempate = rng.random() * 0.9 if rng else ordem * 0.001
                linha_custo.append(
                    bonus + 3 * j.rank_funcao(funcao) + desempate - peso_q * j.q.get(funcao, 0.0)
                )
        custo.append(linha_custo)
    escolha = _hungaro(custo)
    if any(custo[i][c] >= _PROIBIDO for i, c in enumerate(escolha)):
        raise EscalacaoInviavel(_explicar_falta(candidatos))
    escolhidos = [candidatos[c] for c in escolha]
    for j in obrigatorios:
        if j not in escolhidos:
            raise EscalacaoInviavel(
                f"Não deu para colocar {j.nome} entre os titulares junto com os outros "
                "jogadores obrigatórios: as posições deles se atrapalham."
            )
    return escolhidos


def _proxima_janela(
    campo: list[_Jogador],
    linha: list[_Jogador],
    janela: tuple[int, int],
    indice: int,
    duracao: int,
    max_trocas: int,
    anterior: dict[str, str],
    rng: Optional[random.Random] = None,
) -> tuple[list[_Jogador], dict[str, str]]:
    """Decide quem sai e quem entra na janela seguinte (no máximo `max_trocas`)."""
    ids_campo = {j.id for j in campo}
    banco = [j for j in linha if j.id not in ids_campo]

    # Quem é obrigado a sair (estourou o limite de minutos).
    obrigados = [j for j in campo if not j.disponivel(janela, duracao, indice)]
    if len(obrigados) > max_trocas:
        nomes = ", ".join(j.nome for j in obrigados)
        raise EscalacaoInviavel(
            f"No minuto {janela[0]} precisam sair {len(obrigados)} jogadores ({nomes}) "
            f"por limite de minutos, mas só {max_trocas} podem trocar por vez. "
            "Aumente quantos trocam por vez ou relaxe os limites de minutos."
        )
    # Quem não pode sair: grupo fixo / "não sai".
    opcionais = [j for j in campo if j not in obrigados and not j.nao_sai]
    entram_possiveis = [j for j in banco if j.disponivel(janela, duracao, indice)]

    tamanho_janela = janela[1] - janela[0]
    resolucao = max(tamanho_janela / 2, 1)

    def melhor(m: int, ampliar: bool):
        """Melhor combinação de exatamente m trocas, ou None."""
        extra = m - len(obrigados)
        if m > len(entram_possiveis) or extra < 0 or extra > len(opcionais):
            return None
        pool_sai = sorted(opcionais, key=lambda j: -j.acumulado)
        pool_entra = sorted(entram_possiveis, key=lambda j: j.acumulado)
        if not ampliar:
            pool_sai = pool_sai[: extra + 3]
            pool_entra = pool_entra[: m + 3]
        melhor_combo = None
        melhor_chave = None
        for saem_extra in combinations(pool_sai, extra):
            saem = list(obrigados) + list(saem_extra)
            fica = [j for j in campo if j not in saem]
            for entram in combinations(pool_entra, m):
                # Cada troca precisa melhorar o equilíbrio de minutos.
                ganho = sum(j.acumulado for j in saem) - sum(j.acumulado for j in entram)
                if m > len(obrigados) and ganho <= 0:
                    continue
                if not _cabe_chaves(tuple(sorted(j.chave for j in fica + list(entram)))):
                    continue
                # Troca "pura": quem entra joga a função de quem sai.
                puras = _contar_trocas_puras(saem, entram, anterior)
                ruido = rng.uniform(-0.6, 0.6) if rng else 0.0
                chave = (round(ganho / resolucao + ruido), puras, ganho)
                if melhor_chave is None or chave > melhor_chave:
                    melhor_chave, melhor_combo = chave, (saem, list(entram))
        return (melhor_chave, melhor_combo) if melhor_combo else None

    escolha = None
    melhor_geral = None
    for m in range(max(len(obrigados), 1), min(max_trocas, len(entram_possiveis)) + 1):
        achado = melhor(m, ampliar=False) or melhor(m, ampliar=True)
        if achado and (melhor_geral is None or achado[0] > melhor_geral[0]):
            melhor_geral = achado
    if melhor_geral:
        escolha = melhor_geral[1]

    if not escolha:
        if obrigados:
            raise EscalacaoInviavel(
                f"No minuto {janela[0]} não há reserva que possa entrar no lugar de "
                f"{', '.join(j.nome for j in obrigados)} sem deixar uma posição sem jogador."
            )
        return campo, anterior  # ninguém troca nesta janela

    saem, entram = escolha
    novo_campo = [j for j in campo if j not in saem] + entram
    # Ordena estável (mesma ordem de linha) só por previsibilidade.
    lugares = _atribuir_lugares(novo_campo, anterior)
    if lugares is None:  # não deveria acontecer: já testamos o encaixe
        raise EscalacaoInviavel("Não foi possível encaixar os jogadores nas posições.")
    return novo_campo, lugares


def _contar_trocas_puras(
    saem: list[_Jogador], entram: list[_Jogador], anterior: dict[str, str]
) -> int:
    """Quantas trocas dá para fazer 'função por função' (zagueiro por zagueiro...)."""
    funcoes_que_saem = [anterior[j.id][:3] for j in saem]
    puras = 0
    for entrante in entram:
        for f in funcoes_que_saem:
            if f in entrante.funcoes:
                funcoes_que_saem.remove(f)
                puras += 1
                break
    return puras


# ---------------------------------------------------------------------------
# API principal
# ---------------------------------------------------------------------------
def gerar_escalacao(
    jogadores: list[dict],
    goleiro_id: str,
    duracao: int = DURACAO_PADRAO,
    n_substituicoes: int = SUBSTITUICOES_PADRAO,
    trocas_por_vez: int = TROCAS_POR_VEZ_PADRAO,
    regras: Optional[dict[str, dict]] = None,
    restricoes: Optional[list[dict]] = None,
    semente: int = 0,
    qualidade: Optional[dict[str, dict[str, float]]] = None,
    estrategia: str = "uniforme",
    forca: int = 50,
    cortes: Optional[list[int]] = None,
) -> dict[str, Any]:
    """
    Monta a escalação 4-4-2.

    Gera uma tentativa "pura" (sem sorteio) e várias outras com pequenos
    sorteios (a `semente` deixa o resultado reprodutível; mudar a semente dá
    outra escalação igualmente válida). Fica com a mais equilibrada em minutos.

    jogadores: [{"id", "nome", "posicoes": [...]}] — todos os convocados,
               inclusive o goleiro.
    goleiro_id: o goleiro fixo (nunca é trocado).
    regras: por id de jogador — {"minutos_max": int, "so_segundo_tempo": bool,
            "comeca": "titular"|"reserva", "nao_sai": bool, "grupo_fixo": bool,
            "funcao": "ZAG"...}.
    restricoes: ajustes feitos na prévia ("X começa dentro", "Y joga de ZAG"),
            veja `aplicar_restricoes`.

    qualidade: (V2) por id de jogador, a qualidade em cada função (0–1.3),
            já calculada com a tática escolhida — veja `tatica.py`. Sem isto,
            só os minutos importam (comportamento da V1).
    estrategia: "uniforme" | "forca_no_inicio" | "forca_no_final".
    forca: 10–100, quanto a qualidade pesa frente ao equilíbrio de minutos.

    Levanta `EscalacaoInviavel` (mensagem em português) se não houver solução.
    """
    extra = {"qualidade": qualidade, "estrategia": estrategia, "forca": forca, "cortes": cortes}
    # A 1ª tentativa é determinística: se ela não tem solução, o erro dela é
    # o que explica o problema ao usuário.
    melhor = _gerar_uma(
        jogadores, goleiro_id, duracao, n_substituicoes, trocas_por_vez, regras, restricoes, None,
        **extra,
    )
    melhor_nota = _nota(melhor, jogadores, regras, restricoes, qualidade)
    rng = random.Random(semente)
    for _ in range(TENTATIVAS):
        try:
            candidata = _gerar_uma(
                jogadores, goleiro_id, duracao, n_substituicoes, trocas_por_vez,
                regras, restricoes, rng, **extra,
            )
        except EscalacaoInviavel:
            continue  # essa tentativa sorteada não deu certo; as outras seguem
        nota = _nota(candidata, jogadores, regras, restricoes, qualidade)
        if nota < melhor_nota:
            melhor, melhor_nota = candidata, nota
    return melhor


def _diferenca_minutos(resultado: dict, regras: Optional[dict], restricoes: Optional[list]) -> int:
    """Maior diferença de minutos entre jogadores sem regra própria de tempo."""
    regras_finais = aplicar_restricoes(regras, restricoes)
    iguais = []
    for jid, minutos in resultado["minutos"].items():
        regra = regras_finais.get(jid, {})
        if jid == resultado["goleiro_id"] or jid in resultado["reservas_goleiro"]:
            continue
        if any(regra.get(k) for k in ("minutos_max", "so_segundo_tempo", "grupo_fixo")):
            continue
        if regra.get("comeca") == "reserva":
            continue
        iguais.append(minutos)
    return (max(iguais) - min(iguais)) if iguais else 0


def _nota(
    resultado: dict,
    jogadores: list[dict],
    regras: Optional[dict],
    restricoes: Optional[list],
    qualidade: Optional[dict] = None,
) -> tuple:
    """
    Quanto menor, melhor. V1: (diferença de minutos, trocas de função, nº de trocas).
    Com tática: a diferença de minutos conta por "janelas" inteiras e, entre
    as parecidas, vence a de maior qualidade em campo.
    """
    regras_finais = aplicar_restricoes(regras, restricoes)
    iguais = []
    for jid, minutos in resultado["minutos"].items():
        regra = regras_finais.get(jid, {})
        if jid == resultado["goleiro_id"] or jid in resultado["reservas_goleiro"]:
            continue
        # Quem tem regra própria de tempo não entra na conta de equilíbrio.
        if any(regra.get(k) for k in ("minutos_max", "so_segundo_tempo", "grupo_fixo")):
            continue
        if regra.get("comeca") == "reserva":
            continue
        iguais.append(minutos)
    diferenca = (max(iguais) - min(iguais)) if iguais else 0
    if qualidade:
        janela = resultado["duracao"] / max(len(resultado["janelas"]), 1)
        total = 0.0
        for jan in resultado["janelas"]:
            for lugar, jid in jan["lugares"].items():
                total += (jan["fim"] - jan["inicio"]) * qualidade.get(jid, {}).get(lugar[:3], 0.5)
        return (
            round(diferenca / janela),
            -round(total, 2),
            len(resultado["ajustes_de_posicao"]),
            len(resultado["trocas"]),
        )
    return (diferenca, len(resultado["ajustes_de_posicao"]), len(resultado["trocas"]))


def _gerar_uma(
    jogadores: list[dict],
    goleiro_id: str,
    duracao: int,
    n_substituicoes: int,
    trocas_por_vez: int,
    regras: Optional[dict[str, dict]],
    restricoes: Optional[list[dict]],
    rng: Optional[random.Random],
    qualidade: Optional[dict[str, dict[str, float]]] = None,
    estrategia: str = "uniforme",
    forca: int = 50,
    cortes: Optional[list[int]] = None,
    tentativas_busca: int = 1500,
) -> dict[str, Any]:
    """Uma tentativa de escalação (com ou sem sorteio nos desempates)."""
    goleiro_id = str(goleiro_id)
    if cortes is not None:
        n_substituicoes = len(cortes)
    _validar_entrada(jogadores, goleiro_id, duracao, n_substituicoes, trocas_por_vez)
    regras_finais = aplicar_restricoes(regras, restricoes)

    goleiro = next(j for j in jogadores if str(j["id"]) == goleiro_id)
    todos = [
        _Jogador(j, regras_finais.get(str(j["id"]), {}), (qualidade or {}).get(str(j["id"])))
        for j in jogadores
    ]
    # Só entram na rotação quem sabe jogar em alguma função de linha. Quem é
    # só goleiro (o reserva dele) fica no banco sem jogar.
    linha = [j for j in todos if j.id != goleiro_id and j.funcoes]
    reservas_goleiro = [j for j in todos if j.id != goleiro_id and not j.funcoes]

    if len(linha) < len(SLOTS_LINHA):
        raise EscalacaoInviavel(
            f"Convocados insuficientes: há {len(linha)} jogador(es) de linha e são necessários 10."
        )
    # Com todos os convocados dá para formar o time?
    if not _tem_time_possivel(linha):
        raise EscalacaoInviavel(_explicar_falta(linha))

    fixos = [j for j in linha if j.grupo_fixo]
    if len(fixos) > len(SLOTS_LINHA):
        raise EscalacaoInviavel("O grupo que não roda tem mais de 10 jogadores de linha.")

    janelas = janelas_dos_cortes(duracao, cortes) if cortes is not None else montar_janelas(
        duracao, n_substituicoes
    )
    # Na "força no final" os melhores não precisam começar; na "força no
    # início" começar com eles pesa em dobro.
    primeiro = pesos_das_janelas(len(janelas), estrategia)[0]
    peso_q = 8.0 * max(0.0, 1 + 2 * (primeiro - 1)) if qualidade else 0.0
    campo = _escolher_titulares(linha, janelas[0], duracao, rng, peso_q)
    lugares = _atribuir_lugares(campo, {})
    if lugares is None:
        raise EscalacaoInviavel(_explicar_falta(linha))

    # Fase 1 (gulosa): janela por janela, tira quem jogou mais e põe quem jogou menos.
    campos: list[list[_Jogador]] = []
    for indice, janela in enumerate(janelas):
        if indice > 0:
            campo, lugares = _proxima_janela(
                campo, linha, janela, indice, duracao, trocas_por_vez, lugares, rng
            )
        for j in campo:
            j.acumulado += janela[1] - janela[0]
        campos.append(list(campo))

    # Fase 2 (busca local): tenta trocar jogadores de lugar no tempo para
    # deixar os minutos ainda mais parecidos, sem quebrar nenhuma regra.
    pesos = pesos_das_janelas(len(janelas), estrategia) if qualidade else None
    campos = _melhorar(
        campos, linha, janelas, duracao, trocas_por_vez, rng or random.Random(0),
        tentativas=tentativas_busca,
        pesos_janela=pesos, k_qualidade=300.0 if qualidade else 0.0,
        folga_extra=round(forca / 100 * min(j[1] - j[0] for j in janelas)) if qualidade else 0,
    )

    historico: list[dict] = []
    trocas: list[dict] = []
    ajustes: list[dict] = []
    por_id = {j.id: j for j in todos}
    minutos_linha = {j.id: 0 for j in linha}
    anterior: dict[str, str] = {}
    for janela, campo in zip(janelas, campos):
        lugares = _atribuir_lugares(campo, anterior)
        if lugares is None:  # não deveria acontecer: a busca valida o encaixe
            raise EscalacaoInviavel("Não foi possível encaixar os jogadores nas posições.")
        if anterior:
            _registrar_trocas(janela[0], anterior, lugares, por_id, trocas, ajustes)
        for j in campo:
            minutos_linha[j.id] += janela[1] - janela[0]
        historico.append(
            {
                "inicio": janela[0],
                "fim": janela[1],
                "lugares": {"GOL": goleiro_id, **{lugar: jid for jid, lugar in lugares.items()}},
            }
        )
        anterior = lugares

    titulares = [
        {
            "lugar": lugar,
            "funcao": lugar[:3],
            "jogador_id": historico[0]["lugares"][lugar],
            "nome": _nome(jogadores, historico[0]["lugares"][lugar]),
        }
        for lugar in SLOTS
    ]
    ids_titulares = {t["jogador_id"] for t in titulares}
    banco = [
        {"jogador_id": str(j["id"]), "nome": j.get("nome")}
        for j in jogadores
        if str(j["id"]) not in ids_titulares
    ]
    minutos = {str(j["id"]): 0 for j in jogadores}
    minutos[goleiro_id] = duracao
    minutos.update(minutos_linha)

    return {
        "formacao": FORMACAO,
        "duracao": duracao,
        "goleiro_id": goleiro_id,
        "goleiro_nome": goleiro.get("nome"),
        "janelas": historico,
        "titulares": titulares,
        "banco": banco,
        "trocas": trocas,
        "ajustes_de_posicao": ajustes,
        "minutos": minutos,
        "reservas_goleiro": [j.id for j in reservas_goleiro],
    }


# ---------------------------------------------------------------------------
# Fase 2: busca local para equilibrar minutos
# ---------------------------------------------------------------------------
def _plano_valido(
    campos: list[set[str]],
    por_id: dict[str, _Jogador],
    janelas: list[tuple[int, int]],
    duracao: int,
    max_trocas: int,
) -> bool:
    """Confere todas as regras de um plano (um conjunto de 10 por janela)."""
    for i, ids in enumerate(campos):
        if not _cabe_chaves(tuple(sorted(por_id[j].chave for j in ids))):
            return False
        if i and len(ids - campos[i - 1]) > max_trocas:
            return False
    total = len(janelas)
    for jid, j in por_id.items():
        presentes = [i for i, ids in enumerate(campos) if jid in ids]
        if j.grupo_fixo and len(presentes) != total:
            return False
        if j.comeca == "titular" and (not presentes or presentes[0] != 0):
            return False
        if j.comeca == "reserva" and presentes and presentes[0] == 0:
            return False
        if j.so_segundo_tempo and any(janelas[i][0] < duracao / 2 for i in presentes):
            return False
        if j.minutos_max is not None and (
            sum(janelas[i][1] - janelas[i][0] for i in presentes) > j.minutos_max
        ):
            return False
        if j.nao_sai and presentes and presentes != list(range(presentes[0], total)):
            return False
    return True


def _melhorar(
    campos_ini: list[list[_Jogador]],
    linha: list[_Jogador],
    janelas: list[tuple[int, int]],
    duracao: int,
    max_trocas: int,
    rng: random.Random,
    tentativas: int = 1500,
    pesos_janela: Optional[list[float]] = None,
    k_qualidade: float = 0.0,
    folga_extra: int = 0,
) -> list[list[_Jogador]]:
    """
    Busca local: troca "a sai, b entra" durante um trecho de janelas e fica com
    a mudança se o plano continuar válido e os minutos ficarem mais parecidos.
    """
    por_id = {j.id: j for j in linha}
    campos = [{j.id for j in c} for c in campos_ini]
    tamanho = [fim - ini for ini, fim in janelas]
    # Quem tem regra própria de tempo não entra na conta de equilíbrio.
    equilibrar = [
        j.id
        for j in linha
        if not (j.minutos_max is not None or j.so_segundo_tempo or j.grupo_fixo or j.comeca == "reserva")
    ]
    if len(equilibrar) < 2 or len(janelas) < 2:
        return campos_ini

    def minutos(plano: list[set[str]]) -> dict[str, int]:
        m = {jid: 0 for jid in por_id}
        for ids, t in zip(plano, tamanho):
            for jid in ids:
                m[jid] += t
        return m

    def custo(plano: list[set[str]]) -> float:
        m = minutos(plano)
        quadrados = sum(m[jid] ** 2 for jid in equilibrar)
        entradas = sum(len(plano[i] - plano[i - 1]) for i in range(1, len(plano)))
        ganho_q = 0.0
        if k_qualidade and pesos_janela:
            ganho_q = k_qualidade * sum(
                t * p * sum(por_id[j].qmax for j in ids)
                for ids, t, p in zip(plano, tamanho, pesos_janela)
            )
        return quadrados + 0.001 * entradas - ganho_q

    atual = custo(campos)
    sem_melhora = 0
    # Com tática, a qualidade só reorganiza QUEM fica no banco e QUANDO: a
    # diferença de minutos entre os jogadores não pode passar da que já havia
    # (mais uma pequena folga), para continuar todo mundo jogando o mesmo.
    m0 = minutos(campos)
    limite_folga = max(m0[j] for j in equilibrar) - min(m0[j] for j in equilibrar) + folga_extra
    for _ in range(tentativas):
        m = minutos(campos)
        folga = max(m[j] for j in equilibrar) - min(m[j] for j in equilibrar)
        if folga <= min(tamanho) and sem_melhora > 200 and not k_qualidade:
            break
        if k_qualidade and sem_melhora > 350:
            break
        novo = None
        if k_qualidade and len(campos) > 1 and rng.random() < 0.5:
            # Troca de "horários": a joga onde b ia jogar e b onde a ia jogar.
            # Os minutos de cada um quase não mudam; só muda QUANDO cada um joga.
            w1, w2 = rng.sample(range(len(campos)), 2)
            a_opcoes = list(campos[w1] - campos[w2])
            b_opcoes = list(campos[w2] - campos[w1])
            if a_opcoes and b_opcoes:
                a, b = rng.choice(a_opcoes), rng.choice(b_opcoes)
                novo = [set(c) for c in campos]
                novo[w1].remove(a)
                novo[w1].add(b)
                novo[w2].remove(b)
                novo[w2].add(a)
        if novo is None:
            w = rng.randrange(len(campos))
            saem = list(campos[w])
            entram = [jid for jid in por_id if jid not in campos[w]]
            if not entram:
                break
            a, b = rng.choice(saem), rng.choice(entram)
            lo = hi = w
            while lo > 0 and a in campos[lo - 1] and b not in campos[lo - 1]:
                lo -= 1
            while hi < len(campos) - 1 and a in campos[hi + 1] and b not in campos[hi + 1]:
                hi += 1
            lo, hi = rng.randint(lo, w), rng.randint(w, hi)
            novo = [set(c) for c in campos]
            for i in range(lo, hi + 1):
                novo[i].remove(a)
                novo[i].add(b)
        valor = custo(novo)
        if k_qualidade:
            mn = minutos(novo)
            if max(mn[j] for j in equilibrar) - min(mn[j] for j in equilibrar) > limite_folga:
                sem_melhora += 1
                continue
        if valor < atual - 1e-9 and _plano_valido(novo, por_id, janelas, duracao, max_trocas):
            campos, atual, sem_melhora = novo, valor, 0
        else:
            sem_melhora += 1
    return [[por_id[jid] for jid in sorted(ids)] for ids in campos]


def _nome(jogadores: list[dict], jogador_id: str) -> Optional[str]:
    return next((j.get("nome") for j in jogadores if str(j["id"]) == jogador_id), None)


def _tem_time_possivel(linha: list[_Jogador]) -> bool:
    """Existe alguma escolha de 10 entre `linha` que preencha todos os lugares?"""
    custo = [
        [0 if lugar[:3] in j.funcoes else _PROIBIDO for j in linha] for lugar in SLOTS_LINHA
    ]
    escolha = _hungaro(custo)
    return all(custo[i][c] < _PROIBIDO for i, c in enumerate(escolha))


def _registrar_trocas(
    minuto: int,
    anterior: dict[str, str],
    atual: dict[str, str],
    por_id: dict[str, _Jogador],
    trocas: list[dict],
    ajustes: list[dict],
) -> None:
    """Escreve as substituições (sai/entra) e mudanças de função desta janela."""
    saem = [jid for jid in anterior if jid not in atual]
    entram = [jid for jid in atual if jid not in anterior]
    restantes = list(saem)
    for jid in entram:
        funcao = atual[jid][:3]
        # Prefere casar com quem saiu da mesma função (zagueiro por zagueiro).
        par = next((s for s in restantes if anterior[s][:3] == funcao), None) or restantes[0]
        restantes.remove(par)
        trocas.append(
            {
                "minuto": minuto,
                "sai": par,
                "sai_nome": por_id[par].nome,
                "entra": jid,
                "entra_nome": por_id[jid].nome,
                "funcao": funcao,
                "lugar": atual[jid],
            }
        )
    for jid, lugar in atual.items():
        if jid in anterior and anterior[jid][:3] != lugar[:3]:
            ajustes.append(
                {
                    "minuto": minuto,
                    "jogador_id": jid,
                    "nome": por_id[jid].nome,
                    "de": anterior[jid][:3],
                    "para": lugar[:3],
                }
            )


# ---------------------------------------------------------------------------
# Modo automático: o computador escolhe quando trocar e quantos trocam
# ---------------------------------------------------------------------------
def _cortes_uniformes(duracao: int, n_janelas: int) -> list[int]:
    """Janelas iguais, com o tamanho arredondado PARA CIMA (sobra um pedaço no fim)."""
    tamanho = -(-duracao // n_janelas)  # teto
    return [c for c in range(tamanho, duracao, tamanho)]


def _cortes_ciclicos(n_linha: int, duracao: int) -> list[int]:
    """
    Minutos de troca de um rodízio em que cada um fica no banco o mesmo tempo.

    Cada vaga do banco é uma "pista" de `duracao` minutos; os jogadores
    sentam um depois do outro, cada um por `duracao * banco / n_linha`
    minutos. Os minutos em que alguém senta/levanta viram as trocas, sempre
    arredondados para cima (por causa do acréscimo).
    """
    banco = n_linha - len(SLOTS_LINHA)
    if banco <= 0:
        return []
    passo = duracao * banco / n_linha
    cortes = set()
    for k in range(1, n_linha):
        t = (k * passo) % duracao
        corte = math.ceil(t - 1e-9)
        if 0 < corte < duracao:
            cortes.add(corte)
    return sorted(cortes)


def _quantos_de_linha(jogadores: list[dict], goleiro_id: str) -> int:
    return sum(
        1
        for j in jogadores
        if str(j["id"]) != str(goleiro_id)
        and [f for f in funcoes_do_jogador(j.get("posicoes", [])) if f != "GOL"]
    )


def gerar_automatico(
    jogadores: list[dict],
    goleiro_id: str,
    duracao: int = DURACAO_PADRAO,
    regras: Optional[dict[str, dict]] = None,
    restricoes: Optional[list[dict]] = None,
    semente: int = 0,
    qualidade: Optional[dict[str, dict[str, float]]] = None,
    estrategia: str = "uniforme",
    forca: int = 50,
) -> dict[str, Any]:
    """
    Como `gerar_escalacao`, mas sem o usuário dizer quantas substituições nem
    quantos trocam por vez: testa vários jeitos e fica com o que deixa todo
    mundo jogando o mesmo tempo (com poucas diferenças de 1–2 minutos) e,
    entre os parecidos, o que tem menos trocas.

    O resultado ganha `plano`: {"n_substituicoes", "trocas_por_vez", "cortes"}.
    """
    goleiro_id = str(goleiro_id)
    n_linha = _quantos_de_linha(jogadores, goleiro_id)
    banco = max(n_linha - len(SLOTS_LINHA), 0)
    if banco == 0:
        # Sem reservas de linha, não há o que trocar.
        candidatos_cortes: list[list[int]] = [[]]
    else:
        candidatos_cortes = []
        vistos = set()
        opcoes = [_cortes_ciclicos(n_linha, duracao)]
        opcoes += [_cortes_uniformes(duracao, w) for w in range(2, 13)]
        for cortes in opcoes:
            if tuple(cortes) not in vistos and cortes and min(
                b - a for a, b in zip([0] + cortes, cortes + [duracao])
            ) >= 3:
                vistos.add(tuple(cortes))
                candidatos_cortes.append(cortes)
    maximos = list(range(1, min(max(banco, 1), 5) + 1))
    comuns = dict(qualidade=qualidade, estrategia=estrategia, forca=forca)

    def chave(res: dict) -> tuple:
        # Só usa os 3 primeiros números da nota (minutos, ajustes, trocas).
        diferenca, ajustes, trocas = _nota(res, jogadores, regras, None)[:3] if not qualidade else (
            _diferenca_minutos(res, regras, restricoes), len(res["ajustes_de_posicao"]), len(res["trocas"])
        )
        valor = 0.0
        if qualidade:
            pesos = pesos_das_janelas(len(res["janelas"]), estrategia)
            for peso, jan in zip(pesos, res["janelas"]):
                for lugar, jid in jan["lugares"].items():
                    valor += (jan["fim"] - jan["inicio"]) * peso * qualidade.get(jid, {}).get(lugar[:3], 0.5)
        # 1º: tempo igual (tolerância de 2 min); 2º: qualidade; 3º: poucas trocas.
        return (max(diferenca - 2, 0), -round(valor / 5), trocas, diferenca, ajustes)

    # 1) Triagem rápida: uma tentativa de cada combinação.
    triagem = []
    ultimo_erro: Optional[EscalacaoInviavel] = None
    for cortes in candidatos_cortes:
        for maximo in maximos:
            try:
                res = _gerar_uma(
                    jogadores, goleiro_id, duracao, len(cortes), maximo, regras, restricoes,
                    None, cortes=cortes, tentativas_busca=400, **comuns,
                )
            except EscalacaoInviavel as erro:
                ultimo_erro = erro
                continue
            triagem.append((chave(res), cortes, maximo))
    if not triagem:
        raise ultimo_erro or EscalacaoInviavel("Não foi possível montar a escalação.")
    triagem.sort(key=lambda x: (x[0], len(x[1]), x[2]))

    # 2) As melhores passam pelo gerador completo (várias tentativas).
    melhor = None
    melhor_chave = None
    for _, cortes, maximo in triagem[:3]:
        try:
            res = gerar_escalacao(
                jogadores, goleiro_id, duracao, len(cortes), maximo, regras, restricoes,
                semente, cortes=cortes, **comuns,
            )
        except EscalacaoInviavel:
            continue
        k = chave(res)
        if melhor_chave is None or k < melhor_chave:
            melhor, melhor_chave = res, k
            melhor["plano"] = {
                "n_substituicoes": len(cortes),
                "trocas_por_vez": maximo,
                "cortes": cortes,
            }
    if melhor is None:
        raise ultimo_erro or EscalacaoInviavel("Não foi possível montar a escalação.")
    return melhor
