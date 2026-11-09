import type { jsPDF } from "jspdf";

import {
  FUNCAO_LABELS,
  POSICAO_NO_CAMPO,
  type JogadorResumo,
  type Lugar,
  type ResultadoEscalacao,
} from "@/lib/escalacao";

type Dados = {
  /** Ex.: "Suprema Corte FC × Adversário" */
  titulo: string;
  /** Ex.: "16/11/2026 · Trieste · 20:00" */
  subtitulo: string;
  resultado: ResultadoEscalacao;
};

const ROXO: [number, number, number] = [100, 16, 201];
const DOURADO: [number, number, number] = [240, 180, 17];

function curto(nome: string, max = 12): string {
  return nome.length > max ? nome.slice(0, max - 1) + "." : nome;
}

/** Desenha um campinho 4-4-2 com os jogadores nos seus lugares. */
function desenharCampo(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  lugares: Record<Lugar, string>,
  jogadores: Record<string, JogadorResumo>,
  destaque: Set<string>,
) {
  const k = largura / 400; // mm por unidade do desenho (400 x 560)
  doc.setFillColor(47, 125, 59);
  doc.roundedRect(x, y, largura, 560 * k, 2, 2, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.rect(x + 14 * k, y + 14 * k, 372 * k, 532 * k);
  doc.line(x + 14 * k, y + 280 * k, x + 386 * k, y + 280 * k);
  doc.circle(x + 200 * k, y + 280 * k, 48 * k);
  doc.rect(x + 100 * k, y + 446 * k, 200 * k, 100 * k);
  doc.rect(x + 100 * k, y + 14 * k, 200 * k, 100 * k);

  for (const [lugar, pos] of Object.entries(POSICAO_NO_CAMPO)) {
    const id = lugares[lugar as Lugar];
    const j = id ? jogadores[id] : undefined;
    const cx = x + pos.x * k;
    const cy = y + pos.y * k;
    const entrou = destaque.has(id);
    doc.setFillColor(...ROXO);
    if (entrou) doc.setDrawColor(...DOURADO);
    else doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(entrou ? 0.9 : 0.4);
    doc.circle(cx, cy, 22 * k, "FD");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(largura * 0.085);
    doc.text(String(j?.numero_camisa ?? lugar.slice(0, 3)), cx, cy + 22 * k * 0.28, {
      align: "center",
    });
    doc.setFontSize(largura * 0.068);
    doc.text(curto(j?.nome ?? "-"), cx, cy + 22 * k + 3.2, { align: "center" });
  }
}

/**
 * Gera e baixa o PDF da escalação (feito no navegador, nada vai para o servidor).
 *
 * Mostra o campinho da escalação inicial e um novo campinho a cada
 * substituição, já com o time como fica depois das trocas (quem entrou tem
 * o contorno dourado). Só entram título, dados do jogo, campinhos, reservas e
 * as trocas — nada de notas, atributos ou minutos por jogador.
 */
export async function exportarEscalacaoPdf({ titulo, subtitulo, resultado }: Dados) {
  // Carregado só no clique: a biblioteca é grande e só roda no navegador.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const jogadores = resultado.jogadores;

  const cabecalho = () => {
    doc.setFillColor(...ROXO);
    doc.rect(0, 0, 210, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(titulo, 15, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(subtitulo, 15, 20);
  };
  cabecalho();

  const LARGURA = 66;
  const ALTURA_CAMPO = 560 * (LARGURA / 400);
  const ALTURA_CELULA = 126;
  const COLUNAS = [15, 110];
  const PRIMEIRA_LINHA_Y = 32;
  const LINHA_Y_PAGINA_NOVA = 14;
  const LIMITE_Y = 297;

  let coluna = 0;
  let linhaY = PRIMEIRA_LINHA_Y;

  resultado.janelas.forEach((janela, i) => {
    // Quebra de coluna/linha/página.
    if (coluna === COLUNAS.length) {
      coluna = 0;
      linhaY += ALTURA_CELULA;
    }
    if (linhaY + ALTURA_CELULA > LIMITE_Y) {
      doc.addPage();
      linhaY = LINHA_Y_PAGINA_NOVA;
      coluna = 0;
    }
    const x = COLUNAS[coluna++];
    const y = linhaY;

    const trocas = resultado.trocas.filter((t) => t.minuto === janela.inicio);
    const entraram = new Set(trocas.map((t) => t.entra));

    // Título do quadro: "Time 2 - 1ª troca" + o momento (como no esquema do time).
    const metade = resultado.duracao / 2;
    const momento =
      i === 0
        ? "Início do jogo"
        : janela.inicio === metade
          ? "Intervalo"
          : `${janela.inicio} minutos (${janela.inicio < metade ? "1º" : "2º"} tempo)`;
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(i === 0 ? "TIME 1 (4-4-2)" : `TIME ${i + 1} (4-4-2) - ${i}ª TROCA`, x, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(momento, x, y + 8.5);

    desenharCampo(doc, x, y + 11, LARGURA, janela.lugares, jogadores, entraram);

    // Texto embaixo do campinho
    let ty = y + 11 + ALTURA_CAMPO + 5;
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(8.5);
    const escrever = (texto: string, negrito = false) => {
      doc.setFont("helvetica", negrito ? "bold" : "normal");
      for (const linha of doc.splitTextToSize(texto, 85) as string[]) {
        if (ty < y + ALTURA_CELULA - 1) doc.text(linha, x, ty);
        ty += 4;
      }
    };

    if (i === 0) {
      const emCampo = new Set(Object.values(janela.lugares));
      const reservas = Object.entries(jogadores)
        .filter(([id]) => !emCampo.has(id))
        .map(([, j]) => j.nome);
      escrever(`RESERVAS: ${reservas.length ? reservas.join(", ") : "-"}`);
    } else {
      if (trocas.length === 0) escrever("Sem trocas neste momento.");
      else {
        escrever(`Saída: ${trocas.map((t) => t.sai_nome).join(", ")}`);
        escrever(`Entrar: ${trocas.map((t) => t.entra_nome).join(", ")}`);
      }
      for (const a of resultado.ajustes_de_posicao.filter((a) => a.minuto === janela.inicio)) {
        escrever(`${a.nome} passa de ${FUNCAO_LABELS[a.de]} para ${FUNCAO_LABELS[a.para]}`);
      }
    }
  });

  const nomeArquivo = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  doc.save(`escalacao-${nomeArquivo}.pdf`);
}
