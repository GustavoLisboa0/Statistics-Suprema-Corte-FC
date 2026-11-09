import os

from dotenv import load_dotenv

load_dotenv()

# LOCAL_DB=1 usa um banco SQLite no próprio computador (veja local_db.py),
# sem precisar de conta no Supabase.
LOCAL_DB = os.getenv("LOCAL_DB") == "1"

if LOCAL_DB:
    from local_db import criar_cliente

    supabase = criar_cliente()
else:
    from supabase import Client, create_client

    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError(
            "SUPABASE_URL e SUPABASE_KEY precisam estar definidos no arquivo .env "
            "(veja .env.example)"
        )

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
