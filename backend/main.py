from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from routers import (
    atributos,
    auth,
    escalacao,
    estatisticas,
    jogadores,
    lesoes,
    partidas,
    presenca,
    punicoes,
)

app = FastAPI(
    title="Statistics Suprema Corte FC",
    description="API para registro de estatísticas do Suprema Corte FC",
    version="0.1.0",
)

# Libera acesso do front-end local (ajuste as origens conforme necessário em produção)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Comprime respostas JSON maiores que 1 KB (listas de jogadores, partidas,
# estatísticas, escalação salva). O JSON comprime ~5-10x, e na rede/CPU do
# plano gratuito isso pesa mais que o custo de comprimir. Adicionado DEPOIS do
# CORS de propósito: o último middleware adicionado fica por fora.
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(auth.router)
app.include_router(jogadores.router)
# Precisam vir depois de `jogadores`: também usam o prefixo /jogadores, com
# subrotas de punições (admin-only) e lesões (autoatendimento).
app.include_router(punicoes.router)
app.include_router(lesoes.router)
app.include_router(lesoes.router_ativas)
app.include_router(partidas.router)
# Precisa vir depois de `partidas`: também usa o prefixo /partidas, com as
# subrotas de presença e estatísticas da partida.
app.include_router(presenca.router)
app.include_router(escalacao.router)
app.include_router(atributos.router)
app.include_router(estatisticas.router)


@app.get("/")
def raiz():
    return {"status": "ok", "mensagem": "API Suprema Corte FC no ar"}
