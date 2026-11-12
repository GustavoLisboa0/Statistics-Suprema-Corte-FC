import { useMemo, useRef, useState } from "react";
import { Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  layoutDaFormacao,
  type Catalogo,
  type PlanoJogada,
  type PosicaoNoCampo,
} from "@/lib/escalacao";
import {
  SITUACAO_CURTA,
  bolaNoPasso,
  posicaoNoPasso,
  trocarFormacaoDaJogada,
} from "@/lib/jogadaEnsaiada";
import { nomeDoLugar } from "@/lib/quadroTatico";
import { SeletorFormacao } from "@/components/EscalacaoControles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MAX_PASSOS = 8;
const limitar = (x: number, y: number): PosicaoNoCampo => ({
  x: Math.round(Math.min(386, Math.max(14, x))),
  y: Math.round(Math.min(546, Math.max(14, y))),
});

export type RascunhoJogada = {
  id?: string;
  nome: string;
  descricao: string;
  situacao: string;
  plano: PlanoJogada;
};

// ---------------------------------------------------------------------------
// Campinho de um passo: jogadores e a bola podem ser arrastados.
// ---------------------------------------------------------------------------
function CampoJogada({
  plano,
  passo,
  selecionado,
  aoSelecionar,
  aoMover,
}: {
  plano: PlanoJogada;
  passo: number;
  selecionado: string | null;
  aoSelecionar: (lugar: string | null) => void;
  aoMover: (id: string, x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const lugares = useMemo(() => Object.keys(layoutDaFormacao(plano.formacao)), [plano.formacao]);
  const bola = bolaNoPasso(plano, passo);
  const bolaAntes = passo > 0 ? bolaNoPasso(plano, passo - 1) : null;

  const paraCampo = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const ponto = svg.createSVGPoint();
    ponto.x = e.clientX;
    ponto.y = e.clientY;
    const p = ponto.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const seta = (
    de: PosicaoNoCampo,
    para: PosicaoNoCampo,
    cor: string,
    folga: number,
    k: string,
  ) => {
    const dist = Math.hypot(para.x - de.x, para.y - de.y);
    if (dist < 18) return null;
    const f = (dist - folga) / dist;
    return (
      <line
        key={k}
        x1={de.x}
        y1={de.y}
        x2={de.x + (para.x - de.x) * f}
        y2={de.y + (para.y - de.y) * f}
        stroke={cor}
        strokeWidth="3"
        strokeDasharray="7 5"
        strokeOpacity="0.9"
        markerEnd={`url(#seta-${cor === "#fff" ? "b" : "j"})`}
        pointerEvents="none"
      />
    );
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 400 560"
      role="group"
      aria-label="Campinho da jogada: arraste os jogadores e a bola"
      className="block w-full touch-none select-none"
      onPointerMove={(e) => {
        if (!arrastando) return;
        const { x, y } = paraCampo(e);
        aoMover(arrastando, x, y);
      }}
      onPointerUp={() => setArrastando(null)}
      onPointerCancel={() => setArrastando(null)}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) aoSelecionar(null);
      }}
    >
      <defs>
        {[
          ["j", "#d49c10"],
          ["b", "#ffffff"],
        ].map(([id, cor]) => (
          <marker
            key={id}
            id={`seta-${id}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" fill={cor} />
          </marker>
        ))}
      </defs>
      <rect x="0" y="0" width="400" height="560" rx="14" fill="#2f7d3b" />
      {[1, 3, 5, 7, 9].map((i) => (
        <rect key={i} x="0" y={i * 56} width="400" height="56" fill="#000" opacity="0.05" />
      ))}
      <g fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.5" pointerEvents="none">
        <rect x="14" y="14" width="372" height="532" />
        <line x1="14" y1="280" x2="386" y2="280" />
        <circle cx="200" cy="280" r="48" />
        <rect x="100" y="446" width="200" height="100" />
        <rect x="100" y="14" width="200" height="100" />
        <rect x="150" y="14" width="100" height="36" />
        <rect x="150" y="510" width="100" height="36" />
      </g>

      {passo > 0 &&
        lugares.map((lugar) =>
          seta(
            posicaoNoPasso(plano, passo - 1, lugar),
            posicaoNoPasso(plano, passo, lugar),
            "#d49c10",
            26,
            `s-${lugar}`,
          ),
        )}
      {bola && bolaAntes && seta(bolaAntes, bola, "#fff", 14, "s-bola")}

      {lugares.map((lugar) => {
        const goleiro = lugar === "GOL";
        const pos = posicaoNoPasso(plano, passo, lugar);
        const ativo = selecionado === lugar;
        const temPapel = !!plano.papeis[lugar];
        return (
          <g
            key={lugar}
            transform={`translate(${pos.x} ${pos.y})`}
            style={{ cursor: arrastando === lugar ? "grabbing" : "grab" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
              setArrastando(lugar);
              aoSelecionar(lugar);
            }}
            tabIndex={0}
            role="button"
            aria-label={`${nomeDoLugar(plano.formacao, lugar)}: selecionar`}
            onKeyDown={(e) => {
              const passoTecla = e.shiftKey ? 20 : 8;
              const mov: Record<string, [number, number]> = {
                ArrowUp: [0, -passoTecla],
                ArrowDown: [0, passoTecla],
                ArrowLeft: [-passoTecla, 0],
                ArrowRight: [passoTecla, 0],
              };
              if (mov[e.key]) {
                e.preventDefault();
                aoMover(lugar, pos.x + mov[e.key][0], pos.y + mov[e.key][1]);
              } else if (e.key === "Enter" || e.key === " ") {
                aoSelecionar(lugar);
              }
            }}
          >
            {ativo && (
              <circle r="34" fill="none" stroke="#d49c10" strokeWidth="3" strokeOpacity="0.9" />
            )}
            <circle
              r="25"
              fill={goleiro ? "#d49c10" : "#6410c9"}
              stroke={ativo || temPapel ? "#d49c10" : "#fff"}
              strokeWidth={ativo ? 4 : temPapel ? 3.5 : 2.5}
            />
            <text
              y="5"
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              fill={goleiro ? "#1f1235" : "#fff"}
              fontFamily="Archivo, system-ui, sans-serif"
              pointerEvents="none"
            >
              {lugar.slice(0, 3)}
            </text>
          </g>
        );
      })}

      {bola && (
        <g
          transform={`translate(${bola.x} ${bola.y})`}
          style={{ cursor: arrastando === "BOLA" ? "grabbing" : "grab" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
            setArrastando("BOLA");
            aoSelecionar(null);
          }}
          role="button"
          tabIndex={0}
          aria-label="Bola: arraste"
          onKeyDown={(e) => {
            const passoTecla = e.shiftKey ? 20 : 8;
            const mov: Record<string, [number, number]> = {
              ArrowUp: [0, -passoTecla],
              ArrowDown: [0, passoTecla],
              ArrowLeft: [-passoTecla, 0],
              ArrowRight: [passoTecla, 0],
            };
            if (mov[e.key]) {
              e.preventDefault();
              aoMover("BOLA", bola.x + mov[e.key][0], bola.y + mov[e.key][1]);
            }
          }}
        >
          <circle r="13" fill="#fff" stroke="#1f1235" strokeWidth="3" />
          <circle r="5" fill="#1f1235" />
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Editor completo de uma jogada ensaiada
// ---------------------------------------------------------------------------
export function EditorJogada({
  catalogo,
  inicial,
  aoSalvar,
  aoCancelar,
}: {
  catalogo: Catalogo;
  inicial: RascunhoJogada;
  aoSalvar: (j: RascunhoJogada) => Promise<unknown>;
  aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [situacao, setSituacao] = useState(inicial.situacao);
  const [plano, setPlano] = useState<PlanoJogada>(inicial.plano);
  const [passo, setPasso] = useState(0);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const mexerPasso = (i: number, mudanca: Partial<PlanoJogada["passos"][number]>) =>
    setPlano((p) => ({
      ...p,
      passos: p.passos.map((x, k) => (k === i ? { ...x, ...mudanca } : x)),
    }));

  const aoMover = (id: string, x: number, y: number) =>
    setPlano((p) => ({
      ...p,
      passos: p.passos.map((passoAtual, k) => {
        if (k !== passo) return passoAtual;
        const pos = limitar(x, y);
        return id === "BOLA"
          ? { ...passoAtual, bola: pos }
          : { ...passoAtual, posicoes: { ...passoAtual.posicoes, [id]: pos } };
      }),
    }));

  const adicionarPasso = () => {
    if (plano.passos.length >= MAX_PASSOS) return;
    setPlano((p) => ({ ...p, passos: [...p.passos, { texto: "", posicoes: {} }] }));
    setPasso(plano.passos.length);
  };
  const removerPasso = () => {
    if (plano.passos.length <= 1) return;
    setPlano((p) => ({ ...p, passos: p.passos.filter((_, k) => k !== passo) }));
    setPasso((a) => Math.max(0, a - 1));
  };

  const mudarPapel = (lugar: string, texto: string) =>
    setPlano((p) => {
      const papeis = { ...p.papeis };
      if (texto.trim()) papeis[lugar] = texto;
      else delete papeis[lugar];
      return { ...p, papeis };
    });

  const voltarPosicao = (lugar: string) =>
    mexerPasso(passo, {
      posicoes: Object.fromEntries(
        Object.entries(plano.passos[passo].posicoes).filter(([l]) => l !== lugar),
      ),
    });

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Dê um nome para a jogada.");
      return;
    }
    setSalvando(true);
    try {
      await aoSalvar({ id: inicial.id, nome: nome.trim(), descricao, situacao, plano });
    } finally {
      setSalvando(false);
    }
  };

  const atual = plano.passos[passo];
  const temBola = !!bolaNoPasso(plano, passo);

  return (
    <div className="space-y-5 rounded-2xl border bg-raised p-4 md:p-5">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="nome-jogada">Nome da jogada</Label>
          <Input
            id="nome-jogada"
            value={nome}
            maxLength={60}
            placeholder="Ex.: Escanteio na primeira trave"
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="desc-jogada">Ideia em uma frase (opcional)</Label>
          <Input
            id="desc-jogada"
            value={descricao}
            maxLength={300}
            placeholder="Ex.: Toque curto e cruzamento rasteiro"
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Quando acontece</Label>
          <Select value={situacao} onValueChange={setSituacao}>
            <SelectTrigger aria-label="Quando acontece" className="h-11 w-full md:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {catalogo.situacoes_ensaiadas.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {SITUACAO_CURTA[s.id] ?? s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="min-h-11 rounded-[10px] bg-card"
          onClick={() => setSeletorAberto(true)}
        >
          Formação: <span className="num text-lg text-primary">{plano.formacao}</span>
        </Button>
        <SeletorFormacao
          aberto={seletorAberto}
          onAbertoChange={setSeletorAberto}
          valor={plano.formacao}
          onEscolher={(f) => {
            setPlano((p) => trocarFormacaoDaJogada(p, f));
            setSelecionado(null);
          }}
        />
        <div role="tablist" aria-label="Passos da jogada" className="flex flex-wrap gap-1">
          {plano.passos.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={passo === i}
              onClick={() => setPasso(i)}
              className={cn(
                "min-h-11 rounded-[10px] border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                passo === i
                  ? "border-accent bg-accent font-bold text-accent-foreground"
                  : "bg-card font-medium hover:border-accent",
              )}
            >
              Passo {i + 1}
            </button>
          ))}
          {plano.passos.length < MAX_PASSOS && (
            <Button
              variant="outline"
              className="min-h-11 rounded-[10px] border-dashed bg-card"
              onClick={adicionarPasso}
            >
              <Plus aria-hidden="true" /> Passo
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada passo é um momento da jogada. Arraste os jogadores (e a bola) para onde estarão nesse
        passo; quem você não mexer continua onde estava. As setas mostram o movimento do passo
        anterior para este.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div className="mx-auto w-full max-w-[340px]">
          <CampoJogada
            plano={plano}
            passo={passo}
            selecionado={selecionado}
            aoSelecionar={setSelecionado}
            aoMover={aoMover}
          />
        </div>

        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="texto-passo" className="text-sm font-semibold">
                O que acontece no passo {passo + 1}
              </Label>
              <div className="flex flex-wrap gap-1">
                {!temBola && (
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-[10px] bg-card"
                    onClick={() => mexerPasso(passo, { bola: { x: 200, y: 280 } })}
                  >
                    Colocar a bola
                  </Button>
                )}
                {plano.passos.length > 1 && (
                  <Button variant="ghost" className="min-h-11" onClick={removerPasso}>
                    <Trash2 aria-hidden="true" /> Tirar passo
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              id="texto-passo"
              rows={2}
              maxLength={300}
              value={atual.texto}
              placeholder="Ex.: O lateral toca curto para o meia e corre para a área."
              onChange={(e) => mexerPasso(passo, { texto: e.target.value })}
            />
          </div>

          {selecionado ? (
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-display text-[15px] font-extrabold uppercase leading-tight">
                  {nomeDoLugar(plano.formacao, selecionado)}
                </h4>
                {atual.posicoes[selecionado] && (
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => voltarPosicao(selecionado)}
                  >
                    <RotateCcw aria-hidden="true" /> Voltar à posição anterior
                  </Button>
                )}
              </div>
              <Label htmlFor="papel-jogada" className="text-xs uppercase tracking-wide">
                O que ele faz nesta jogada (vai no PDF dele)
              </Label>
              <Input
                id="papel-jogada"
                maxLength={200}
                value={plano.papeis[selecionado] ?? ""}
                placeholder="Ex.: Cobra o escanteio curto"
                onChange={(e) => mudarPapel(selecionado, e.target.value)}
              />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
              Clique em um jogador para escrever o que ele faz nesta jogada. Jogadores com contorno
              dourado já têm uma função escrita.
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="notas-jogada" className="text-sm">
              Recados para o grupo (opcional)
            </Label>
            <Textarea
              id="notas-jogada"
              rows={2}
              maxLength={600}
              value={plano.notas}
              placeholder="Ex.: Combinar o sinal com a mão antes de cobrar."
              onChange={(e) => setPlano((p) => ({ ...p, notas: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={salvar} disabled={salvando} className="min-h-11 rounded-[10px] font-bold">
          {salvando ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          {inicial.id ? "Salvar alterações" : "Salvar jogada"}
        </Button>
        <Button variant="outline" className="min-h-11 rounded-[10px] bg-card" onClick={aoCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
