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

/** Lugares do 4-4-2, na ordem usada pelo backend. */
export const LUGARES = [
  "GOL",
  "ZAG1",
  "ZAG2",
  "LAT1",
  "LAT2",
  "VOL1",
  "VOL2",
  "MEI1",
  "MEI2",
  "ATA1",
  "ATA2",
] as const;
export type Lugar = (typeof LUGARES)[number];

/**
 * Posição de cada lugar do 4-4-2 no campinho (coordenadas do viewBox 400x560).
 * Goleiro embaixo, ataque em cima. LAT1/MEI1 ficam à esquerda, LAT2/MEI2 à direita.
 */
export const POSICAO_NO_CAMPO: Record<Lugar, { x: number; y: number }> = {
  GOL: { x: 200, y: 488 },
  LAT1: { x: 58, y: 400 },
  ZAG1: { x: 150, y: 410 },
  ZAG2: { x: 250, y: 410 },
  LAT2: { x: 342, y: 400 },
  MEI1: { x: 58, y: 275 },
  VOL1: { x: 150, y: 290 },
  VOL2: { x: 250, y: 290 },
  MEI2: { x: 342, y: 275 },
  ATA1: { x: 140, y: 140 },
  ATA2: { x: 260, y: 140 },
};

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
  /** V2 (só admin): tática e estratégia. */
  tatica: string | null;
  estrategia: string;
  forca_tatica: number;
};

export type Janela = {
  inicio: number;
  fim: number;
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
  plano?: { n_substituicoes: number; trocas_por_vez: number; cortes: number[] };
};

export type PreviaEscalacao = {
  partida_id: string;
  convocados: Convocado[];
  config: GerarPayload;
  resultado: ResultadoEscalacao;
  /** Só admin, e só quando há tática. Nunca vai para o PDF. */
  analise?: Analise;
  /** Avisos do sistema para o admin (ex.: tempo igual impossível por causa das posições). */
  avisos?: string[];
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
  taticas: { id: string; nome: string; descricao: string }[];
  estrategias: { id: string; nome: string; descricao: string }[];
  estilos: { id: string; nome: string }[];
};

export type AtributosJogador = {
  jogador_id: string;
  nome: string;
  posicoes: string[];
  numero_camisa: number | null;
  nota: string | null;
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
  corpo: Partial<Record<AtributoId, number | null>> & { nota?: string | null },
) => api.put(`/atributos/${jogadorId}`, corpo);
export const fetchNota = (partidaId: string) =>
  api.get<{ texto: string }>(`/partidas/${partidaId}/escalacao/nota`);
export const salvarNota = (partidaId: string, texto: string) =>
  api.put<{ texto: string }>(`/partidas/${partidaId}/escalacao/nota`, { texto });
export const fetchContraEstrategia = (partidaId: string) =>
  api.get<ContraEstrategia>(`/partidas/${partidaId}/escalacao/contra-estrategia`);
export const salvarAdversario = (corpo: Adversario) => api.put<Adversario>("/adversarios", corpo);
