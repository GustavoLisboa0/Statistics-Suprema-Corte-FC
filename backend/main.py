from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, estatisticas, jogadores, partidas, presenca

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

app.include_router(auth.router)
app.include_router(jogadores.router)
app.include_router(partidas.router)
# Precisa vir depois de `partidas`: também usa o prefixo /partidas, com as
# subrotas de presença e estatísticas da partida.
app.include_router(presenca.router)
app.include_router(estatisticas.router)


@app.get("/")
def raiz():
    return {"status": "ok", "mensagem": "API Suprema Corte FC no ar"}
