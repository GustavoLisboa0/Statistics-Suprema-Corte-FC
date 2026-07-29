from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import estatisticas, jogadores, partidas

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

app.include_router(jogadores.router)
app.include_router(partidas.router)
app.include_router(estatisticas.router)


@app.get("/")
def raiz():
    return {"status": "ok", "mensagem": "API Suprema Corte FC no ar"}