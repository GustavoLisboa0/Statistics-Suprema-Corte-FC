"""
Escalador automático (4-4-2) — rotas.

Toda a lógica de montar o time está em `escalacao.py` (funções puras). Aqui
só buscamos os dados (presença, jogadores, punições, lesões), chamamos o
escalador e guardamos/devolvemos o resultado.

Quem gera e salva é só o editor (admin); qualquer usuário logado pode ver a
escalação já salva.
"""

from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import exige_editor, usuario_atual
from database import supabase
from escalacao import (
    DURACAO_PADRAO,
    SUBSTITUICOES_PADRAO,
    TROCAS_POR_VEZ_PADRAO,
    EscalacaoInviavel,
    FORMACOES,
    avisos_de_igualdade,
    gerar_automatico,
    gerar_escalacao,
    sugerir_fixos,
)
from models import lesao_ativa, punicao_ativa
import tatica as tt
from routers.atributos import achar_adversario, carregar_atributos

router = APIRouter(prefix="/partidas", tags=["Escalação"])

TABLE = "escalacoes"

FuncaoLinha = Literal["ZAG", "LAT", "VOL", "MEI", "ATA"]


class RegraJogador(BaseModel):
    """Regras opcionais de um jogador na escalação."""

    minutos_max: Optional[int] = Field(default=None, ge=1, le=120)  # "só X minutos"
    so_segundo_tempo: bool = False  # "entra só no 2º tempo"
    comeca: Optional[Literal["titular", "reserva"]] = None
    nao_sai: bool = False  # "não sai" depois que entra
    grupo_fixo: bool = False  # grupo que não roda: começa e fica o jogo todo
    funcao: Optional[FuncaoLinha] = None


class Restricao(BaseModel):
    """Ajuste feito na prévia: 'X começa dentro/fora', 'Y joga na função Z'."""

    jogador_id: UUID
    tipo: Literal["comeca_dentro", "comeca_fora", "funcao"]
    funcao: Optional[FuncaoLinha] = None


class MudancaFormacao(BaseModel):
    """Troca de formação durante o jogo (ex.: aos 60 min vai para o 4-5-1)."""

    minuto: int = Field(ge=1, le=119)
    formacao: str


class RegraComposicao(BaseModel):
    """
    Regra de composição do administrador. Ex.: nos volantes, um rápido e um
    lento -> {funcao: "VOL", tipo: "atributo", chave: "pace", modo: "misto"}.
    """

    funcao: FuncaoLinha
    tipo: Literal["atributo", "carac"] = "atributo"
    chave: str
    modo: str


class GerarPayload(BaseModel):
    goleiro_id: UUID
    # Ajustes manuais sobre a lista padrão (confirmados sem punição/lesão).
    incluir: list[UUID] = []
    remover: list[UUID] = []
    duracao: int = Field(default=DURACAO_PADRAO, ge=10, le=120)
    # Automático (padrão): o computador escolhe quando trocar e quantos trocam
    # por vez, para todo mundo jogar o mesmo tempo. Desligado: vale o que veio abaixo.
    automatico: bool = True
    n_substituicoes: int = Field(default=SUBSTITUICOES_PADRAO, ge=0, le=20)
    trocas_por_vez: int = Field(default=TROCAS_POR_VEZ_PADRAO, ge=1, le=10)
    # Quanto o computador pode mexer nas trocas (modo automático).
    intervalo_minimo: int = Field(default=10, ge=3, le=45)  # minutos entre uma troca e outra
    tolerancia_minutos: int = Field(default=5, ge=0, le=30)  # diferença de tempo aceita
    max_momentos: Optional[int] = Field(default=None, ge=0, le=20)
    max_trocas_por_vez: Optional[int] = Field(default=None, ge=1, le=10)
    quantos_fixos: int = Field(default=0, ge=0, le=5)  # jogadores que ficam o jogo todo
    # Formação (4-4-2 por padrão) e mudanças durante o jogo.
    formacao: str = "4-4-2"
    mudancas_formacao: list[MudancaFormacao] = []
    # Regras de composição (ex.: 2 volantes, 1 rápido e 1 lento) — só admin.
    composicao: list[RegraComposicao] = []
    # V2 (só admin): tática e estratégia mudam quem joga mais e onde.
    tatica: Optional[str] = None
    estrategia: str = "uniforme"
    forca_tatica: int = Field(default=50, ge=10, le=100)
    regras: dict[UUID, RegraJogador] = {}
    restricoes: list[Restricao] = []
    # Muda a semente para pedir "outra opção" igualmente válida.
    semente: int = 0


class SalvarPayload(BaseModel):
    config: dict
    resultado: dict


# ---------------------------------------------------------------------------
# Convocados
# ---------------------------------------------------------------------------
def _partida_ou_404(partida_id: UUID) -> dict:
    resposta = supabase.table("partidas").select("*").eq("id", str(partida_id)).execute()
    if not resposta.data:
        raise HTTPException(status_code=404, detail="Partida não encontrada")
    return resposta.data[0]


def _motivo_bloqueio(jogador_id: str, partida: dict, punicoes: list, lesoes: list) -> str | None:
    """Mesmas regras de routers/presenca.py, mas com dados já carregados."""
    if any(p["jogador_id"] == jogador_id and punicao_ativa(p) for p in punicoes):
        return "punição ativa"
    for lesao in (l for l in lesoes if l["jogador_id"] == jogador_id):
        if lesao["tipo"] == "proximo_jogo":
            if lesao.get("partida_id") == str(partida["id"]) and lesao_ativa(
                lesao, partida.get("status")
            ):
                return "lesão"
        elif lesao_ativa(lesao) and (lesao.get("termina_em") or "") >= partida.get("data", ""):
            return "lesão"
    return None


def _resumo(jogador: dict, presenca: dict | None = None) -> dict:
    posicoes = list(jogador.get("posicoes") or [])
    # A posição que a pessoa escolheu ao confirmar presença vem primeiro.
    escolhida = (presenca or {}).get("posicao")
    if escolhida:
        posicoes = [escolhida] + [p for p in posicoes if p != escolhida]
    return {
        "id": jogador["id"],
        "nome": jogador.get("apelido") or jogador["nome"],
        "nome_completo": jogador["nome"],
        "numero_camisa": jogador.get("numero_camisa"),
        "posicoes": posicoes,
    }


def _carregar_convocados(partida: dict) -> dict:
    jogadores = supabase.table("jogadores").select("*").order("nome").execute().data or []
    por_id = {j["id"]: j for j in jogadores}
    presencas = (
        supabase.table("presenca").select("*").eq("partida_id", str(partida["id"])).execute().data
        or []
    )
    punicoes = supabase.table("punicoes").select("*").execute().data or []
    lesoes = supabase.table("lesoes").select("*").execute().data or []

    convocados, bloqueados = [], []
    ids_confirmados = set()
    for p in presencas:
        j = por_id.get(p["jogador_id"])
        if p["status"] != "confirmado" or not j:
            continue
        ids_confirmados.add(j["id"])
        motivo = _motivo_bloqueio(j["id"], partida, punicoes, lesoes)
        if not j.get("ativo", True):
            motivo = "jogador inativo"
        if motivo:
            bloqueados.append({**_resumo(j, p), "motivo": motivo})
        else:
            convocados.append(_resumo(j, p))

    outros = [
        _resumo(j) for j in jogadores if j.get("ativo", True) and j["id"] not in ids_confirmados
    ]
    return {"convocados": convocados, "bloqueados": bloqueados, "outros_ativos": outros}


@router.get("/{partida_id}/escalacao/convocados")
def listar_convocados(partida_id: UUID, usuario: dict = Depends(exige_editor)):
    """Ponto de partida do passo 'convocados': presença confirmada, já filtrada."""
    return _carregar_convocados(_partida_ou_404(partida_id))


# ---------------------------------------------------------------------------
# Gerar (prévia, não salva)
# ---------------------------------------------------------------------------
@router.post("/{partida_id}/escalacao/gerar")
def gerar(partida_id: UUID, payload: GerarPayload, usuario: dict = Depends(exige_editor)):
    partida = _partida_ou_404(partida_id)
    dados = _carregar_convocados(partida)

    todos = {j["id"]: j for j in dados["convocados"] + dados["bloqueados"] + dados["outros_ativos"]}
    ids = [j["id"] for j in dados["convocados"]]
    for jid in map(str, payload.incluir):
        if jid not in todos:
            raise HTTPException(status_code=404, detail="Jogador a incluir não encontrado (ou inativo)")
        if jid not in ids:
            ids.append(jid)
    remover = {str(j) for j in payload.remover}
    ids = [i for i in ids if i not in remover]

    goleiro_id = str(payload.goleiro_id)
    if goleiro_id not in ids:
        raise HTTPException(status_code=422, detail="O goleiro escolhido não está entre os convocados")

    convocados = [todos[i] for i in ids]

    if payload.tatica is not None and payload.tatica not in tt.TATICAS:
        raise HTTPException(status_code=422, detail="Tática desconhecida")
    if payload.estrategia not in tt.ESTRATEGIAS:
        raise HTTPException(status_code=422, detail="Estratégia desconhecida")
    if payload.formacao not in FORMACOES or any(
        m.formacao not in FORMACOES for m in payload.mudancas_formacao
    ):
        raise HTTPException(status_code=422, detail="Formação desconhecida")
    for r in payload.composicao:
        modos = tt.MODOS_ATRIBUTO if r.tipo == "atributo" else tt.MODOS_CARACTERISTICA
        chaves = tt.ATRIBUTOS if r.tipo == "atributo" else tt.CARACTERISTICAS
        if r.modo not in modos or r.chave not in chaves:
            raise HTTPException(status_code=422, detail="Regra de composição inválida")
    precisa_perfis = bool(payload.tatica or payload.composicao or payload.quantos_fixos)
    atributos = carregar_atributos() if precisa_perfis else {}
    qualidade = None
    if payload.tatica:
        qualidade = {
            j["id"]: {
                f: tt.qualidade(
                    atributos.get(j["id"]),
                    f,
                    payload.tatica,
                    (atributos.get(j["id"]) or {}).get("caracteristicas"),
                )
                / 100
                for f in tt.PESOS_FUNCAO
                if f != "GOL"
            }
            for j in convocados
        }
    perfis = {
        j["id"]: {
            "attr": {k: (atributos.get(j["id"]) or {}).get(k) for k in tt.ATRIBUTOS},
            "carac": (atributos.get(j["id"]) or {}).get("caracteristicas") or [],
        }
        for j in convocados
    }

    comuns = dict(
        duracao=payload.duracao,
        regras={str(k): v.model_dump(exclude_none=True) for k, v in payload.regras.items()},
        restricoes=[r.model_dump(mode="json", exclude_none=True) for r in payload.restricoes],
        semente=payload.semente,
        qualidade=qualidade,
        estrategia=payload.estrategia,
        forca=payload.forca_tatica,
        formacao=payload.formacao,
        mudancas_formacao=[m.model_dump() for m in payload.mudancas_formacao],
        perfis=perfis,
        composicao=[r.model_dump() for r in payload.composicao],
    )
    automaticas = dict(
        intervalo_minimo=payload.intervalo_minimo,
        tolerancia=payload.tolerancia_minutos,
        max_momentos=payload.max_momentos,
        max_trocas=payload.max_trocas_por_vez,
    )
    try:
        if payload.automatico:
            resultado = gerar_automatico(
                convocados, goleiro_id, quantos_fixos=payload.quantos_fixos, **comuns, **automaticas
            )
        else:
            resultado = gerar_escalacao(
                convocados,
                goleiro_id,
                n_substituicoes=payload.n_substituicoes,
                trocas_por_vez=payload.trocas_por_vez,
                **comuns,
            )
    except EscalacaoInviavel as erro:
        raise HTTPException(status_code=422, detail=str(erro))

    # Dados públicos de cada convocado (nome, camisa, posições) vão junto no
    # resultado: assim a tela e o PDF mostram a escalação salva sem buscar
    # mais nada — e quem só visualiza não depende de outras rotas.
    resultado["jogadores"] = {
        j["id"]: {
            "nome": j["nome"],
            "nome_completo": j["nome_completo"],
            "numero_camisa": j["numero_camisa"],
            "posicoes": j["posicoes"],
        }
        for j in convocados
    }

    resposta = {
        "partida_id": str(partida_id),
        "convocados": convocados,
        "config": payload.model_dump(mode="json"),
        "resultado": resultado,
    }
    # Informações do plano de jogo que VÃO para o PDF (só nomes e ideias, sem
    # notas de atributos nem a análise interna).
    plano_de_jogo = {
        "tatica": tt.TATICAS[payload.tatica]["nome"] if payload.tatica else None,
        "tatica_descricao": tt.TATICAS[payload.tatica]["descricao"] if payload.tatica else None,
        "estrategia": tt.ESTRATEGIAS[payload.estrategia]["nome"] if payload.tatica else None,
        "estrategia_descricao": (
            tt.ESTRATEGIAS[payload.estrategia]["descricao"] if payload.tatica else None
        ),
        "regras": [_texto_regra(r) for r in payload.composicao],
    }
    resultado["plano_de_jogo"] = plano_de_jogo
    resposta["resultado"] = resultado
    resposta["avisos"] = avisos_de_igualdade(
        convocados,
        goleiro_id,
        payload.duracao,
        comuns["regras"],
        comuns["restricoes"],
        payload.formacao,
        comuns["mudancas_formacao"],
    )
    if payload.automatico and payload.quantos_fixos == 0:
        try:
            dica = sugerir_fixos(convocados, goleiro_id, resultado, **comuns, **automaticas)
        except EscalacaoInviavel:
            dica = None
        resposta["dica_fixos"] = dica
    if payload.tatica:
        # Análise interna: só vai nesta resposta do admin; nunca é salva no
        # resultado nem vai para o PDF.
        resposta["analise"] = tt.analisar(
            resultado, {jid: atributos.get(jid) or {} for jid in resultado["jogadores"]}, payload.tatica
        )
    return resposta


def _texto_regra(r: RegraComposicao) -> str:
    """Frase simples para uma regra de composição (vai no plano de jogo)."""
    funcao = {"ZAG": "Zagueiros", "LAT": "Laterais", "VOL": "Volantes", "MEI": "Meias", "ATA": "Atacantes"}[
        r.funcao
    ]
    if r.tipo == "atributo":
        nome = tt.ATRIBUTO_NOMES[r.chave].lower()
        frase = {
            "misto": f"um com mais {nome} e outro com menos",
            "altos": f"todos com muita {nome}",
            "baixos": f"todos com {nome} mais baixa",
        }[r.modo]
        return f"{funcao}: {frase}."
    nome = tt.CARACTERISTICAS[r.chave].lower()
    frase = {
        "pelo_menos_um": f"pelo menos um que seja {nome}",
        "todos": f"todos com a característica \"{nome}\"",
        "nenhum": f"ninguém com a característica \"{nome}\"",
    }[r.modo]
    return f"{funcao}: {frase}."


# ---------------------------------------------------------------------------
# Contra-estratégia (só admin)
# ---------------------------------------------------------------------------
@router.get("/{partida_id}/escalacao/contra-estrategia")
def contra_estrategia(partida_id: UUID, usuario: dict = Depends(exige_editor)):
    """Sugere tática e estratégia segundo o perfil e o histórico do adversário."""
    partida = _partida_ou_404(partida_id)
    nome = partida.get("adversario") or ""
    perfil = achar_adversario(nome)
    todas = supabase.table("partidas").select("*").execute().data or []
    anteriores = [
        p
        for p in todas
        if p["id"] != partida["id"] and (p.get("adversario") or "").strip().lower() == nome.strip().lower()
    ]
    historico = tt.resumir_historico(anteriores)
    if not perfil and not historico["jogos"]:
        return {
            "adversario": nome,
            "perfil": None,
            "historico": historico,
            "sugestao": None,
            "aviso": "Ainda não há dados deste adversário. Cadastre o perfil dele para receber uma sugestão.",
        }
    sugestao = tt.sugerir_contra_estrategia(perfil or {}, historico)
    sugestao["tatica_nome"] = tt.TATICAS[sugestao["tatica"]]["nome"]
    sugestao["estrategia_nome"] = tt.ESTRATEGIAS[sugestao["estrategia"]]["nome"]
    sugestao["formacoes"] = tt.sugerir_formacoes(sugestao["tatica"])
    return {
        "adversario": nome,
        "perfil": perfil,
        "historico": historico,
        "sugestao": sugestao,
        "aviso": None,
    }


# ---------------------------------------------------------------------------
# Salvar / ler
# ---------------------------------------------------------------------------
def _salva_ou_none(partida_id: UUID) -> dict | None:
    achadas = supabase.table(TABLE).select("*").eq("partida_id", str(partida_id)).execute().data
    return achadas[0] if achadas else None


def _checar_resultado(corpo: SalvarPayload) -> None:
    resultado = corpo.resultado
    if not isinstance(resultado.get("titulares"), list) or not isinstance(
        resultado.get("janelas"), list
    ):
        raise HTTPException(status_code=422, detail="Resultado de escalação inválido")


@router.post("/{partida_id}/escalacao", status_code=201)
def salvar(partida_id: UUID, corpo: SalvarPayload, usuario: dict = Depends(exige_editor)):
    _partida_ou_404(partida_id)
    _checar_resultado(corpo)
    if _salva_ou_none(partida_id):
        raise HTTPException(
            status_code=409, detail="Esta partida já tem escalação salva; use PUT para atualizar"
        )
    linha = {
        "partida_id": str(partida_id),
        "formacao": corpo.resultado.get("formacao", "4-4-2"),
        "config": corpo.config,
        "resultado": corpo.resultado,
        "criado_por": usuario["id"],
    }
    return supabase.table(TABLE).insert(linha).execute().data[0]


@router.put("/{partida_id}/escalacao")
def atualizar(partida_id: UUID, corpo: SalvarPayload, usuario: dict = Depends(exige_editor)):
    _partida_ou_404(partida_id)
    _checar_resultado(corpo)
    existente = _salva_ou_none(partida_id)
    if not existente:
        raise HTTPException(status_code=404, detail="Esta partida ainda não tem escalação salva")
    mudancas = {
        "formacao": corpo.resultado.get("formacao", "4-4-2"),
        "config": corpo.config,
        "resultado": corpo.resultado,
    }
    return supabase.table(TABLE).update(mudancas).eq("id", existente["id"]).execute().data[0]


@router.get("/{partida_id}/escalacao")
def obter(partida_id: UUID, usuario: dict = Depends(usuario_atual)):
    salva = _salva_ou_none(partida_id)
    if not salva:
        raise HTTPException(status_code=404, detail="Esta partida ainda não tem escalação salva")
    if usuario.get("papel") != "editor":
        # Quem só visualiza não recebe tática/estratégia usadas na geração.
        salva = {**salva, "config": {}}
    return salva
