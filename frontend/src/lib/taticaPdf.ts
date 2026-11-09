import type { jsPDF } from "jspdf";

import {
  FUNCAO_LABELS,
  layoutDaFormacao,
  type Catalogo,
  type Funcao,
  type PlanoTatico,
} from "@/lib/escalacao";
import { FASES, frasesDoTime, nomeDoLugar, posicaoDoLugar, type Fase } from "@/lib/quadroTatico";

// ---------------------------------------------------------------------------
// PDF de táticas: separado da escalação, para mandar para o grupo (ou para cada
// jogador). Página 1 = geral; depois uma página por lugar do campo.
// Feito no navegador. Nada de atributos ou notas internas de jogadores.
// ---------------------------------------------------------------------------

type Cor = [number, number, number];
const ROXO: Cor = [100, 16, 201];
const ROXO_ESCURO: Cor = [58, 8, 120];
const DOURADO: Cor = [240, 180, 17];
const CINZA: Cor = [90, 90, 100];
const TEXTO: Cor = [30, 30, 40];
const FUNDO_SUAVE: Cor = [244, 240, 252];
const MARGEM = 15;
const LARGURA_PAGINA = 210;
const ALTURA_PAGINA = 297;

export type EscopoPdf = "tudo" | "geral" | { lugar: string };

type Dados = {
  nome: string;
  descricao: string;
  plano: PlanoTatico;
  catalogo: Catalogo;
  escopo: EscopoPdf;
};

/** Em palavras: para onde o jogador anda em relação ao lugar da formação. */
function descreverPosicao(plano: PlanoTatico, lugar: string, fase: Fase): string {
  const base = layoutDaFormacao(plano.formacao)[lugar];
  const pos = posicaoDoLugar(plano, lugar, fase);
  const dy = pos.y - base.y;
  const lado = Math.abs(pos.x - 200) - Math.abs(base.x - 200);
  const partes: string[] = [];
  if (dy < -30) partes.push("avança em direção ao ataque");
  else if (dy > 30) partes.push("recua para ajudar a defesa");
  else partes.push("mantém a altura da posição");
  if (lado > 25) partes.push("abre mais pelo lado");
  else if (lado < -25) partes.push("fecha para o meio");
  return partes.join(", ");
}

function desenharCampo(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  plano: PlanoTatico,
  fase: Fase,
  destaque?: string,
) {
  const k = largura / 400;
  doc.setFillColor(47, 125, 59);
  doc.roundedRect(x, y, largura, 560 * k, 2, 2, "F");
  doc.setFillColor(42, 115, 54);
  for (const i of [1, 3, 5, 7, 9]) doc.rect(x, y + i * 56 * k, largura, 56 * k, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.rect(x + 14 * k, y + 14 * k, 372 * k, 532 * k);
  doc.line(x + 14 * k, y + 280 * k, x + 386 * k, y + 280 * k);
  doc.circle(x + 200 * k, y + 280 * k, 48 * k);
  doc.rect(x + 100 * k, y + 446 * k, 200 * k, 100 * k);
  doc.rect(x + 100 * k, y + 14 * k, 200 * k, 100 * k);

  const outra: Fase = fase === "com_bola" ? "sem_bola" : "com_bola";
  const lugares = Object.keys(layoutDaFormacao(plano.formacao));

  // setas (movimento em relação à outra fase)
  doc.setDrawColor(...DOURADO);
  doc.setLineWidth(0.5);
  for (const lugar of lugares) {
    if (lugar === "GOL") continue;
    if (destaque && lugar !== destaque) continue;
    const de = posicaoDoLugar(plano, lugar, outra);
    const para = posicaoDoLugar(plano, lugar, fase);
    const dist = Math.hypot(para.x - de.x, para.y - de.y);
    if (dist < 18) continue;
    const ux = (para.x - de.x) / dist;
    const uy = (para.y - de.y) / dist;
    const fim = { x: para.x - ux * 24, y: para.y - uy * 24 };
    doc.setLineDashPattern([1.2, 0.9], 0);
    doc.line(x + de.x * k, y + de.y * k, x + fim.x * k, y + fim.y * k);
    doc.setLineDashPattern([], 0);
    // ponta da seta
    const px = -uy;
    const py = ux;
    const a = 9;
    doc.setFillColor(...DOURADO);
    doc.triangle(
      x + (fim.x + ux * a) * k,
      y + (fim.y + uy * a) * k,
      x + (fim.x - px * 6) * k,
      y + (fim.y - py * 6) * k,
      x + (fim.x + px * 6) * k,
      y + (fim.y + py * 6) * k,
      "F",
    );
  }

  for (const lugar of lugares) {
    const pos =
      lugar === "GOL" ? layoutDaFormacao(plano.formacao).GOL : posicaoDoLugar(plano, lugar, fase);
    const cx = x + pos.x * k;
    const cy = y + pos.y * k;
    const apagado = destaque && lugar !== destaque;
    if (lugar === "GOL") doc.setFillColor(...DOURADO);
    else doc.setFillColor(...(apagado ? ([150, 120, 200] as Cor) : ROXO));
    doc.setDrawColor(...(lugar === destaque ? DOURADO : ([255, 255, 255] as Cor)));
    doc.setLineWidth(lugar === destaque ? 1.2 : 0.5);
    doc.circle(cx, cy, 22 * k, "FD");
    doc.setTextColor(...(lugar === "GOL" ? ([30, 20, 50] as Cor) : ([255, 255, 255] as Cor)));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(largura * 0.062);
    doc.text(lugar.slice(0, 3), cx, cy + 22 * k * 0.25, { align: "center" });
  }
}

export async function exportarTaticaPdf({ nome, descricao, plano, catalogo, escopo }: Dados) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const util = LARGURA_PAGINA - 2 * MARGEM;

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
    doc.setTextColor(...c);
    doc.text(t, x, y, opc);
  };
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
    doc.setTextColor(...c);
    for (const l of doc.splitTextToSize(t, largura) as string[]) {
      doc.text(l, x, y);
      y += tam * 0.42 + 1.4;
    }
    return y;
  };
  const secao = (t: string, y: number) => {
    doc.setFillColor(...DOURADO);
    doc.rect(MARGEM, y - 4, 1.6, 5.5, "F");
    texto(t.toUpperCase(), MARGEM + 4, y, 10.5, true, ROXO_ESCURO);
    return y + 6.5;
  };
  const faixa = (titulo: string, sub: string) => {
    doc.setFillColor(...ROXO);
    doc.rect(0, 0, LARGURA_PAGINA, 34, "F");
    doc.setFillColor(...DOURADO);
    doc.rect(0, 34, LARGURA_PAGINA, 1.6, "F");
    texto("SUPREMA CORTE FC · TÁTICA", MARGEM, 12, 9, true, DOURADO);
    texto(titulo, MARGEM, 23, 19, true, [255, 255, 255]);
    texto(sub, MARGEM, 30, 10, false, [235, 225, 250]);
  };

  const lugares = Object.keys(layoutDaFormacao(plano.formacao)).filter((l) => l !== "GOL");
  const papelDe = (lugar: string) => {
    const id = plano.jogadores[lugar]?.papel;
    return catalogo.papeis[lugar.slice(0, 3)]?.find((p) => p.id === id);
  };

  // ------------------------------------------------------------- página geral
  const paginaGeral = () => {
    faixa(nome, `Formação ${plano.formacao}${descricao ? " · " + descricao : ""}`.slice(0, 95));
    let y = 48;
    y = secao("Como o time se mexe", y);
    const larg = (util - 8) / 2;
    FASES.forEach((f, i) => {
      const x = MARGEM + i * (larg + 8);
      texto(f.nome, x + larg / 2, y, 11, true, ROXO, { align: "center" });
      desenharCampo(doc, x, y + 3, larg, plano, f.id);
    });
    y += 3 + 560 * (larg / 400) + 8;
    texto(
      "A seta dourada mostra para onde cada jogador se movimenta de uma fase para a outra.",
      MARGEM,
      y - 2,
      8.5,
      false,
      CINZA,
    );
    y += 5;

    y = secao("O time todo", y);
    for (const f of frasesDoTime(plano.time)) {
      texto("•", MARGEM + 1, y, 10, true, ROXO);
      y = paragrafo(f, MARGEM + 6, y, util - 6, 10);
    }
    if (plano.notas) {
      y += 2;
      doc.setFillColor(...FUNDO_SUAVE);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const linhas = doc.splitTextToSize(plano.notas, util - 8) as string[];
      const alt = linhas.length * 5.2 + 8;
      doc.roundedRect(MARGEM, y - 3, util, alt, 2, 2, "F");
      texto("Recado para o grupo", MARGEM + 4, y + 2, 9, true, ROXO);
      paragrafo(plano.notas, MARGEM + 4, y + 7, util - 8, 10);
      y += alt + 4;
    }
  };

  // Lista de papéis (segunda parte da geral)
  const paginaPapeis = () => {
    doc.addPage();
    faixa(nome, "Papel de cada posição");
    let y = 48;
    y = secao("Quem faz o quê", y);
    for (const lugar of lugares) {
      const papel = papelDe(lugar);
      const nota = plano.jogadores[lugar]?.nota;
      if (y > ALTURA_PAGINA - 30) {
        doc.addPage();
        y = 20;
      }
      doc.setFillColor(...ROXO);
      doc.circle(MARGEM + 4, y - 1.2, 4, "F");
      texto(lugar.slice(0, 3), MARGEM + 4, y - 0.1, 6.5, true, [255, 255, 255], {
        align: "center",
      });
      texto(nomeDoLugar(plano.formacao, lugar), MARGEM + 12, y, 11, true);
      texto(papel?.nome ?? "Sem papel definido", MARGEM + 70, y, 10, false, ROXO);
      y += 5;
      if (papel) y = paragrafo(papel.descricao, MARGEM + 12, y, util - 12, 9, CINZA);
      if (nota) y = paragrafo(`Orientação: ${nota}`, MARGEM + 12, y, util - 12, 9.5);
      y += 3;
    }
  };

  // ----------------------------------------------------- página de cada lugar
  const paginaDoLugar = (lugar: string) => {
    const papel = papelDe(lugar);
    const nota = plano.jogadores[lugar]?.nota;
    const f = lugar.slice(0, 3) as Funcao;
    faixa(nomeDoLugar(plano.formacao, lugar), `${nome} · ${plano.formacao} · ${FUNCAO_LABELS[f]}`);
    let y = 48;
    y = secao("Seu papel", y);
    texto(papel?.nome ?? "Papel livre", MARGEM, y, 14, true, ROXO);
    y += 6;
    if (papel) y = paragrafo(papel.descricao, MARGEM, y, util, 10.5);
    if (nota) {
      y += 2;
      doc.setFillColor(...FUNDO_SUAVE);
      const linhas = doc.splitTextToSize(nota, util - 8) as string[];
      const alt = linhas.length * 5.4 + 9;
      doc.roundedRect(MARGEM, y - 3, util, alt, 2, 2, "F");
      texto("Orientação do técnico", MARGEM + 4, y + 2, 9, true, ROXO);
      paragrafo(nota, MARGEM + 4, y + 8, util - 8, 10.5);
      y += alt + 3;
    }
    y += 4;
    y = secao("Seus movimentos", y);
    const larg = (util - 8) / 2;
    FASES.forEach((fs, i) => {
      const x = MARGEM + i * (larg + 8);
      texto(fs.nome, x + larg / 2, y, 11, true, ROXO, { align: "center" });
      desenharCampo(doc, x, y + 3, larg, plano, fs.id, lugar);
    });
    y += 3 + 560 * (larg / 400) + 5;
    for (const fs of FASES) {
      const frase = descreverPosicao(plano, lugar, fs.id);
      texto(`${fs.nome}:`, MARGEM, y, 10, true, ROXO);
      y = paragrafo(
        frase.charAt(0).toUpperCase() + frase.slice(1) + ".",
        MARGEM + 26,
        y,
        util - 26,
        10,
      );
    }
    y += 3;
    y = secao("O time todo", y);
    for (const frase of frasesDoTime(plano.time)) {
      texto("•", MARGEM + 1, y, 10, true, ROXO);
      y = paragrafo(frase, MARGEM + 6, y, util - 6, 9.5);
    }
  };

  let primeira = true;
  const novaPagina = () => {
    if (!primeira) doc.addPage();
    primeira = false;
  };
  if (escopo === "tudo" || escopo === "geral") {
    novaPagina();
    paginaGeral();
    paginaPapeis();
  }
  if (escopo === "tudo") {
    for (const lugar of lugares) {
      novaPagina();
      paginaDoLugar(lugar);
    }
  } else if (typeof escopo === "object") {
    novaPagina();
    paginaDoLugar(escopo.lugar);
  }

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

  const arquivo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const sufixo =
    typeof escopo === "object"
      ? `-${escopo.lugar.toLowerCase()}`
      : escopo === "geral"
        ? "-geral"
        : "";
  doc.save(`tatica-${arquivo || "time"}${sufixo}.pdf`);
}
