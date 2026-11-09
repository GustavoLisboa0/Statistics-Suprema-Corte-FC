import { layoutDaFormacao, type PlanoJogada, type PosicaoNoCampo } from "@/lib/escalacao";
import { TIME_PADRAO, posicaoSugerida } from "@/lib/quadroTatico";

// ---------------------------------------------------------------------------
// Jogadas ensaiadas: contas de posição por passo (campinho 400 x 560).
// Quem não foi arrastado em um passo continua onde estava no passo anterior.
// ---------------------------------------------------------------------------

/** Rótulos curtos usados na tela e no PDF. */
export const SITUACAO_CURTA: Record<string, string> = {
  escanteio_ataque: "Escanteio a favor",
  escanteio_defesa: "Escanteio contra",
  falta_ataque: "Falta a favor",
  falta_defesa: "Falta contra",
  lateral: "Lateral",
  saida_de_bola: "Saída de bola",
  tiro_de_meta: "Tiro de meta",
  outra: "Outra situação",
};

/** Posição inicial: a da formação, como o time fica com a bola. */
export function posicaoInicial(formacao: string, lugar: string): PosicaoNoCampo {
  if (lugar === "GOL") return layoutDaFormacao(formacao).GOL;
  return posicaoSugerida(formacao, lugar, "com_bola", TIME_PADRAO);
}

/** Onde o jogador está em um passo (e se foi arrastado exatamente nesse passo). */
export function posicaoNoPasso(
  plano: PlanoJogada,
  passo: number,
  lugar: string,
): PosicaoNoCampo & { marcada: boolean } {
  const aqui = plano.passos[passo]?.posicoes[lugar];
  if (aqui) return { ...aqui, marcada: true };
  for (let i = passo - 1; i >= 0; i--) {
    const antes = plano.passos[i]?.posicoes[lugar];
    if (antes) return { ...antes, marcada: false };
  }
  return { ...posicaoInicial(plano.formacao, lugar), marcada: false };
}

/** Onde a bola está em um passo (herda do anterior; sem bola marcada, não aparece). */
export function bolaNoPasso(plano: PlanoJogada, passo: number): PosicaoNoCampo | null {
  for (let i = passo; i >= 0; i--) {
    const b = plano.passos[i]?.bola;
    if (b) return b;
  }
  return null;
}

export function jogadaVazia(formacao: string): PlanoJogada {
  return { formacao, passos: [{ texto: "", posicoes: {} }], papeis: {}, notas: "" };
}

/** Troca a formação mantendo só o que ainda existe nela. */
export function trocarFormacaoDaJogada(plano: PlanoJogada, formacao: string): PlanoJogada {
  const lugares = new Set(Object.keys(layoutDaFormacao(formacao)));
  const filtra = <T>(o: Record<string, T>) =>
    Object.fromEntries(Object.entries(o).filter(([l]) => lugares.has(l)));
  return {
    ...plano,
    formacao,
    passos: plano.passos.map((p) => ({ ...p, posicoes: filtra(p.posicoes) })),
    papeis: filtra(plano.papeis),
  };
}
