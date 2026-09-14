"""
Integração com a Open-Meteo (https://open-meteo.com) — sem chave de API,
gratuita, cobre previsão e clima real (histórico) horário pra qualquer
coordenada.

Sempre fixo em Curitiba (o time só joga aí); busca o clima pro horário
exato da partida, arredondado pra hora mais próxima (a API só dá dados de
hora em hora).

Jogo no futuro: usa o endpoint de previsão, com % de chance de chuva.
Jogo no passado: usa o clima que realmente ocorreu (o próprio endpoint de
previsão já cobre até ~93 dias atrás; antes disso cai pro arquivo histórico
dedicado, que cobre desde 1940) — com mm de chuva medidos, que faz mais
sentido que "% de chance" pra algo que já aconteceu.
"""

from datetime import date, datetime, time

import httpx

CURITIBA_LAT = -25.4284
CURITIBA_LON = -49.2733

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# Códigos de tempo WMO usados pela Open-Meteo.
WEATHER_CODES = {
    0: "Céu limpo",
    1: "Predominantemente limpo",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Nevoeiro",
    48: "Nevoeiro com geada",
    51: "Garoa fraca",
    53: "Garoa moderada",
    55: "Garoa forte",
    56: "Garoa congelante fraca",
    57: "Garoa congelante forte",
    61: "Chuva fraca",
    63: "Chuva moderada",
    65: "Chuva forte",
    66: "Chuva congelante fraca",
    67: "Chuva congelante forte",
    71: "Neve fraca",
    73: "Neve moderada",
    75: "Neve forte",
    77: "Grãos de neve",
    80: "Pancadas de chuva fracas",
    81: "Pancadas de chuva moderadas",
    82: "Pancadas de chuva fortes",
    85: "Pancadas de neve fracas",
    86: "Pancadas de neve fortes",
    95: "Tempestade",
    96: "Tempestade com granizo fraco",
    99: "Tempestade com granizo forte",
}


def descricao_condicao(codigo: int) -> str:
    return WEATHER_CODES.get(codigo, "Condição desconhecida")


def hora_mais_proxima(horario: time) -> str:
    """Arredonda pra hora cheia mais próxima, no formato 'HH:00' da API."""
    hora = horario.hour
    if horario.minute >= 30:
        hora = (hora + 1) % 24
    return f"{hora:02d}:00"


def indice_da_hora(corpo: dict, data_partida: date, horario_partida: time) -> int | None:
    """Acha, na resposta da API, o índice da hora mais próxima do horário do jogo."""
    horas = corpo.get("hourly", {}).get("time", [])
    alvo = f"{data_partida.isoformat()}T{hora_mais_proxima(horario_partida)}"
    if alvo not in horas:
        return None
    return horas.index(alvo)


def _requisitar(url: str, campos: str, data_partida: date) -> dict | None:
    try:
        resposta = httpx.get(
            url,
            params={
                "latitude": CURITIBA_LAT,
                "longitude": CURITIBA_LON,
                "hourly": campos,
                "timezone": "America/Sao_Paulo",
                "start_date": data_partida.isoformat(),
                "end_date": data_partida.isoformat(),
            },
            timeout=10,
        )
        if resposta.status_code != 200:
            return None
        return resposta.json()
    except httpx.HTTPError:
        return None


def _buscar_previsao(data_partida: date, horario_partida: time) -> dict | None:
    """Jogo no futuro: previsão, com % de chance de chuva."""
    corpo = _requisitar(
        FORECAST_URL, "temperature_2m,precipitation_probability,weathercode,windspeed_10m", data_partida
    )
    if not corpo:
        return None
    i = indice_da_hora(corpo, data_partida, horario_partida)
    if i is None:
        return None
    return {
        "temperatura": corpo["hourly"]["temperature_2m"][i],
        "condicao": descricao_condicao(corpo["hourly"]["weathercode"][i]),
        "chance_chuva": corpo["hourly"]["precipitation_probability"][i],
        "chuva_mm": None,
        "vento": corpo["hourly"]["windspeed_10m"][i],
        "atualizado_em": datetime.now().isoformat(),
        "fonte": "previsao",
    }


def _buscar_historico(data_partida: date, horario_partida: time) -> dict | None:
    """
    Jogo no passado: clima real, com mm de chuva medidos.

    Tenta primeiro o próprio endpoint de previsão (cobre dado observado até
    ~93 dias atrás); se a data for mais antiga, cai pro arquivo histórico
    dedicado (ERA5).
    """
    for url in (FORECAST_URL, ARCHIVE_URL):
        corpo = _requisitar(url, "temperature_2m,precipitation,weathercode,windspeed_10m", data_partida)
        if not corpo:
            continue
        i = indice_da_hora(corpo, data_partida, horario_partida)
        if i is None:
            continue
        return {
            "temperatura": corpo["hourly"]["temperature_2m"][i],
            "condicao": descricao_condicao(corpo["hourly"]["weathercode"][i]),
            "chance_chuva": None,
            "chuva_mm": corpo["hourly"]["precipitation"][i],
            "vento": corpo["hourly"]["windspeed_10m"][i],
            "atualizado_em": datetime.now().isoformat(),
            "fonte": "historico",
        }
    return None


def buscar_clima(data_partida: date, horario_partida: time) -> dict | None:
    """
    Busca o clima de Curitiba pro horário da partida — previsão se ainda não
    aconteceu, real (histórico) se já aconteceu.

    Devolve None (nunca levanta) se a data estiver fora do alcance da API ou
    se a chamada externa falhar — clima é best-effort, nunca deveria impedir
    salvar uma partida.
    """
    if data_partida < date.today():
        return _buscar_historico(data_partida, horario_partida)
    return _buscar_previsao(data_partida, horario_partida)
