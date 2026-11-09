import {
  layoutDaFormacao,
  type AjustesDoTime,
  type Funcao,
  type ModeloTatica,
  type PlanoTatico,
  type PosicaoNoCampo,
} from "@/lib/escalacao";

// ---------------------------------------------------------------------------
// Quadro tático: contas de posição no campinho (400 x 560) e textos.
// Usado pelo editor na tela e pelo PDF de táticas.
// ---------------------------------------------------------------------------

export type Fase = "com_bola" | "sem_bola";
export const FASES: { id: Fase; nome: string; dica: string }[] = [
  { id: "com_bola", nome: "Com a bola", dica: "Como o time se organiza quando tem a bola." },
  { id: "sem_bola", nome: "Sem a bola", dica: "Como o time se organiza quando perde a bola." },
];

/** Quanto cada papel anda (para cima = ataque) e se fecha para o meio, por fase. */
const DESLOCAMENTO: Record<string, Record<Fase, { dy: number; centro: number }>> = {
  // zagueiros
  "ZAG:seguranca": { com_bola: { dy: 10, centro: 0 }, sem_bola: { dy: 0, centro: 0 } },
  "ZAG:sai_jogando": { com_bola: { dy: -40, centro: 0 }, sem_bola: { dy: 0, centro: 0 } },
  "ZAG:marcador": { com_bola: { dy: -5, centro: 0 }, sem_bola: { dy: -15, centro: 0 } },
  // laterais
  "LAT:apoiador": { com_bola: { dy: -80, centro: 0 }, sem_bola: { dy: 0, centro: 0 } },
  "LAT:seguranca": { com_bola: { dy: 10, centro: 0 }, sem_bola: { dy: 0, centro: 0 } },
  "LAT:ala": { com_bola: { dy: -110, centro: 0 }, sem_bola: { dy: -15, centro: 0 } },
  "LAT:por_dentro": { com_bola: { dy: -45, centro: 0.7 }, sem_bola: { dy: 0, centro: 0.2 } },
  // volantes
  "VOL:marcador": { com_bola: { dy: 5, centro: 0 }, sem_bola: { dy: 15, centro: 0 } },
  "VOL:primeiro_passe": { com_bola: { dy: -15, centro: 0.2 }, sem_bola: { dy: 5, centro: 0 } },
  "VOL:box_to_box": { com_bola: { dy: -70, centro: 0 }, sem_bola: { dy: 10, centro: 0 } },
  // meias
  "MEI:armador": { com_bola: { dy: -10, centro: 0.3 }, sem_bola: { dy: 10, centro: 0.2 } },
  "MEI:infiltrado": { com_bola: { dy: -70, centro: 0.4 }, sem_bola: { dy: 15, centro: 0 } },
  "MEI:aberto": { com_bola: { dy: -35, centro: -0.2 }, sem_bola: { dy: 10, centro: 0 } },
  "MEI:pressao": { com_bola: { dy: -10, centro: 0 }, sem_bola: { dy: -25, centro: 0 } },
  // atacantes
  "ATA:referencia": { com_bola: { dy: -10, centro: 0.2 }, sem_bola: { dy: 5, centro: 0 } },
  "ATA:movel": { com_bola: { dy: 25, centro: 0 }, sem_bola: { dy: 5, centro: 0 } },
  "ATA:pressao": { com_bola: { dy: -5, centro: 0 }, sem_bola: { dy: -20, centro: 0 } },
  "ATA:ponta": { com_bola: { dy: -15, centro: -0.25 }, sem_bola: { dy: 25, centro: 0 } },
};

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Onde o jogador fica, sem contar o que foi arrastado à mão (formação + ajustes do time + papel). */
export function posicaoSugerida(
  formacao: string,
  lugar: string,
  fase: Fase,
  time: AjustesDoTime,
  papel?: string,
): PosicaoNoCampo {
  const base = layoutDaFormacao(formacao)[lugar];
  if (!base) return { x: 200, y: 280 };
  if (lugar === "GOL") return base;
  let { x, y } = base;
  // Time todo: altura da linha e largura.
  if (fase === "sem_bola") y += 22 - (time.defesa - 3) * 18;
  else y -= 28;
  x = 200 + (x - 200) * (0.7 + 0.1 * time.largura);
  // Papel.
  const d = papel ? DESLOCAMENTO[`${lugar.slice(0, 3)}:${papel}`]?.[fase] : undefined;
  if (d) {
    y += d.dy;
    x += (200 - x) * d.centro;
  }
  return { x: Math.round(limitar(x, 34, 366)), y: Math.round(limitar(y, 40, 520)) };
}

/** Posição final: a arrastada à mão, se existir; senão a sugerida. */
export function posicaoDoLugar(
  plano: PlanoTatico,
  lugar: string,
  fase: Fase,
): PosicaoNoCampo & { arrastada: boolean } {
  const o = plano.jogadores[lugar];
  const manual = o?.[fase];
  if (manual) return { ...manual, arrastada: true };
  return {
    ...posicaoSugerida(plano.formacao, lugar, fase, plano.time, o?.papel),
    arrastada: false,
  };
}

export const NIVEIS: Record<
  "defesa" | "pressao" | "largura",
  [string, string, string, string, string]
> = {
  defesa: ["Bem recuada", "Recuada", "Média", "Alta", "Muito alta"],
  pressao: ["Só espera", "Leve", "Média", "Forte", "Intensa"],
  largura: ["Bem fechado", "Fechado", "Normal", "Aberto", "Bem aberto"],
};
export const ROTULO_AJUSTE: Record<"defesa" | "pressao" | "largura", string> = {
  defesa: "Altura da defesa",
  pressao: "Pressão na saída do rival",
  largura: "Largura do time",
};
export const NOME_SAIDA: Record<string, string> = {
  curta: "Saída curta, tocando desde a defesa",
  mista: "Saída mista",
  longa: "Saída longa, bola direta no ataque",
};

/** Frases curtas que explicam os ajustes do time (para a tela e o PDF). */
export function frasesDoTime(time: AjustesDoTime): string[] {
  return [
    `${ROTULO_AJUSTE.defesa}: ${NIVEIS.defesa[time.defesa - 1].toLowerCase()}.`,
    `${ROTULO_AJUSTE.pressao}: ${NIVEIS.pressao[time.pressao - 1].toLowerCase()}.`,
    `${ROTULO_AJUSTE.largura}: ${NIVEIS.largura[time.largura - 1].toLowerCase()}.`,
    `${NOME_SAIDA[time.saida]}.`,
  ];
}

export const TIME_PADRAO: AjustesDoTime = { defesa: 3, pressao: 3, largura: 3, saida: "mista" };

export function planoVazio(formacao: string): PlanoTatico {
  return { formacao, time: { ...TIME_PADRAO }, jogadores: {}, notas: "" };
}

/** Aplica um modelo pronto: ajustes do time e o papel de cada função em todos os lugares dela. */
export function planoDoModelo(modelo: ModeloTatica, formacao: string): PlanoTatico {
  const jogadores: PlanoTatico["jogadores"] = {};
  for (const lugar of Object.keys(layoutDaFormacao(formacao))) {
    if (lugar === "GOL") continue;
    const papel = modelo.papeis[lugar.slice(0, 3) as Funcao];
    if (papel) jogadores[lugar] = { papel };
  }
  return { formacao, time: { ...modelo.time }, jogadores, notas: "" };
}

/** Troca a formação mantendo o que dá: mesmo lugar continua com papel, nota e posições. */
export function trocarFormacaoDoPlano(plano: PlanoTatico, formacao: string): PlanoTatico {
  const lugares = new Set(Object.keys(layoutDaFormacao(formacao)));
  const jogadores: PlanoTatico["jogadores"] = {};
  for (const [lugar, o] of Object.entries(plano.jogadores)) {
    if (lugares.has(lugar)) jogadores[lugar] = o;
  }
  return { ...plano, formacao, jogadores };
}

/** Nome de um lugar para humanos: "Lateral direito", "Volante 1"... (esquerda para a direita). */
export function nomeDoLugar(formacao: string, lugar: string): string {
  const nomes: Record<string, string> = {
    ZAG: "Zagueiro",
    LAT: "Lateral",
    VOL: "Volante",
    MEI: "Meia",
    ATA: "Atacante",
  };
  const f = lugar.slice(0, 3);
  const n = Number(lugar.slice(3));
  const total = Object.keys(layoutDaFormacao(formacao)).filter((l) => l.startsWith(f)).length;
  if (f === "GOL") return "Goleiro";
  if (total === 1) return nomes[f];
  if (f === "LAT" && total === 2) return n === 1 ? "Lateral esquerdo" : "Lateral direito";
  const lado =
    total === 2
      ? n === 1
        ? "esquerdo"
        : "direito"
      : total === 3
        ? ["esquerdo", "central", "direito"][n - 1]
        : `${n}`;
  return `${nomes[f]} ${lado}`;
}
