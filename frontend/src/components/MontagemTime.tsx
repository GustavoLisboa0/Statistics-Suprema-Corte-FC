import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { FUNCAO_LABELS, fetchCatalogo, type Funcao, type RegraComposicao } from "@/lib/escalacao";
import { useQuery } from "@tanstack/react-query";
import { CampoFormacao } from "@/components/CampoFormacao";
import { SeletorFormacao } from "@/components/EscalacaoControles";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Montagem do time: regras que INTERFEREM na escalação.
// Ex.: "nos volantes, pelo menos um rápido" ou "no lateral, pelo menos um canhoto".
// ---------------------------------------------------------------------------

/** Como falar de cada atributo no dia a dia (alto / baixo, singular e plural). */
const FALA_ATRIBUTO: Record<string, { alto: [string, string]; baixo: [string, string] }> = {
  pace: { alto: ["rápido", "rápidos"], baixo: ["mais lento", "mais lentos"] },
  fisico: { alto: ["forte", "fortes"], baixo: ["menos forte", "menos fortes"] },
  defesa: {
    alto: ["bom marcador", "bons marcadores"],
    baixo: ["menos marcador", "menos marcadores"],
  },
  finalizacao: {
    alto: ["bom finalizador", "bons finalizadores"],
    baixo: ["menos finalizador", "menos finalizadores"],
  },
  passe: {
    alto: ["bom passador", "bons passadores"],
    baixo: ["passe mais simples", "passe mais simples"],
  },
  visao: {
    alto: ["com boa visão", "com boa visão"],
    baixo: ["com menos visão", "com menos visão"],
  },
};

const PLURAL: Record<Funcao, string> = {
  ZAG: "zagueiros",
  LAT: "laterais",
  VOL: "volantes",
  MEI: "meias",
  ATA: "atacantes",
};

type Maneira = {
  id: string;
  texto: (nome: string, fala?: (typeof FALA_ATRIBUTO)[string]) => string;
};

const MANEIRAS_ATRIBUTO: Maneira[] = [
  { id: "pelo_menos_um", texto: (_n, f) => `Pelo menos um ${f?.alto[0]}` },
  { id: "altos", texto: (_n, f) => `Todos ${f?.alto[1]}` },
  { id: "misto", texto: (_n, f) => `Um ${f?.alto[0]} e um ${f?.baixo[0]}` },
  { id: "baixos", texto: (_n, f) => `Todos ${f?.baixo[1]}` },
];
const MANEIRAS_CARAC: Maneira[] = [
  { id: "pelo_menos_um", texto: (n) => `Pelo menos um: ${n}` },
  { id: "todos", texto: (n) => `Todos: ${n}` },
  { id: "nenhum", texto: (n) => `Ninguém: ${n}` },
];

/** Frase pronta de uma regra (ex.: "Volantes: pelo menos um rápido"). */
function fraseDaRegra(
  r: RegraComposicao,
  nomes: { atributo: (id: string) => string; carac: (id: string) => string },
): string {
  const setor = FUNCAO_LABELS[r.funcao] + "s";
  if (r.tipo === "atributo") {
    const m = MANEIRAS_ATRIBUTO.find((x) => x.id === r.modo);
    return `${setor}: ${m ? m.texto(nomes.atributo(r.chave), FALA_ATRIBUTO[r.chave]).toLowerCase() : r.modo}`;
  }
  const m = MANEIRAS_CARAC.find((x) => x.id === r.modo);
  return `${setor}: ${m ? m.texto(nomes.carac(r.chave)).toLowerCase() : r.modo}`;
}

function Pilula({
  ativa,
  onClick,
  children,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ativa
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card hover:border-primary",
      )}
    >
      {children}
    </button>
  );
}

export function MontagemDoTime({
  formacao,
  setFormacao,
  composicao,
  setComposicao,
}: {
  formacao: string;
  setFormacao: (v: string) => void;
  composicao: RegraComposicao[];
  setComposicao: (v: RegraComposicao[]) => void;
}) {
  const { data: c } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [setor, setSetor] = useState<Funcao | null>(null);
  const [tipo, setTipo] = useState<"atributo" | "carac">("atributo");
  const [chave, setChave] = useState("pace");
  const [modo, setModo] = useState("pelo_menos_um");

  const nomes = useMemo(
    () => ({
      atributo: (id: string) => c?.atributos.find((a) => a.id === id)?.nome ?? id,
      carac: (id: string) => c?.caracteristicas.find((a) => a.id === id)?.nome ?? id,
    }),
    [c],
  );
  const comRegra = useMemo(() => new Set(composicao.map((r) => r.funcao as string)), [composicao]);
  const marcas = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of comRegra) m[f] = `${composicao.filter((r) => r.funcao === f).length} regra(s)`;
    return m;
  }, [comRegra, composicao]);

  const maneiras = tipo === "atributo" ? MANEIRAS_ATRIBUTO : MANEIRAS_CARAC;
  const escolherItem = (t: "atributo" | "carac", id: string) => {
    setTipo(t);
    setChave(id);
    if (t !== tipo) setModo("pelo_menos_um");
  };

  const nova: RegraComposicao | null = setor ? { funcao: setor, tipo, chave, modo } : null;
  const jaExiste = nova && composicao.some((r) => JSON.stringify(r) === JSON.stringify(nova));
  const previa = nova ? fraseDaRegra(nova, nomes) : "";
  const regrasDoSetor = setor ? composicao.filter((r) => r.funcao === setor) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Montagem do time</h3>
          <p className="text-sm text-muted-foreground">
            Estas regras mexem na escalação: o sistema escolhe quem joga em cada setor para
            cumpri-las sempre que der (o tempo igual continua mandando).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSeletorAberto(true)}>
          Formação: {formacao}
        </Button>
      </div>
      <SeletorFormacao
        aberto={seletorAberto}
        onAbertoChange={setSeletorAberto}
        valor={formacao}
        onEscolher={setFormacao}
      />

      <div className="grid gap-6 md:grid-cols-[minmax(0,300px)_1fr]">
        <div className="space-y-2">
          <CampoFormacao
            formacao={formacao}
            comRegra={comRegra}
            marcas={marcas}
            selecionada={setor}
            onClickFuncao={setSetor}
            className="w-full max-w-[300px] justify-self-center"
          />
          <p className="text-center text-xs text-muted-foreground">
            Clique em um setor. Contorno dourado = já tem regra.
          </p>
        </div>

        <div className="space-y-4">
          {!setor ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Escolha um setor no campinho (zagueiros, laterais, volantes, meias ou atacantes) para
              criar a regra dele.
            </p>
          ) : (
            <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-xl tracking-wide">{FUNCAO_LABELS[setor]}s</p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSetor(null)}
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {regrasDoSetor.length > 0 && (
                <ul className="space-y-1">
                  {regrasDoSetor.map((r) => (
                    <li
                      key={JSON.stringify(r)}
                      className="flex items-center justify-between gap-2 rounded-md bg-card px-3 py-1.5 text-sm"
                    >
                      <span>{fraseDaRegra(r, nomes)}</span>
                      <button
                        type="button"
                        aria-label="Remover regra"
                        onClick={() => setComposicao(composicao.filter((x) => x !== r))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  1. O que importa nos {PLURAL[setor]}?
                </p>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atributos">
                    {c?.atributos.map((a) => (
                      <Pilula
                        key={a.id}
                        ativa={tipo === "atributo" && chave === a.id}
                        onClick={() => escolherItem("atributo", a.id)}
                      >
                        {a.nome}
                      </Pilula>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Características">
                    {c?.caracteristicas.map((a) => (
                      <Pilula
                        key={a.id}
                        ativa={tipo === "carac" && chave === a.id}
                        onClick={() => escolherItem("carac", a.id)}
                      >
                        {a.nome}
                      </Pilula>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  2. Como deve ser?
                </p>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="radiogroup"
                  aria-label="Como deve ser"
                >
                  {maneiras.map((m) => (
                    <Pilula key={m.id} ativa={modo === m.id} onClick={() => setModo(m.id)}>
                      {m.texto(
                        tipo === "atributo" ? nomes.atributo(chave) : nomes.carac(chave),
                        FALA_ATRIBUTO[chave],
                      )}
                    </Pilula>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                <p className="flex-1 text-sm">
                  Regra: <strong>{previa}</strong>
                </p>
                <Button
                  disabled={!!jaExiste}
                  onClick={() => nova && setComposicao([...composicao, nova])}
                >
                  <Plus className="mr-1 h-4 w-4" /> {jaExiste ? "Já adicionada" : "Adicionar regra"}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Regras ativas no time
            </p>
            {composicao.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma regra: só o tempo igual conta.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {composicao.map((r) => (
                  <li
                    key={JSON.stringify(r)}
                    className="flex items-center gap-1 rounded-full border bg-card py-1 pl-3 pr-1 text-sm"
                  >
                    {fraseDaRegra(r, nomes)}
                    <button
                      type="button"
                      aria-label="Remover regra"
                      onClick={() => setComposicao(composicao.filter((x) => x !== r))}
                      className="rounded-full p-1 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Dependem dos atributos e características preenchidos na aba Jogadores.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
