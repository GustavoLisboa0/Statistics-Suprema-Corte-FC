import type { jsPDF } from "jspdf";

import {
  FUNCAO_LABELS,
  layoutDaFormacao,
  type Funcao,
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

type Cor = [number, number, number];
const ROXO: Cor = [100, 16, 201];
const ROXO_ESCURO: Cor = [58, 8, 120];
const DOURADO: Cor = [212, 156, 16]; // #d49c10, mesmo dourado do tema
const CINZA: Cor = [90, 90, 100];
const TEXTO: Cor = [30, 30, 40];
const FUNDO_SUAVE: Cor = [244, 240, 252];

const MARGEM = 15;
const LARGURA_PAGINA = 210;
const ALTURA_PAGINA = 297;

function curto(nome: string, max = 12): string {
  return nome.length > max ? nome.slice(0, max - 1) + "." : nome;
}

/** Desenha o campinho da formação com os jogadores nos seus lugares. */
function desenharCampo(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  formacao: string,
  lugares: Record<Lugar, string>,
  jogadores: Record<string, JogadorResumo>,
  destaque: Set<string>,
) {
  const k = largura / 400; // mm por unidade do desenho (400 x 560)
  doc.setFillColor(47, 125, 59);
  doc.roundedRect(x, y, largura, 560 * k, 2, 2, "F");
  // faixas do gramado
  doc.setFillColor(42, 115, 54);
  for (const i of [1, 3, 5, 7, 9]) doc.rect(x, y + i * 56 * k, largura, 56 * k, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.rect(x + 14 * k, y + 14 * k, 372 * k, 532 * k);
  doc.line(x + 14 * k, y + 280 * k, x + 386 * k, y + 280 * k);
  doc.circle(x + 200 * k, y + 280 * k, 48 * k);
  doc.rect(x + 100 * k, y + 446 * k, 200 * k, 100 * k);
  doc.rect(x + 150 * k, y + 500 * k, 100 * k, 46 * k);
  doc.rect(x + 100 * k, y + 14 * k, 200 * k, 100 * k);
  doc.rect(x + 150 * k, y + 14 * k, 100 * k, 46 * k);

  for (const [lugar, pos] of Object.entries(layoutDaFormacao(formacao))) {
    const id = lugares[lugar];
    const j = id ? jogadores[id] : undefined;
    const cx = x + pos.x * k;
    const cy = y + pos.y * k;
    const entrou = !!id && destaque.has(id);
    doc.setFillColor(...ROXO);
    if (entrou) doc.setDrawColor(...DOURADO);
    else doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(entrou ? 1.1 : 0.5);
    doc.circle(cx, cy, 22 * k, "FD");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(largura * 0.075);
    doc.text(String(j?.numero_camisa ?? lugar.slice(0, 3)), cx, cy + 22 * k * 0.28, {
      align: "center",
    });
    doc.setFontSize(largura * 0.06);
    doc.text(curto(j?.nome ?? "-"), cx, cy + 22 * k + 3.6, { align: "center" });
  }
}

function funcaoDoLugar(lugar: string): string {
  const f = lugar.slice(0, 3);
  return FUNCAO_LABELS[f as Funcao | "GOL"] ?? f;
}

/** Nome do momento: "Início do jogo", "Intervalo", "35 minutos (1º tempo)". */
function nomeDoMomento(inicio: number, indice: number, duracao: number): string {
  if (indice === 0) return "Início do jogo";
  const metade = duracao / 2;
  if (inicio === metade) return "Intervalo";
  return `${inicio} minutos (${inicio < metade ? "1º" : "2º"} tempo)`;
}

/**
 * Gera e baixa o PDF da escalação (feito no navegador, nada vai para o servidor).
 *
 * Página 1: capa com o plano de jogo (formação, tática, estratégia, regras),
 * os titulares, o banco e as trocas. Depois, uma página por momento do jogo
 * com o campinho já com as trocas feitas (quem entrou tem o contorno dourado).
 *
 * NUNCA entram atributos, notas, análise, anotações internas nem minutos por jogador.
 */
export async function exportarEscalacaoPdf({ titulo, subtitulo, resultado }: Dados) {
  // Carregado só no clique: a biblioteca é grande e só roda no navegador.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const jogadores = resultado.jogadores;
  const plano = resultado.plano_de_jogo;
  const util = LARGURA_PAGINA - 2 * MARGEM;

  const cor = (c: Cor) => doc.setTextColor(...c);
  const texto = (
    t: string,
    x: number,
    y: number,
    tam: number,
    negrito = false,
    c: Cor = TEXTO,
    opc?: { align?: "left" | "center" | "right" },
  ) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tam);
    cor(c);
    doc.text(t, x, y, opc);
  };
  /** Escreve um parágrafo com quebra de linha e devolve o novo y. */
  const paragrafo = (
    t: string,
    x: number,
    y: number,
    largura: number,
    tam = 10,
    c: Cor = TEXTO,
  ) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(tam);
    cor(c);
    const linhas = doc.splitTextToSize(t, largura) as string[];
    for (const l of linhas) {
      doc.text(l, x, y);
      y += tam * 0.42 + 1.2;
    }
    return y;
  };
  const secao = (t: string, y: number) => {
    doc.setFillColor(...DOURADO);
    doc.rect(MARGEM, y - 4, 1.6, 5.5, "F");
    texto(t.toUpperCase(), MARGEM + 4, y, 10.5, true, ROXO_ESCURO);
    return y + 6;
  };

  // ------------------------------------------------------------------ capa
  const faixa = (altura: number) => {
    doc.setFillColor(...ROXO);
    doc.rect(0, 0, LARGURA_PAGINA, altura, "F");
    doc.setFillColor(...DOURADO);
    doc.rect(0, altura, LARGURA_PAGINA, 1.6, "F");
  };
  faixa(40);
  texto("SUPREMA CORTE FC", MARGEM, 13, 9, true, DOURADO);
  texto(titulo, MARGEM, 25, 21, true, [255, 255, 255]);
  texto(subtitulo, MARGEM, 34, 11, false, [235, 225, 250]);

  let y = 54;

  // Plano de jogo
  y = secao("Plano de jogo", y);
  const formacoes = [
    resultado.formacao,
    ...(resultado.mudancas_formacao ?? []).map((m) => `${m.formacao} (aos ${m.minuto}')`),
  ];
  doc.setFillColor(...FUNDO_SUAVE);
  const linhasPlano: [string, string][] = [["Formação", formacoes.join("   >   ")]];
  if (plano?.tatica)
    linhasPlano.push(["Tática", `${plano.tatica} — ${plano.tatica_descricao ?? ""}`]);
  if (plano?.estrategia)
    linhasPlano.push(["Estratégia", `${plano.estrategia} — ${plano.estrategia_descricao ?? ""}`]);
  // As regras de composição ficam só com o administrador (nada de atributos no PDF).
  const quebradas = linhasPlano.map(([r, v]) => ({
    r,
    linhas: (doc.setFont("helvetica", "normal"),
    doc.setFontSize(10),
    doc.splitTextToSize(v, util - 36)) as string[],
  }));
  const alturaPlano = quebradas.reduce((s, q) => s + q.linhas.length * 5 + 2.5, 3);
  doc.roundedRect(MARGEM, y - 1, util, alturaPlano, 2, 2, "F");
  let py = y + 5;
  for (const q of quebradas) {
    texto(q.r, MARGEM + 4, py, 10, true, ROXO);
    q.linhas.forEach((l, i) => texto(l, MARGEM + 32, py + i * 5, 10));
    py += q.linhas.length * 5 + 2.5;
  }
  y += alturaPlano + 8;

  // Titulares e banco
  y = secao("Titulares", y);
  const inicial = resultado.janelas[0];
  const titulares = Object.entries(inicial.lugares);
  const colW = util / 2;
  titulares.forEach(([lugar, id], i) => {
    const col = i % 2;
    const lin = Math.floor(i / 2);
    const x = MARGEM + col * colW;
    const ty = y + lin * 7;
    const j = jogadores[id];
    doc.setFillColor(...ROXO);
    doc.circle(x + 3.5, ty - 1.2, 3.2, "F");
    texto(String(j?.numero_camisa ?? "-"), x + 3.5, ty - 0.1, 8, true, [255, 255, 255], {
      align: "center",
    });
    texto(j?.nome ?? "-", x + 9, ty, 10.5, true);
    texto(funcaoDoLugar(lugar), x + colW - 6, ty, 9, false, CINZA, { align: "right" });
  });
  y += Math.ceil(titulares.length / 2) * 7 + 4;

  const emCampo = new Set(Object.values(inicial.lugares));
  const reservas = Object.entries(jogadores)
    .filter(([id]) => !emCampo.has(id))
    .map(([, j]) => j.nome);
  y = secao("Banco", y);
  y = paragrafo(reservas.length ? reservas.join(", ") : "Sem reservas.", MARGEM, y, util, 10.5) + 4;

  // Trocas
  if (resultado.trocas.length > 0) {
    y = secao("Substituições", y);
    const porMinuto = new Map<number, typeof resultado.trocas>();
    for (const t of resultado.trocas)
      porMinuto.set(t.minuto, [...(porMinuto.get(t.minuto) ?? []), t]);
    for (const [minuto, lista] of porMinuto) {
      if (y > ALTURA_PAGINA - 30) {
        doc.addPage();
        y = 20;
      }
      texto(`${minuto}'`, MARGEM, y, 10.5, true, ROXO);
      const t = lista
        .map((x) => `sai ${x.sai_nome}, entra ${x.entra_nome} (${FUNCAO_LABELS[x.funcao]})`)
        .join(";  ");
      y = paragrafo(t, MARGEM + 14, y, util - 14, 10) + 1.5;
    }
  }

  // ------------------------------------------------- uma página por momento
  const larguraCampo = 118;
  const alturaCampo = 560 * (larguraCampo / 400);
  resultado.janelas.forEach((janela, i) => {
    doc.addPage();
    faixa(22);
    texto(titulo, MARGEM, 11, 13, true, [255, 255, 255]);
    texto(subtitulo, MARGEM, 18, 9, false, [235, 225, 250]);

    const form = janela.formacao ?? resultado.formacao;
    const anterior = i > 0 ? (resultado.janelas[i - 1].formacao ?? resultado.formacao) : form;
    const trocas = resultado.trocas.filter((t) => t.minuto === janela.inicio);
    const entraram = new Set(trocas.map((t) => t.entra));

    let cy = 36;
    texto(
      i === 0 ? `TIME 1  ·  ${form}` : `TIME ${i + 1}  ·  ${form}  ·  ${i}ª TROCA`,
      MARGEM,
      cy,
      17,
      true,
      ROXO_ESCURO,
    );
    cy += 7;
    texto(nomeDoMomento(janela.inicio, i, resultado.duracao), MARGEM, cy, 11, false, CINZA);
    if (form !== anterior) {
      texto(`Muda de ${anterior} para ${form}`, LARGURA_PAGINA - MARGEM, cy, 11, true, ROXO, {
        align: "right",
      });
    }
    cy += 6;

    desenharCampo(doc, MARGEM, cy, larguraCampo, form, janela.lugares, jogadores, entraram);

    // Coluna ao lado do campo
    const lx = MARGEM + larguraCampo + 8;
    const lw = LARGURA_PAGINA - MARGEM - lx;
    let ly = cy + 4;
    if (i === 0) {
      ly = secaoLateral(doc, "Banco", lx, ly);
      const rs = Object.entries(jogadores)
        .filter(([id]) => !emCampo.has(id))
        .map(([, j]) => j.nome);
      for (const n of rs.length ? rs : ["Sem reservas"]) {
        texto(n, lx, ly, 10);
        ly += 5.5;
      }
    } else {
      ly = secaoLateral(doc, "Saem", lx, ly);
      for (const t of trocas) {
        texto(`- ${t.sai_nome}`, lx, ly, 10);
        ly += 5.5;
      }
      ly += 2;
      ly = secaoLateral(doc, "Entram", lx, ly);
      for (const t of trocas) {
        texto(`+ ${t.entra_nome}`, lx, ly, 10, true, ROXO);
        texto(FUNCAO_LABELS[t.funcao], lx + 2, ly + 4.2, 8, false, CINZA);
        ly += 9.5;
      }
      if (trocas.length === 0) {
        texto("Só muda a formação.", lx, ly, 10, false, CINZA);
        ly += 6;
      }
      const ajustes = resultado.ajustes_de_posicao.filter((a) => a.minuto === janela.inicio);
      if (ajustes.length) {
        ly += 2;
        ly = secaoLateral(doc, "Mudam de posição", lx, ly);
        for (const a of ajustes) {
          ly = paragrafo(
            `${a.nome}: ${FUNCAO_LABELS[a.de]} para ${FUNCAO_LABELS[a.para]}`,
            lx,
            ly,
            lw,
            9.5,
          );
        }
      }
    }

    // Banco neste momento (rodapé)
    if (i > 0) {
      const dentro = new Set(Object.values(janela.lugares));
      const banco = Object.entries(jogadores)
        .filter(([id]) => !dentro.has(id))
        .map(([, j]) => j.nome);
      const by = cy + alturaCampo + 9;
      texto("BANCO", MARGEM, by, 9.5, true, ROXO_ESCURO);
      paragrafo(banco.length ? banco.join(", ") : "Sem reservas.", MARGEM + 16, by, util - 16, 10);
    }
  });

  // Rodapé com numeração em todas as páginas
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...DOURADO);
    doc.setLineWidth(0.4);
    doc.line(MARGEM, ALTURA_PAGINA - 11, LARGURA_PAGINA - MARGEM, ALTURA_PAGINA - 11);
    texto("Suprema Corte FC", MARGEM, ALTURA_PAGINA - 6, 8.5, false, CINZA);
    texto(
      `Página ${p} de ${total}`,
      LARGURA_PAGINA - MARGEM,
      ALTURA_PAGINA - 6,
      8.5,
      false,
      CINZA,
      {
        align: "right",
      },
    );
  }

  const nomeArquivo = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  doc.save(`escalacao-${nomeArquivo}.pdf`);
}

function secaoLateral(doc: jsPDF, titulo: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...ROXO_ESCURO);
  doc.text(titulo.toUpperCase(), x, y);
  doc.setDrawColor(...DOURADO);
  doc.setLineWidth(0.5);
  doc.line(x, y + 1.5, x + 28, y + 1.5);
  return y + 7;
}
