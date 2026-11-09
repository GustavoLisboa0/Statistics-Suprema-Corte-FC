import { useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import {
  layoutDaFormacao,
  type Catalogo,
  type Funcao,
  type JogadaEnsaiada,
  type PlanoTatico,
} from "@/lib/escalacao";
import { SITUACAO_CURTA } from "@/lib/jogadaEnsaiada";
import {
  FASES,
  NIVEIS,
  ROTULO_AJUSTE,
  nomeDoLugar,
  planoDoModelo,
  posicaoDoLugar,
  trocarFormacaoDoPlano,
  type Fase,
} from "@/lib/quadroTatico";
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

const PAPEL_CURTO: Record<string, string> = {
  seguranca: "segurança",
  sai_jogando: "sai jogando",
  marcador: "marcador",
  apoiador: "apoia",
  ala: "ala",
  por_dentro: "por dentro",
  primeiro_passe: "1º passe",
  box_to_box: "vai e volta",
  armador: "armador",
  infiltrado: "chega na área",
  aberto: "aberto",
  pressao: "pressiona",
  referencia: "referência",
  movel: "móvel",
  ponta: "ponta",
};

// ---------------------------------------------------------------------------
// Campinho em que dá para ARRASTAR cada jogador (como no FIFA).
// ---------------------------------------------------------------------------
function CampoTatico({
  plano,
  fase,
  selecionado,
  aoSelecionar,
  aoMover,
}: {
  plano: PlanoTatico;
  fase: Fase;
  selecionado: string | null;
  aoSelecionar: (lugar: string | null) => void;
  aoMover: (lugar: string, x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const outra: Fase = fase === "com_bola" ? "sem_bola" : "com_bola";
  const lugares = useMemo(() => Object.keys(layoutDaFormacao(plano.formacao)), [plano.formacao]);

  const paraCampo = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const ponto = svg.createSVGPoint();
    ponto.x = e.clientX;
    ponto.y = e.clientY;
    const m = svg.getScreenCTM()!.inverse();
    const p = ponto.matrixTransform(m);
    return { x: p.x, y: p.y };
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 400 560"
      role="group"
      aria-label="Campinho tático: arraste os jogadores"
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
        <marker
          id="seta"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#f0b411" />
        </marker>
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
      </g>

      {/* Setas: de onde o jogador estava na outra fase até onde está agora */}
      {lugares
        .filter((l) => l !== "GOL")
        .map((lugar) => {
          const de = posicaoDoLugar(plano, lugar, outra);
          const para = posicaoDoLugar(plano, lugar, fase);
          const dist = Math.hypot(para.x - de.x, para.y - de.y);
          if (dist < 18) return null;
          const k = (dist - 26) / dist;
          return (
            <line
              key={`seta-${lugar}`}
              x1={de.x}
              y1={de.y}
              x2={de.x + (para.x - de.x) * k}
              y2={de.y + (para.y - de.y) * k}
              stroke="#f0b411"
              strokeWidth="3"
              strokeDasharray="7 5"
              strokeOpacity="0.85"
              markerEnd="url(#seta)"
              pointerEvents="none"
            />
          );
        })}

      {lugares.map((lugar) => {
        const goleiro = lugar === "GOL";
        const pos = goleiro
          ? layoutDaFormacao(plano.formacao).GOL
          : posicaoDoLugar(plano, lugar, fase);
        const papel = plano.jogadores[lugar]?.papel;
        const ativo = selecionado === lugar;
        return (
          <g
            key={lugar}
            transform={`translate(${pos.x} ${pos.y})`}
            style={{ cursor: goleiro ? "default" : arrastando === lugar ? "grabbing" : "grab" }}
            onPointerDown={(e) => {
              if (goleiro) return;
              e.stopPropagation();
              (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
              setArrastando(lugar);
              aoSelecionar(lugar);
            }}
            tabIndex={goleiro ? undefined : 0}
            role={goleiro ? undefined : "button"}
            aria-label={goleiro ? undefined : `${nomeDoLugar(plano.formacao, lugar)}: selecionar`}
            onKeyDown={(e) => {
              if (goleiro) return;
              const passo = e.shiftKey ? 20 : 8;
              const mov: Record<string, [number, number]> = {
                ArrowUp: [0, -passo],
                ArrowDown: [0, passo],
                ArrowLeft: [-passo, 0],
                ArrowRight: [passo, 0],
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
              <circle r="34" fill="none" stroke="#f0b411" strokeWidth="3" strokeOpacity="0.9" />
            )}
            <circle
              r="25"
              fill={goleiro ? "#f0b411" : "#6410c9"}
              stroke={ativo ? "#f0b411" : "#fff"}
              strokeWidth={ativo ? 4 : 2.5}
            />
            <text
              y="5"
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              fill={goleiro ? "#1f1235" : "#fff"}
              fontFamily="Barlow, system-ui, sans-serif"
              pointerEvents="none"
            >
              {lugar.slice(0, 3)}
            </text>
            {!goleiro && papel && (
              <text
                y="43"
                textAnchor="middle"
                fontSize="12.5"
                fontWeight="700"
                fill="#fff"
                stroke="#14532d"
                strokeWidth="3"
                paintOrder="stroke"
                fontFamily="Barlow, system-ui, sans-serif"
                pointerEvents="none"
              >
                {PAPEL_CURTO[papel] ?? papel}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Niveis({
  rotulo,
  valor,
  onChange,
  nomes,
}: {
  rotulo: string;
  valor: number;
  onChange: (v: number) => void;
  nomes: string[];
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm">{rotulo}</Label>
        <span className="text-xs font-semibold text-primary">{nomes[valor - 1]}</span>
      </div>
      <div role="radiogroup" aria-label={rotulo} className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valor === n}
            aria-label={`${rotulo}: ${nomes[n - 1]}`}
            onClick={() => onChange(n)}
            className={cn(
              "h-7 rounded-md border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              valor === n
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:border-primary",
              n < valor && "border-primary/40 bg-primary/10",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor completo do quadro tático
// ---------------------------------------------------------------------------
export type RascunhoTatica = {
  id?: string;
  nome: string;
  descricao: string;
  plano: PlanoTatico;
};

export function QuadroTatico({
  catalogo,
  inicial,
  jogadas = [],
  aoSalvar,
  aoCancelar,
}: {
  catalogo: Catalogo;
  inicial: RascunhoTatica;
  /** Jogadas ensaiadas salvas, para escolher quais fazem parte desta tática. */
  jogadas?: JogadaEnsaiada[];
  aoSalvar: (t: RascunhoTatica) => Promise<unknown>;
  aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [plano, setPlano] = useState<PlanoTatico>(inicial.plano);
  const [fase, setFase] = useState<Fase>("com_bola");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const atual = selecionado ? plano.jogadores[selecionado] : undefined;
  const funcao = selecionado?.slice(0, 3) as Funcao | undefined;

  const mexerJogador = (lugar: string, mudanca: Partial<NonNullable<typeof atual>>) =>
    setPlano((p) => {
      const novo = { ...(p.jogadores[lugar] ?? {}), ...mudanca };
      for (const k of Object.keys(novo) as (keyof typeof novo)[]) {
        if (novo[k] === undefined || novo[k] === "") delete novo[k];
      }
      const jogadores = { ...p.jogadores, [lugar]: novo };
      if (Object.keys(novo).length === 0) delete jogadores[lugar];
      return { ...p, jogadores };
    });

  const aoMover = (lugar: string, x: number, y: number) =>
    mexerJogador(lugar, {
      [fase]: {
        x: Math.round(Math.min(386, Math.max(14, x))),
        y: Math.round(Math.min(546, Math.max(14, y))),
      },
    });

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Dê um nome para a tática.");
      return;
    }
    setSalvando(true);
    try {
      await aoSalvar({ id: inicial.id, nome: nome.trim(), descricao, plano });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="nome-tatica">Nome da tática</Label>
          <Input
            id="nome-tatica"
            value={nome}
            maxLength={60}
            placeholder="Ex.: Pressão alta"
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="desc-tatica">Ideia em uma frase (opcional)</Label>
          <Input
            id="desc-tatica"
            value={descricao}
            maxLength={300}
            placeholder="Ex.: Marcar alto e sair rápido"
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Começar de um modelo</Label>
          <Select
            value=""
            onValueChange={(id) => {
              const m = catalogo.modelos.find((x) => x.id === id);
              if (!m) return;
              setPlano((p) => planoDoModelo(m, p.formacao));
              if (!nome.trim()) setNome(m.nome);
              if (!descricao.trim()) setDescricao(m.descricao);
              toast.success(`Modelo “${m.nome}” aplicado. Ajuste do seu jeito.`);
            }}
          >
            <SelectTrigger aria-label="Começar de um modelo" className="w-full md:w-52">
              <SelectValue placeholder="Escolher modelo" />
            </SelectTrigger>
            <SelectContent>
              {catalogo.modelos.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setSeletorAberto(true)}>
          Formação: {plano.formacao}
        </Button>
        <SeletorFormacao
          aberto={seletorAberto}
          onAbertoChange={setSeletorAberto}
          valor={plano.formacao}
          onEscolher={(f) => {
            setPlano((p) => trocarFormacaoDoPlano(p, f));
            setSelecionado(null);
          }}
        />
        <div
          role="tablist"
          aria-label="Fase do jogo"
          className="inline-flex rounded-lg border bg-card p-0.5"
        >
          {FASES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={fase === f.id}
              onClick={() => setFase(f.id)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                fase === f.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.nome}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {FASES.find((f) => f.id === fase)?.dica} Arraste os jogadores; a seta mostra o movimento
          entre as duas fases.
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div className="mx-auto w-full max-w-[340px]">
          <CampoTatico
            plano={plano}
            fase={fase}
            selecionado={selecionado}
            aoSelecionar={setSelecionado}
            aoMover={aoMover}
          />
        </div>

        <div className="space-y-5">
          {/* Jogador selecionado */}
          {selecionado && funcao ? (
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-xl tracking-wide">
                  {nomeDoLugar(plano.formacao, selecionado)}
                </p>
                {atual?.[fase] && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => mexerJogador(selecionado, { [fase]: undefined })}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" /> Voltar à posição sugerida
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Papel em campo
                </Label>
                <div role="radiogroup" aria-label="Papel em campo" className="grid gap-2">
                  {catalogo.papeis[funcao]?.map((p) => {
                    const ativo = atual?.papel === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        onClick={() =>
                          mexerJogador(selecionado, { papel: ativo ? undefined : p.id })
                        }
                        className={cn(
                          "rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          ativo ? "border-primary bg-primary/10" : "hover:border-primary/60",
                        )}
                      >
                        <span className="block text-sm font-semibold">{p.nome}</span>
                        <span className="block text-xs text-muted-foreground">{p.descricao}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="nota-jogador"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Orientação para este lugar (opcional)
                </Label>
                <Input
                  id="nota-jogador"
                  value={atual?.nota ?? ""}
                  maxLength={200}
                  placeholder="Ex.: Marcar o camisa 10 deles de perto"
                  onChange={(e) => mexerJogador(selecionado, { nota: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
              Clique em um jogador do campinho para escolher o papel dele, escrever uma orientação e
              arrastá-lo para onde ele deve ficar. Troque entre “Com a bola” e “Sem a bola” para
              mostrar como o time se mexe.
            </p>
          )}

          {/* Time todo */}
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              O time todo
            </p>
            <div className="grid gap-3">
              {(["defesa", "pressao", "largura"] as const).map((k) => (
                <Niveis
                  key={k}
                  rotulo={ROTULO_AJUSTE[k]}
                  valor={plano.time[k]}
                  nomes={NIVEIS[k]}
                  onChange={(v) => setPlano((p) => ({ ...p, time: { ...p.time, [k]: v } }))}
                />
              ))}
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Saída de bola</Label>
              <div role="radiogroup" aria-label="Saída de bola" className="flex flex-wrap gap-1.5">
                {catalogo.saidas_de_bola.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={plano.time.saida === s.id}
                    onClick={() =>
                      setPlano((p) => ({
                        ...p,
                        time: { ...p.time, saida: s.id as typeof p.time.saida },
                      }))
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      plano.time.saida === s.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card hover:border-primary",
                    )}
                  >
                    {s.nome}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="notas-gerais" className="text-sm">
                Recados para o grupo (opcional)
              </Label>
              <Textarea
                id="notas-gerais"
                rows={2}
                maxLength={600}
                value={plano.notas}
                placeholder="Ex.: Perdeu a bola? Todo mundo pressiona por 5 segundos."
                onChange={(e) => setPlano((p) => ({ ...p, notas: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Jogadas ensaiadas que fazem parte desta tática */}
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Jogadas ensaiadas desta tática
        </p>
        {jogadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Você ainda não criou jogadas ensaiadas. Crie na aba “Jogadas ensaiadas” e depois volte
            aqui para escolher quais entram nesta tática (e no PDF dela).
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {jogadas.map((j) => {
              const marcada = (plano.jogadas ?? []).includes(j.id);
              return (
                <label
                  key={j.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    marcada ? "border-primary bg-primary/5" : "hover:border-primary/50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[#6410c9]"
                    checked={marcada}
                    onChange={(e) =>
                      setPlano((p) => {
                        const atuais = (p.jogadas ?? []).filter((x) => x !== j.id);
                        return { ...p, jogadas: e.target.checked ? [...atuais, j.id] : atuais };
                      })
                    }
                  />
                  <span>
                    <span className="block font-medium">{j.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {SITUACAO_CURTA[j.situacao] ?? j.situacao} · {j.plano.passos.length} passo
                      {j.plano.passos.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          {inicial.id ? "Salvar alterações" : "Salvar tática"}
        </Button>
        <Button variant="outline" onClick={aoCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
