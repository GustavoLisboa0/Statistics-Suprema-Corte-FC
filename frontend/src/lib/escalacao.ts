import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Escalador automático 4-4-2 — tipos e chamadas à API
// (os nomes dos campos seguem o backend, em português)
// ---------------------------------------------------------------------------

export const FUNCOES = ["ZAG", "LAT", "VOL", "MEI", "ATA"] as const;
export type Funcao = (typeof FUNCOES)[number];
export type FuncaoOuGol = Funcao | "GOL";

export const FUNCAO_LABELS: Record<FuncaoOuGol, string> = {
  GOL: "Goleiro",
  ZAG: "Zagueiro",
  LAT: "Lateral",
  VOL: "Volante",
  MEI: "Meia",
  ATA: "Atacante",
};

/** Um lugar em campo, ex.: "GOL", "ZAG1", "VOL2" (sempre da esquerda para a direita). */
export type Lugar = string;

/** Formações que o sistema conhece (nome -> quantos em cada função). */
export const FORMACOES: Record<string, Record<Funcao, number>> = {
  "4-4-2": { ZAG: 2, LAT: 2, VOL: 2, MEI: 2, ATA: 2 },
  "4-4-2 meias abertos": { ZAG: 2, LAT: 2, VOL: 2, MEI: 2, ATA: 2 },
  "4-4-2 losango": { ZAG: 2, LAT: 2, VOL: 1, MEI: 3, ATA: 2 },
  "4-3-3": { ZAG: 2, LAT: 2, VOL: 1, MEI: 2, ATA: 3 },
  "4-3-3 duplo volante": { ZAG: 2, LAT: 2, VOL: 2, MEI: 1, ATA: 3 },
  "4-5-1": { ZAG: 2, LAT: 2, VOL: 2, MEI: 3, ATA: 1 },
  "4-2-3-1": { ZAG: 2, LAT: 2, VOL: 2, MEI: 3, ATA: 1 },
  "4-1-4-1": { ZAG: 2, LAT: 2, VOL: 1, MEI: 4, ATA: 1 },
  "3-5-2": { ZAG: 3, LAT: 2, VOL: 1, MEI: 2, ATA: 2 },
  "3-4-1-2": { ZAG: 3, LAT: 2, VOL: 2, MEI: 1, ATA: 2 },
  "3-4-3": { ZAG: 3, LAT: 2, VOL: 0, MEI: 2, ATA: 3 },
  "5-3-2": { ZAG: 3, LAT: 2, VOL: 1, MEI: 2, ATA: 2 },
  "5-4-1": { ZAG: 3, LAT: 2, VOL: 2, MEI: 2, ATA: 1 },
};

/** Uma frase curta explicando o desenho de cada formação (aparece no seletor). */
export const FORMACAO_DESCRICAO: Record<string, string> = {
  "4-4-2": "Dois volantes, dois meias por dentro e dois atacantes.",
  "4-4-2 meias abertos": "Dois volantes, dois meias abertos pelos lados e dois atacantes.",
  "4-4-2 losango": "Um volante, dois meias abertos, um 10 e dois atacantes.",
  "4-3-3": "Um volante, dois meias e três atacantes.",
  "4-3-3 duplo volante": "Dois volantes, um meia e três atacantes.",
  "4-5-1": "Cinco no meio e um atacante isolado.",
  "4-2-3-1": "Dois volantes, três meias atrás de um atacante.",
  "4-1-4-1": "Um volante, quatro meias e um atacante.",
  "3-5-2": "Três zagueiros, laterais como alas e dois atacantes.",
  "3-4-1-2": "Três zagueiros, alas, dois volantes, um 10 e dois atacantes.",
  "3-4-3": "Três zagueiros, alas, dois meias e três atacantes.",
  "5-3-2": "Cinco na defesa, três no meio e dois atacantes.",
  "5-4-1": "Cinco na defesa, quatro no meio e um atacante.",
};

function espalhar(n: number, de: number, ate: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(de + ate) / 2];
  return Array.from({ length: n }, (_, i) => de + ((ate - de) * i) / (n - 1));
}

/**
 * Posição de cada lugar da formação no campinho (viewBox 400x560).
 * Goleiro embaixo, ataque em cima; o número 1 de cada função fica à esquerda.
 */
export function layoutDaFormacao(formacao: string): Record<Lugar, { x: number; y: number }> {
  const c = FORMACOES[formacao] ?? FORMACOES["4-4-2"];
  const pos: Record<Lugar, { x: number; y: number }> = { GOL: { x: 200, y: 488 } };
  const poe = (f: Funcao, xs: number[], y: number) =>
    xs.forEach((x, i) => (pos[`${f}${i + 1}`] = { x, y }));
  const tresAtras = formacao.startsWith("3");

  poe("ZAG", espalhar(c.ZAG, c.ZAG === 2 ? 150 : 120, c.ZAG === 2 ? 250 : 280), 410);
  poe("LAT", [58, 342], tresAtras ? 320 : 400);
  poe("ATA", espalhar(c.ATA, c.ATA === 2 ? 140 : 90, c.ATA === 2 ? 260 : 310), 140);

  switch (formacao) {
    case "4-4-2": // dois volantes e dois meias por dentro
      poe("VOL", [150, 250], 320);
      poe("MEI", [120, 280], 235);
      break;
    case "4-4-2 meias abertos": // meia, volante, volante, meia
      pos.MEI1 = { x: 58, y: 275 };
      pos.VOL1 = { x: 150, y: 290 };
      pos.VOL2 = { x: 250, y: 290 };
      pos.MEI2 = { x: 342, y: 275 };
      break;
    case "5-4-1":
      pos.MEI1 = { x: 58, y: 255 };
      pos.VOL1 = { x: 150, y: 285 };
      pos.VOL2 = { x: 250, y: 285 };
      pos.MEI2 = { x: 342, y: 255 };
      break;
    case "4-4-2 losango":
      poe("VOL", [200], 330);
      pos.MEI1 = { x: 70, y: 265 };
      pos.MEI2 = { x: 200, y: 215 };
      pos.MEI3 = { x: 330, y: 265 };
      break;
    case "4-5-1": // cinco em linha
      pos.MEI1 = { x: 55, y: 275 };
      pos.VOL1 = { x: 130, y: 292 };
      pos.MEI2 = { x: 200, y: 262 };
      pos.VOL2 = { x: 270, y: 292 };
      pos.MEI3 = { x: 345, y: 275 };
      break;
    case "4-1-4-1":
      poe("VOL", [200], 335);
      poe("MEI", [55, 150, 250, 345], 255);
      break;
    case "4-3-3 duplo volante":
      poe("VOL", [150, 250], 320);
      poe("MEI", [200], 240);
      break;
    case "3-4-1-2":
      poe("VOL", [150, 250], 320);
      poe("MEI", [200], 235);
      break;
    case "4-2-3-1":
      poe("VOL", [150, 250], 320);
      poe("MEI", [80, 200, 320], 235);
      break;
    default:
      if (c.VOL === 2 && c.MEI === 2) {
        pos.MEI1 = { x: 58, y: 275 };
        pos.VOL1 = { x: 150, y: 290 };
        pos.VOL2 = { x: 250, y: 290 };
        pos.MEI2 = { x: 342, y: 275 };
      } else {
        poe("VOL", espalhar(c.VOL, 150, 250), 305);
        poe(
          "MEI",
          espalhar(c.MEI, c.MEI === 2 ? 110 : 80, c.MEI === 2 ? 290 : 320),
          c.VOL ? 235 : 275,
        );
      }
  }
  return pos;
}

export type Convocado = {
  id: string;
  nome: string;
  nome_completo: string;
  numero_camisa: number | null;
  posicoes: string[];
};

export type Bloqueado = Convocado & { motivo: string };

export type ConvocadosResposta = {
  convocados: Convocado[];
  bloqueados: Bloqueado[];
  outros_ativos: Convocado[];
};

export type RegraJogador = {
  minutos_max?: number;
  so_segundo_tempo?: boolean;
  comeca?: "titular" | "reserva";
  nao_sai?: boolean;
  grupo_fixo?: boolean;
  funcao?: Funcao;
};

export type Restricao = {
  jogador_id: string;
  tipo: "comeca_dentro" | "comeca_fora" | "funcao";
  funcao?: Funcao;
};

export type RegraComposicao = {
  funcao: Funcao;
  tipo: "atributo" | "carac";
  chave: string;
  modo: string;
};

export type GerarPayload = {
  goleiro_id: string;
  incluir: string[];
  remover: string[];
  duracao: number;
  /** Automático: o computador escolhe quando trocar e quantos trocam por vez. */
  automatico: boolean;
  n_substituicoes: number;
  trocas_por_vez: number;
  regras: Record<string, RegraJogador>;
  restricoes: Restricao[];
  semente: number;
  /** Quanto o computador pode mexer nas trocas (modo automático). */
  intervalo_minimo: number;
  tolerancia_minutos: number;
  max_momentos: number | null;
  max_trocas_por_vez: number | null;
  /** Quantos jogadores de linha ficam o jogo inteiro (sem sair). */
  quantos_fixos: number;
  comparar_opcoes: boolean;
  /** Se maior que 0, a resposta traz só os grupos desse tamanho que podem jogar o jogo todo. */
  avaliar_fixos?: number;
  formacao: string;
  mudancas_formacao: { minuto: number; formacao: string }[];
  composicao: RegraComposicao[];
  /** V2 (só admin): tática e estratégia. */
  tatica: string | null;
  estrategia: string;
  forca_tatica: number;
};

export type Janela = {
  inicio: number;
  fim: number;
  formacao?: string;
  lugares: Record<Lugar, string>;
};

export type Troca = {
  minuto: number;
  sai: string;
  sai_nome: string;
  entra: string;
  entra_nome: string;
  funcao: Funcao;
  lugar: Lugar;
};

export type JogadorResumo = {
  nome: string;
  nome_completo: string;
  numero_camisa: number | null;
  posicoes: string[];
};

export type ResultadoEscalacao = {
  formacao: string;
  duracao: number;
  goleiro_id: string;
  janelas: Janela[];
  titulares: { lugar: Lugar; funcao: FuncaoOuGol; jogador_id: string; nome: string }[];
  banco: { jogador_id: string; nome: string }[];
  trocas: Troca[];
  ajustes_de_posicao: { minuto: number; nome: string; de: Funcao; para: Funcao }[];
  minutos: Record<string, number>;
  /** Dados públicos de cada convocado, para desenhar sem buscar mais nada. */
  jogadores: Record<string, JogadorResumo>;
  /** Só no modo automático: o que o computador decidiu. */
  plano?: {
    n_substituicoes: number;
    trocas_por_vez: number;
    cortes: number[];
    fixos?: string[];
    aviso?: string;
  };
  mudancas_formacao?: { minuto: number; formacao: string }[];
  /** Resumo público do plano (vai no PDF): nomes e ideias, sem números de atributos. */
  plano_de_jogo?: {
    tatica: string | null;
    tatica_descricao: string | null;
    estrategia: string | null;
    estrategia_descricao: string | null;
    regras: string[];
  };
};

/** Sigla da posição do cadastro (para a legendinha ao lado do nome). */
export const ABREV_POSICAO: Record<string, string> = {
  goleiro: "GOL",
  zagueiro: "ZAG",
  lateral_direito: "LD",
  lateral_esquerdo: "LE",
  volante: "VOL",
  meia: "MEI",
  meia_esquerda: "ME",
  meia_direita: "MD",
  meia_atacante: "MA",
  atacante: "ATA",
  ponta_esquerda: "PE",
  ponta_direita: "PD",
  centro_avante: "CA",
};

export function siglaPosicao(posicoes: string[]): string {
  return posicoes[0] ? (ABREV_POSICAO[posicoes[0]] ?? posicoes[0]) : "";
}

export type OpcaoDeTrocas = {
  /** igual = todo mundo o mesmo tempo; fixos = alguém joga o jogo todo; formacao = muda de formação. */
  tipo: "igual" | "fixos" | "formacao";
  /** Diferença de tempo dentro do limite (5 min). Falso = só a melhor tentativa. */
  aceitavel: boolean;
  mudancas_formacao: { minuto: number; formacao: string }[];
  /** Combinações de jogadores que realmente funcionam como "jogo todo" nesta opção. */
  combinacoes: string[][];
  quantos_fixos: number;
  momentos: number;
  trocas: number;
  diferenca_minutos: number;
  fixos: string[];
  fixos_nomes: string[];
  resultado: ResultadoEscalacao;
};

export type PreviaEscalacao = {
  /** Só quando se pediu para comparar: todo mundo igual x 1 ou 2 jogadores o jogo todo. */
  opcoes?: OpcaoDeTrocas[];
  partida_id: string;
  convocados: Convocado[];
  config: GerarPayload;
  resultado: ResultadoEscalacao;
  /** Só admin, e só quando há tática. Nunca vai para o PDF. */
  analise?: Analise;
  /** Avisos do sistema para o admin (ex.: tempo igual impossível por causa das posições). */
  avisos?: string[];
  /** Sugestão de quem poderia jogar o jogo todo para ter menos trocas. */
  /** Diferença de tempo entre quem mais e quem menos joga, como o sistema conta (sem quem tem regra de tempo própria). */
  diferenca_minutos?: number;
  dica_fixos?: { quantos_fixos: number; fixos: string[]; momentos: number; texto: string } | null;
};

export type EscalacaoSalva = {
  id: string;
  partida_id: string;
  formacao: string;
  config: GerarPayload;
  resultado: ResultadoEscalacao;
  created_at: string;
};

export function fetchConvocados(partidaId: string) {
  return api.get<ConvocadosResposta>(`/partidas/${partidaId}/escalacao/convocados`);
}

/** Um grupo de jogadores que pode jogar o jogo todo, e quanto sobra de diferença de tempo no time. */
export type GrupoDeFixos = {
  fixos: string[];
  diferenca_minutos: number;
  momentos: number;
  trocas: number;
  aceitavel: boolean;
};

export function avaliarGrupos(partidaId: string, payload: GerarPayload) {
  return api.post<{ grupos: GrupoDeFixos[] }>(`/partidas/${partidaId}/escalacao/gerar`, payload);
}

/** Quem joga o tempo todo nesta escalação (sem contar o goleiro). */
export function quemJogaTudo(res: ResultadoEscalacao): string[] {
  return Object.entries(res.minutos)
    .filter(([id, m]) => id !== res.goleiro_id && m >= res.duracao)
    .map(([id]) => id);
}

export function gerarEscalacao(partidaId: string, payload: GerarPayload) {
  return api.post<PreviaEscalacao>(`/partidas/${partidaId}/escalacao/gerar`, payload);
}

/** Escalação salva da partida, ou `null` se ainda não existe. */
export async function fetchEscalacaoSalva(partidaId: string): Promise<EscalacaoSalva | null> {
  try {
    return await api.get<EscalacaoSalva>(`/partidas/${partidaId}/escalacao`);
  } catch (e) {
    if ((e as Error & { status?: number }).status === 404) return null;
    throw e;
  }
}

export function salvarEscalacao(
  partidaId: string,
  corpo: { config: GerarPayload; resultado: ResultadoEscalacao },
  jaExiste: boolean,
) {
  return jaExiste
    ? api.put<EscalacaoSalva>(`/partidas/${partidaId}/escalacao`, corpo)
    : api.post<EscalacaoSalva>(`/partidas/${partidaId}/escalacao`, corpo);
}

/** Quem está em campo (e quem está no banco) em uma janela de tempo. */
export function escalacaoDaJanela(resultado: ResultadoEscalacao, indice: number) {
  const janela = resultado.janelas[indice];
  const emCampo = new Set(Object.values(janela.lugares));
  const banco = Object.keys(resultado.jogadores).filter((id) => !emCampo.has(id));
  return { janela, banco };
}

// ---------------------------------------------------------------------------
// V2 — tudo abaixo é INTERNO do admin (a API recusa quem não é editor)
// ---------------------------------------------------------------------------
export const ATRIBUTOS = [
  { id: "pace", nome: "Velocidade" },
  { id: "fisico", nome: "Físico" },
  { id: "defesa", nome: "Defesa" },
  { id: "finalizacao", nome: "Finalização" },
  { id: "passe", nome: "Passe" },
  { id: "visao", nome: "Visão" },
] as const;
export type AtributoId = (typeof ATRIBUTOS)[number]["id"];

export type Analise = {
  tatica: string;
  nota_geral: number;
  janelas: {
    inicio: number;
    fim: number;
    nota: number;
    setores: { defesa: number; meio: number; ataque: number };
  }[];
  pontos_de_atencao: string[];
};

export type Catalogo = {
  atributos: { id: string; nome: string }[];
  caracteristicas: { id: string; nome: string }[];
  modos_atributo: { id: string; nome: string }[];
  modos_caracteristica: { id: string; nome: string }[];
  formacoes: { id: string; contagem: Record<Funcao, number> }[];
  pesos_funcao: Record<string, Record<string, number>>;
  bonus_caracteristica: Record<string, Record<string, number>>;
  taticas: {
    id: string;
    nome: string;
    descricao: string;
    attr: Record<string, number>;
    funcao: Record<string, number>;
  }[];
  estrategias: { id: string; nome: string; descricao: string }[];
  estilos: { id: string; nome: string }[];
  /** Quadro tático: papéis por posição e modelos prontos. */
  papeis: Record<string, { id: string; nome: string; descricao: string }[]>;
  saidas_de_bola: { id: string; nome: string }[];
  modelos: ModeloTatica[];
  situacoes_ensaiadas: { id: string; nome: string }[];
};

export type AjustesDoTime = {
  defesa: number;
  pressao: number;
  largura: number;
  saida: "curta" | "mista" | "longa";
};
export type PosicaoNoCampo = { x: number; y: number };
export type OrientacaoDoLugar = {
  papel?: string;
  nota?: string;
  com_bola?: PosicaoNoCampo;
  sem_bola?: PosicaoNoCampo;
};
/** Quadro tático: orientação do time. Não interfere na escalação. */
export type PlanoTatico = {
  formacao: string;
  time: AjustesDoTime;
  jogadores: Record<string, OrientacaoDoLugar>;
  notas: string;
  /** Ids das jogadas ensaiadas que fazem parte desta tática (saem no mesmo PDF). */
  jogadas?: string[];
};
export type ModeloTatica = {
  id: string;
  nome: string;
  descricao: string;
  time: AjustesDoTime;
  papeis: Record<string, string>;
};

export type TaticaSalva = {
  id: string;
  nome: string;
  descricao: string | null;
  plano: PlanoTatico;
};
type CorpoTatica = { nome: string; descricao: string | null; plano: PlanoTatico };
export const fetchTaticas = () => api.get<TaticaSalva[]>("/taticas");
export const criarTatica = (corpo: CorpoTatica) => api.post<TaticaSalva>("/taticas", corpo);
export const editarTatica = (id: string, corpo: CorpoTatica) =>
  api.put<TaticaSalva>(`/taticas/${id}`, corpo);
export const apagarTatica = (id: string) => api.del(`/taticas/${id}`);

/** Um passo da jogada: onde cada jogador está (quem não aparece fica onde estava) e a bola. */
export type PassoDeJogada = {
  texto: string;
  posicoes: Record<string, PosicaoNoCampo>;
  bola?: PosicaoNoCampo;
};
/** Jogada ensaiada: combinada para um momento (escanteio, falta, saída de bola...). */
export type PlanoJogada = {
  formacao: string;
  passos: PassoDeJogada[];
  /** O que cada posição faz nesta jogada. */
  papeis: Record<string, string>;
  notas: string;
};
export type JogadaEnsaiada = {
  id: string;
  nome: string;
  descricao: string | null;
  situacao: string;
  plano: PlanoJogada;
};
type CorpoJogada = {
  nome: string;
  descricao: string | null;
  situacao: string;
  plano: PlanoJogada;
};
export const fetchJogadas = () => api.get<JogadaEnsaiada[]>("/jogadas-ensaiadas");
export const criarJogada = (corpo: CorpoJogada) =>
  api.post<JogadaEnsaiada>("/jogadas-ensaiadas", corpo);
export const editarJogada = (id: string, corpo: CorpoJogada) =>
  api.put<JogadaEnsaiada>(`/jogadas-ensaiadas/${id}`, corpo);
export const apagarJogada = (id: string) => api.del(`/jogadas-ensaiadas/${id}`);

export type AtributosJogador = {
  jogador_id: string;
  nome: string;
  posicoes: string[];
  numero_camisa: number | null;
  nota: string | null;
  caracteristicas: string[];
} & Record<AtributoId, number | null>;

export type Adversario = {
  id?: string;
  nome: string;
  ataque: number | null;
  meio: number | null;
  defesa: number | null;
  estilo: string | null;
  observacoes: string | null;
};

export type ContraEstrategia = {
  adversario: string;
  perfil: Adversario | null;
  historico: {
    jogos: number;
    vitorias: number;
    empates: number;
    derrotas: number;
    gols_pro: number;
    gols_contra: number;
  };
  sugestao: {
    tatica: string;
    estrategia: string;
    tatica_nome: string;
    estrategia_nome: string;
    motivos: string[];
  } | null;
  aviso: string | null;
};

export const fetchCatalogo = () => api.get<Catalogo>("/escalacao/catalogo");
export const fetchAtributos = () => api.get<AtributosJogador[]>("/atributos");
export const salvarAtributos = (
  jogadorId: string,
  corpo: Partial<Record<AtributoId, number | null>> & {
    nota?: string | null;
    caracteristicas?: string[];
  },
) => api.put(`/atributos/${jogadorId}`, corpo);
export const fetchNota = (partidaId: string) =>
  api.get<{ texto: string }>(`/partidas/${partidaId}/escalacao/nota`);
export const salvarNota = (partidaId: string, texto: string) =>
  api.put<{ texto: string }>(`/partidas/${partidaId}/escalacao/nota`, { texto });
export const fetchContraEstrategia = (partidaId: string) =>
  api.get<ContraEstrategia>(`/partidas/${partidaId}/escalacao/contra-estrategia`);
export const salvarAdversario = (corpo: Adversario) => api.put<Adversario>("/adversarios", corpo);

export type SugestaoFormacao = {
  formacao: string;
  mudancas: { minuto: number; formacao: string }[];
  motivo: string;
};
export const fetchSugestaoFormacao = (tatica: string, duracao: number) =>
  api.get<SugestaoFormacao>(
    `/escalacao/sugestao-formacao?tatica_id=${encodeURIComponent(tatica)}&duracao=${duracao}`,
  );
