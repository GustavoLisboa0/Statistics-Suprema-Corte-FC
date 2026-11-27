"""
Benchmark do escalador (backend/escalacao.py) — sem banco, sem rede, só stdlib.

Mede tempo, CPU e memória das funções que o "Gerar" e o "Quem joga o jogo todo"
usam, com um elenco sintético (o mesmo de tests/test_escalacao.py + 2 coringas),
e estima o tempo numa instância com cota de CPU (ex.: 0,1 CPU do plano free da
Render). NÃO altera o escalador: os modos "serial" e "medir" trocam
`escalacao._rodar_em_paralelo` só dentro deste processo.

Uso (de dentro de backend/):
    python scripts/bench_escalacao.py                      # modo medir, 15 e 18 convocados, cota 0,1
    python scripts/bench_escalacao.py --modo real          # código como está (pool real)
    python scripts/bench_escalacao.py --modo serial        # sem pool (1 núcleo)
    python scripts/bench_escalacao.py --convocados 15 --funcoes opcoes --cota 0.1 0.5
    ./venv/Scripts/python.exe scripts/bench_escalacao.py --rss-web   # memória do processo web após `import main`

Modos:
  real   — chama as funções como estão; mede só tempo de parede.
  serial — troca o pool por um laço (tempo de parede ≈ CPU em 1 núcleo).
  medir  — réplica instrumentada de `_rodar_em_paralelo` (mesmo nº de processos,
           mesmo `result(timeout=...)` em sequência). Cada processo filho devolve a
           CPU gasta e o pico de memória. Com isso, separa a CPU do processo web da
           CPU dos filhos e simula a cota (--cota).

A simulação de cota assume: núcleo da produção com a mesma velocidade desta
máquina [hipótese], cota dividida igualmente entre os processos que estão
calculando (escalonador do Linux/CFS), e cada trabalho limitado a 1 núcleo.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import escalacao as e  # noqa: E402

# ---------------------------------------------------------------------------
# Elenco sintético
# ---------------------------------------------------------------------------
BASE = [
    ("G1", ["goleiro"]), ("Z1", ["zagueiro"]), ("Z2", ["zagueiro"]),
    ("Z3", ["zagueiro", "lateral_direito"]), ("L1", ["lateral_direito"]),
    ("L2", ["lateral_esquerdo"]), ("L3", ["lateral_esquerdo", "zagueiro"]),
    ("V1", ["volante"]), ("V2", ["volante"]), ("V3", ["volante", "meia"]),
    ("M1", ["meia"]), ("M2", ["meia_esquerda"]), ("M3", ["meia_atacante", "atacante"]),
    ("A1", ["atacante"]), ("A2", ["centro_avante"]), ("A3", ["ponta_direita", "ponta_esquerda"]),
    ("X1", ["meia", "volante"]), ("X2", ["zagueiro"]),
]


# "equilibrado": goleiro e depois uma volta por função (Z, L, V, M, A) de cada vez,
# para que elencos pequenos (ex.: 13) ainda fechem um 4-4-2. Com a ordem "padrao"
# (a de BASE), 13 convocados ficam com 1 atacante só e a geração é inviável.
ORDEM_EQUILIBRADA = [
    "G1", "Z1", "L1", "V1", "M1", "A1", "Z2", "L2", "V2", "M2", "A2",
    "Z3", "L3", "V3", "M3", "A3", "X1", "X2",
]


def elenco(n: int, ordem: str = "padrao") -> list[dict]:
    base = BASE if ordem == "padrao" else [(i, dict(BASE)[i]) for i in ORDEM_EQUILIBRADA]
    return [
        {"id": i, "nome": i, "nome_completo": i, "numero_camisa": None, "posicoes": p}
        for i, p in base[:n]
    ]


# Mesmos argumentos que routers/escalacao.py monta para o payload padrão do front.
COMUNS = dict(
    duracao=90, regras={}, restricoes=[], semente=0, qualidade=None, estrategia="uniforme",
    forca=100, formacao="4-4-2", mudancas_formacao=[], perfis=None, composicao=[],
)
AUTO = dict(intervalo_minimo=3, tolerancia=1, max_momentos=None, max_trocas=None)


# ---------------------------------------------------------------------------
# Memória (pico do próprio processo), sem psutil
# ---------------------------------------------------------------------------
def memoria_mb() -> tuple[float, float]:
    """(atual, pico) do conjunto residente do processo, em MB."""
    if sys.platform == "win32":
        import ctypes
        import ctypes.wintypes as w

        class Contadores(ctypes.Structure):
            _fields_ = [
                ("cb", w.DWORD), ("PageFaultCount", w.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
            ]

        k32 = ctypes.WinDLL("kernel32")
        k32.GetCurrentProcess.restype = ctypes.c_void_p
        f = k32.K32GetProcessMemoryInfo
        f.argtypes = [ctypes.c_void_p, ctypes.POINTER(Contadores), w.DWORD]
        f.restype = w.BOOL
        c = Contadores()
        c.cb = ctypes.sizeof(c)
        f(k32.GetCurrentProcess(), ctypes.byref(c), c.cb)
        return c.WorkingSetSize / 2**20, c.PeakWorkingSetSize / 2**20
    import resource

    pico = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    pico_mb = pico / 2**20 if sys.platform == "darwin" else pico / 1024
    try:
        with open("/proc/self/statm") as fh:
            atual_mb = int(fh.read().split()[1]) * os.sysconf("SC_PAGE_SIZE") / 2**20
    except OSError:
        atual_mb = pico_mb
    return atual_mb, pico_mb


# ---------------------------------------------------------------------------
# Modo "medir": réplica instrumentada de escalacao._rodar_em_paralelo
# ---------------------------------------------------------------------------
def _trabalho_medido(argumentos: tuple):
    """Roda no processo filho: o mesmo `_gerar_ou_none`, devolvendo CPU e memória."""
    inicio = time.process_time()
    resultado = e._gerar_ou_none(argumentos)
    return resultado, time.process_time() - inicio, memoria_mb()[1], os.getpid()


class Medidor:
    """Guarda a sequência de trechos: CPU no processo web e lotes enviados ao pool."""

    def __init__(self, workers: int, timeout: float):
        self.workers = workers
        self.timeout = timeout
        self.pool: ProcessPoolExecutor | None = None
        self.reset()

    def reset(self):
        self.trechos: list[tuple[str, object]] = []
        self._marca = time.process_time()
        self.pico_filhos: dict[int, float] = {}

    def _fecha_trecho_web(self):
        agora = time.process_time()
        self.trechos.append(("web", agora - self._marca))
        self._marca = agora

    def rodar_em_paralelo(self, trabalhos: list[tuple]):
        self._fecha_trecho_web()
        if len(trabalhos) <= 1:  # o código real também roda 0 ou 1 trabalho sem pool
            # A CPU desse trabalho entra no próximo trecho "web" (não mexe na marca).
            return [e._gerar_ou_none(t) for t in trabalhos]
        if self.pool is None:
            self.pool = ProcessPoolExecutor(max_workers=self.workers)
        futuros = [self.pool.submit(_trabalho_medido, t) for t in trabalhos]
        saida, cpus = [], []
        for f in futuros:
            res, cpu, pico, pid = f.result(timeout=self.timeout)
            saida.append(res)
            cpus.append(cpu)
            self.pico_filhos[pid] = max(self.pico_filhos.get(pid, 0.0), pico)
        self.trechos.append(("pool", cpus))
        self._marca = time.process_time()
        return saida

    def finalizar(self):
        self._fecha_trecho_web()


# ---------------------------------------------------------------------------
# Simulação de cota de CPU (processor sharing)
# ---------------------------------------------------------------------------
def _motor(q, workers, fila, t, em_execucao=(), extra=None, parar_em=None, ate_extra=False):
    """
    Avança no tempo com `workers` processos tirando trabalhos de `fila` (FIFO) e,
    opcionalmente, uma tarefa `extra` (CPU restante no processo web). Todos que
    estão calculando dividem a cota `q` por igual (cada um no máximo 1 núcleo).
    """
    rodando = [list(x) for x in em_execucao]
    fila = list(fila)
    concluidos: dict[int, float] = {}
    fim_extra = None
    while True:
        while len(rodando) < workers and fila:
            rodando.append(list(fila.pop(0)))
        tem_extra = extra is not None and extra > 1e-12
        n = len(rodando) + (1 if tem_extra else 0)
        if n == 0:
            break
        taxa = min(1.0, q / n)
        restos = [r[1] for r in rodando] + ([extra] if tem_extra else [])
        dt = min(restos) / taxa
        if parar_em is not None and t + dt >= parar_em:
            avanco = (parar_em - t) * taxa
            for r in rodando:
                r[1] -= avanco
            if tem_extra:
                extra -= avanco
            return concluidos, fim_extra, rodando, fila, extra, parar_em
        t += dt
        avanco = dt * taxa
        for r in rodando:
            r[1] -= avanco
        if tem_extra:
            extra -= avanco
            if extra <= 1e-12:
                fim_extra = t
                if ate_extra:
                    return concluidos, fim_extra, rodando, fila, 0.0, t
        for r in [r for r in rodando if r[1] <= 1e-12]:
            concluidos[r[0]] = t
            rodando.remove(r)
    return concluidos, fim_extra, rodando, fila, extra, t


def simular(trechos, q: float, workers: int, timeout: float) -> dict:
    """Tempo de parede estimado com cota `q`, seguindo o `result(timeout)` em sequência do código."""
    t = 0.0
    eventos = []
    for tipo, valor in trechos:
        if tipo == "web":
            t += valor / min(1.0, q)
            continue
        cpus = list(valor)
        fila = list(enumerate(cpus))
        inicio = t
        concluidos, *_ = _motor(q, workers, fila, t)
        chamada = inicio
        estourou_em = None
        for i in range(len(cpus)):
            if concluidos[i] > chamada + timeout:
                estourou_em = chamada + timeout
                eventos.append(f"timeout no futuro {i + 1}/{len(cpus)} em t={estourou_em:.0f}s")
                break
            chamada = max(chamada, concluidos[i])
        if estourou_em is None:
            t = chamada
            continue
        # Timeout: o código zera o pool (sem shutdown) e refaz TODOS os trabalhos em série
        # no processo web, enquanto os filhos órfãos continuam a fila antiga.
        _, _, rodando, resto_fila, _, _ = _motor(q, workers, fila, inicio, parar_em=estourou_em)
        _, fim, rodando2, fila2, _, _ = _motor(
            q, workers, resto_fila, estourou_em, em_execucao=rodando,
            extra=sum(cpus), ate_extra=True,
        )
        orfaos = sum(r[1] for r in rodando2) + sum(c for _, c in fila2)
        eventos.append(f"refaz em série até t={fim:.0f}s; órfãos ainda com {orfaos:.1f}s de CPU")
        t = fim
    return {"parede_s": t, "eventos": eventos}


# ---------------------------------------------------------------------------
# Execução
# ---------------------------------------------------------------------------
FUNCOES = {
    "gerar": ("gerar_automatico (Gerar com comparar_opcoes=false)",
              lambda js: e.gerar_automatico(js, "G1", quantos_fixos=0, **COMUNS, **AUTO)),
    "opcoes": ("opcoes_de_trocas (Gerar padrão do front: comparar_opcoes=true)",
               lambda js: e.opcoes_de_trocas(js, "G1", **COMUNS, **AUTO)),
    "dica": ("sugerir_fixos (dica_fixos, roda junto do gerar sem comparar)",
             lambda js: e.sugerir_fixos(
                 js, "G1", e.gerar_automatico(js, "G1", quantos_fixos=0, **COMUNS, **AUTO),
                 **COMUNS, **AUTO)),
    "avaliar": ("avaliar_grupos_de_fixos(2) (diálogo 'Quem joga o jogo todo')",
                lambda js: e.avaliar_grupos_de_fixos(js, "G1", 2, **COMUNS, **AUTO)),
}


def medir_rss_web() -> None:
    """Memória de um processo novo depois de `import main` (o que o fork copia)."""
    env = dict(os.environ)
    if env.get("LOCAL_DB") != "1":
        # URL/chave falsas: create_client não faz requisição na importação.
        env.setdefault("SUPABASE_URL", "https://supabase-falso.invalid")
        env.setdefault("SUPABASE_KEY", "chave.falsa.de-teste")
    codigo = (
        "import sys; sys.path.insert(0, r'%s'); sys.path.insert(0, r'%s');"
        "from bench_escalacao import memoria_mb; a=memoria_mb()[0]; import main; "
        "print('processo web: %%.0f MB antes, %%.0f MB depois de import main' %% (a, memoria_mb()[0]))"
    ) % (BACKEND, Path(__file__).resolve().parent)
    subprocess.run([sys.executable, "-c", codigo], cwd=BACKEND, env=env, check=False)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modo", choices=["real", "serial", "medir"], default="medir")
    ap.add_argument("--convocados", type=int, nargs="+", default=[15, 18])
    ap.add_argument("--elenco", choices=["padrao", "equilibrado"], default="padrao",
                    help="ordem do elenco sintético (equilibrado fecha 4-4-2 com 11-13 convocados)")
    ap.add_argument("--repeticoes", type=int, default=1, help="rodadas por tamanho de elenco")
    ap.add_argument("--funcoes", nargs="+", choices=list(FUNCOES), default=list(FUNCOES))
    ap.add_argument("--cota", type=float, nargs="+", default=[0.1], help="CPUs da instância (modo medir)")
    ap.add_argument("--workers", type=int, default=3, help="processos do pool (código: 3)")
    ap.add_argument("--timeout", type=float, default=120, help="timeout por futuro (código: 120)")
    ap.add_argument("--rss-web", action="store_true", help="mede a memória do processo web e sai")
    args = ap.parse_args()

    if args.rss_web:
        medir_rss_web()
        return

    medidor = None
    if args.modo == "serial":
        e._rodar_em_paralelo = lambda trabalhos: [e._gerar_ou_none(t) for t in trabalhos]
    elif args.modo == "medir":
        medidor = Medidor(args.workers, args.timeout)
        e._rodar_em_paralelo = medidor.rodar_em_paralelo

    print(f"modo={args.modo} | cpus da máquina={os.cpu_count()} | python={sys.version.split()[0]}")
    for n in [n for n in args.convocados for _ in range(args.repeticoes)]:
        js = elenco(n, args.elenco)
        print(f"\n--- {n} convocados ({n - 1} de linha, elenco {args.elenco})")
        for chave in args.funcoes:
            nome, fn = FUNCOES[chave]
            if medidor:
                medidor.reset()
            inicio, cpu0 = time.perf_counter(), time.process_time()
            try:
                fn(js)
            except e.EscalacaoInviavel as erro:
                print(f"{nome}: inviável ({erro})")
                continue
            parede = time.perf_counter() - inicio
            linha = f"{nome:68s} parede {parede:6.1f}s"
            if not medidor:
                print(linha)
                continue
            medidor.finalizar()
            cpu_web = sum(v for tipo, v in medidor.trechos if tipo == "web")
            cpus_filhos = [c for tipo, v in medidor.trechos if tipo == "pool" for c in v]
            total = cpu_web + sum(cpus_filhos)
            print(f"{linha} | CPU web {cpu_web:5.1f}s + filhos {sum(cpus_filhos):5.1f}s "
                  f"({len(cpus_filhos)} trabalhos) = {total:5.1f}s")
            if medidor.pico_filhos:
                picos = ", ".join(f"{v:.0f}" for v in medidor.pico_filhos.values())
                print(f"{'':68s} pico de memória dos filhos (MB): {picos}; web: {memoria_mb()[1]:.0f}")
            for q in args.cota:
                sim = simular(medidor.trechos, q, args.workers, args.timeout)
                sem_pool = total / min(1.0, q)
                extra = ("; " + "; ".join(sim["eventos"])) if sim["eventos"] else ""
                print(f"{'':68s} cota {q:g} CPU: ~{sim['parede_s']:.0f}s com o pool do código "
                      f"(~{sem_pool:.0f}s sem pool){extra}")
    if medidor and medidor.pool:
        medidor.pool.shutdown(cancel_futures=True)


if __name__ == "__main__":
    main()
