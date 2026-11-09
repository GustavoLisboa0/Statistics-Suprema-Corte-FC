"""
Popula o banco local (backend/local.db) com dados de teste.

Uso (dentro de backend/, com o venv ativado):
    python seed_local.py

ATENÇÃO: apaga tudo que já existia no banco local antes de criar os dados.

Logins criados:
    admin (editor)      admin@suprema.com / admin123
    usuário comum       jogador@suprema.com / jogador123
"""

import os

os.environ["LOCAL_DB"] = "1"  # este script só faz sentido com o banco local

from datetime import date, timedelta  # noqa: E402

import local_db  # noqa: E402
from local_auth import criar_conta_local  # noqa: E402

ADMIN = ("admin@suprema.com", "admin123")
COMUM = ("jogador@suprema.com", "jogador123")

# (nome, apelido, camisa, posições) — 2 goleiros + 14 de linha.
ELENCO = [
    ("Carlos Alberto", "Carlão", 1, ["goleiro"]),
    ("Rafael Souza", "Rafa", 12, ["goleiro"]),
    ("Bruno Lima", "Bruno", 3, ["zagueiro"]),
    ("Diego Martins", "Diego", 4, ["zagueiro", "lateral_direito"]),
    ("Tiago Ramos", "Tiago", 13, ["zagueiro", "volante"]),
    ("Leonardo Dias", "Léo", 2, ["lateral_direito", "ponta_direita"]),
    ("Gabriel Nunes", "Gabi", 6, ["lateral_esquerdo", "zagueiro"]),
    ("Marcos Vieira", "Marcão", 5, ["volante", "meia"]),
    ("Pedro Alves", "Pedrão", 8, ["volante", "zagueiro"]),
    ("André Costa", "Dé", 10, ["meia", "meia_atacante"]),
    ("Caio Ferreira", "Caio", 11, ["meia_esquerda", "ponta_esquerda"]),
    ("Felipe Rocha", "Felipão", 7, ["meia_direita", "lateral_direito"]),
    ("Hugo Barros", "Hugo", 17, ["meia_atacante", "atacante"]),
    ("Igor Pereira", "Igor", 9, ["atacante", "centro_avante"]),
    ("João Pedro Silva", "JP", 19, ["centro_avante"]),
    ("Kaique Santos", "Kaique", 14, ["ponta_direita", "ponta_esquerda", "atacante"]),
]


def main() -> None:
    local_db.limpar_tudo()
    db = local_db.criar_cliente()

    criar_conta_local(*ADMIN, metadata={"nome": "Admin Teste"}, papel="editor")
    conta_comum = criar_conta_local(
        *COMUM, metadata={"nome": "Jogador Teste", "telefone": "(41) 99999-0000"}
    )

    jogadores = []
    for i, (nome, apelido, camisa, posicoes) in enumerate(ELENCO, start=1):
        linha = {
            "nome": nome,
            "apelido": apelido,
            "telefone": f"(41) 99999-{i:04d}",
            "email": f"jogador{i}@exemplo.com",
            "posicoes": posicoes,
            "numero_camisa": camisa,
        }
        # O usuário comum de teste é o "Kaique": assim ele já tem jogador.
        if apelido == "Kaique":
            linha["perfil_id"] = conta_comum["id"]
            linha["email"] = COMUM[0]
        jogadores.append(db.table("jogadores").insert(linha).execute().data[0])

    partida = db.table("partidas").insert(
        {
            "data": (date.today() + timedelta(days=7)).isoformat(),
            "horario": "20:00:00",
            "adversario": "Time Teste FC",
            "local": "trieste",
            "mando": "mandante",
            "campeonato_ou_amistoso": "Amistoso",
            "vagas_linha": 14,
        }
    ).execute().data[0]

    for j in jogadores:
        db.table("presenca").insert(
            {
                "partida_id": partida["id"],
                "jogador_id": j["id"],
                "status": "confirmado",
                "posicao": j["posicoes"][0],
                "termos_aceitos": True,
            }
        ).execute()

    print("Banco local populado!")
    print(f"  Admin:  {ADMIN[0]} / {ADMIN[1]}")
    print(f"  Comum:  {COMUM[0]} / {COMUM[1]}")
    print(f"  {len(jogadores)} jogadores, 1 partida agendada ({partida['adversario']}) com todos confirmados.")


if __name__ == "__main__":
    main()
