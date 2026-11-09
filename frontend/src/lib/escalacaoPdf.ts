import { FUNCAO_LABELS, POSICAO_NO_CAMPO, type ResultadoEscalacao } from "@/lib/escalacao";

type Dados = {
  /** Ex.: "Suprema Corte FC × Adversário" */
  titulo: string;
  /** Ex.: "Sábado, 15/11/2026 · Trieste · 20:00" */
  subtitulo: string;
  resultado: ResultadoEscalacao;
  /** Qual janela de tempo desenhar no campinho (0 = titulares). */
  indiceJanela?: number;
};

function curto(nome: string, max = 13): string {
  return nome.length > max ? nome.slice(0, max - 1) + "." : nome;
}

/**
 * Gera e baixa o PDF da escalação (feito no navegador, nada vai para o servidor).
 *
 * Só entram no PDF: título, dados do jogo, campinho, reservas e tabela de
 * substituições. Nada de notas, atributos ou minutos por jogador.
 */
export async function exportarEscalacaoPdf({
  titulo,
  subtitulo,
  resultado,
  indiceJanela = 0,
}: Dados) {
  // Carregado só no clique: a biblioteca é grande e só roda no navegador.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const jogadores = resultado.jogadores;
  const janela = resultado.janelas[indiceJanela] ?? resultado.janelas[0];

  // Cabeçalho
  doc.setFillColor(100, 16, 201);
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(titulo, 15, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(subtitulo, 15, 20);

  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Escalação ${resultado.formacao}`, 15, 36);

  // Campinho (100 x 140 mm, a partir de x=15, y=40)
  const ox = 15;
  const oy = 40;
  const k = 0.25; // mm por unidade do SVG (400 -> 100mm)
  doc.setFillColor(47, 125, 59);
  doc.roundedRect(ox, oy, 100, 140, 3, 3, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.rect(ox + 14 * k, oy + 14 * k, 372 * k, 532 * k);
  doc.line(ox + 14 * k, oy + 280 * k, ox + 386 * k, oy + 280 * k);
  doc.circle(ox + 200 * k, oy + 280 * k, 48 * k);
  doc.rect(ox + 100 * k, oy + 446 * k, 200 * k, 100 * k);
  doc.rect(ox + 100 * k, oy + 14 * k, 200 * k, 100 * k);

  for (const [lugar, pos] of Object.entries(POSICAO_NO_CAMPO)) {
    const id = janela.lugares[lugar as keyof typeof janela.lugares];
    const j = id ? jogadores[id] : undefined;
    const cx = ox + pos.x * k;
    const cy = oy + pos.y * k;
    doc.setFillColor(100, 16, 201);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.6);
    doc.circle(cx, cy, 5.2, "FD");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(String(j?.numero_camisa ?? lugar.slice(0, 3)), cx, cy + 1.6, { align: "center" });
    doc.setFontSize(8);
    doc.text(curto(j?.nome ?? "—"), cx, cy + 9.4, { align: "center" });
  }

  // Reservas (coluna da direita)
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Reservas", 125, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const emCampo = new Set(Object.values(janela.lugares));
  const reservas = Object.entries(jogadores)
    .filter(([id]) => !emCampo.has(id))
    .map(([, j]) => j);
  let y = 43;
  if (reservas.length === 0) {
    doc.text("—", 125, y);
  }
  for (const j of reservas) {
    const numero = j.numero_camisa != null ? `${j.numero_camisa}  ` : "";
    doc.text(`${numero}${curto(j.nome, 22)}`, 125, y);
    y += 6;
  }

  // Tabela de substituições
  let ty = 192;
  const cabecalho = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Substituições", 15, ty);
    ty += 6;
    doc.setFillColor(235, 228, 250);
    doc.rect(15, ty - 4.5, 180, 7, "F");
    doc.setFontSize(10);
    doc.text("Minuto", 17, ty);
    doc.text("Sai", 45, ty);
    doc.text("Entra", 100, ty);
    doc.text("Posição", 155, ty);
    ty += 7;
    doc.setFont("helvetica", "normal");
  };
  cabecalho();
  if (resultado.trocas.length === 0) {
    doc.text("Sem substituições.", 17, ty);
  }
  for (const t of resultado.trocas) {
    if (ty > 280) {
      doc.addPage();
      ty = 20;
      cabecalho();
    }
    doc.text(`${t.minuto}'`, 17, ty);
    doc.text(curto(t.sai_nome, 28), 45, ty);
    doc.text(curto(t.entra_nome, 28), 100, ty);
    doc.text(FUNCAO_LABELS[t.funcao], 155, ty);
    ty += 6.5;
  }

  const nomeArquivo = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  doc.save(`escalacao-${nomeArquivo}.pdf`);
}
