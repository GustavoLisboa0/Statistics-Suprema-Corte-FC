import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Save } from "lucide-react";
import { toast } from "sonner";

import {
  ATRIBUTOS,
  fetchAtributos,
  fetchCatalogo,
  fetchContraEstrategia,
  fetchNota,
  salvarAdversario,
  salvarAtributos,
  salvarNota,
  type Adversario,
  type Analise,
  type AtributoId,
  type AtributosJogador,
} from "@/lib/escalacao";
import { NumberInput } from "@/components/NumberInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Tudo aqui é INTERNO do admin: só é renderizado para quem é editor e nada
// disto entra no PDF nem na escalação que os outros usuários enxergam.
// ---------------------------------------------------------------------------

type PropsTatica = {
  partidaId: string;
  tatica: string | null;
  setTatica: (v: string | null) => void;
  estrategia: string;
  setEstrategia: (v: string) => void;
  forca: number;
  setForca: (v: number) => void;
};

/** Escolha de tática/estratégia + sugestão contra o adversário. */
export function CartaoTatica({
  partidaId,
  tatica,
  setTatica,
  estrategia,
  setEstrategia,
  forca,
  setForca,
}: PropsTatica) {
  const { data: catalogo } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  const [verSugestao, setVerSugestao] = useState(false);
  const sugestao = useQuery({
    queryKey: ["contra-estrategia", partidaId],
    queryFn: () => fetchContraEstrategia(partidaId),
    enabled: verSugestao,
  });

  const taticaAtual = catalogo?.taticas.find((t) => t.id === tatica);
  const estrategiaAtual = catalogo?.estrategias.find((e) => e.id === estrategia);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Tática e estratégia <Badge variant="outline">só administrador</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          A tática muda quem o sistema prefere em campo (usa os atributos dos jogadores). O tempo de
          cada um continua igual — a tática decide só <strong>quem</strong> joga em cada momento.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Tática</Label>
            <Select
              value={tatica ?? "nenhuma"}
              onValueChange={(v) => setTatica(v === "nenhuma" ? null : v)}
            >
              <SelectTrigger aria-label="Tática">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Sem tática</SelectItem>
                {catalogo?.taticas.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {taticaAtual && (
              <p className="text-xs text-muted-foreground">{taticaAtual.descricao}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Estratégia</Label>
            <Select value={estrategia} onValueChange={setEstrategia} disabled={!tatica}>
              <SelectTrigger aria-label="Estratégia">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalogo?.estrategias.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {estrategiaAtual && (
              <p className="text-xs text-muted-foreground">{estrategiaAtual.descricao}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Quanto a tática pesa: {forca}%</Label>
            <Slider
              min={10}
              max={100}
              step={10}
              value={[forca]}
              onValueChange={(v) => setForca(v[0])}
              disabled={!tatica}
              aria-label="Quanto a tática pesa"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-dashed p-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setVerSugestao(true)}>
              <Lightbulb className="mr-1 h-4 w-4" /> Sugerir contra o adversário
            </Button>
            {sugestao.isFetching && (
              <span className="text-sm text-muted-foreground">Pensando…</span>
            )}
          </div>
          {sugestao.data?.aviso && (
            <p className="text-sm text-muted-foreground">{sugestao.data.aviso}</p>
          )}
          {sugestao.data?.sugestao && (
            <div className="space-y-2 text-sm">
              <p>
                Contra <strong>{sugestao.data.adversario}</strong>: tática{" "}
                <strong>{sugestao.data.sugestao.tatica_nome}</strong>, estratégia{" "}
                <strong>{sugestao.data.sugestao.estrategia_nome}</strong>.
              </p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {sugestao.data.sugestao.motivos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              {sugestao.data.historico.jogos > 0 && (
                <p className="text-xs text-muted-foreground">
                  Histórico: {sugestao.data.historico.jogos} jogo(s),{" "}
                  {sugestao.data.historico.vitorias}V {sugestao.data.historico.empates}E{" "}
                  {sugestao.data.historico.derrotas}D, gols {sugestao.data.historico.gols_pro}x
                  {sugestao.data.historico.gols_contra}.
                </p>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setTatica(sugestao.data!.sugestao!.tatica);
                  setEstrategia(sugestao.data!.sugestao!.estrategia);
                  toast.success("Sugestão aplicada. Clique em Gerar.");
                }}
              >
                Usar esta sugestão
              </Button>
            </div>
          )}
          <PerfilAdversario
            partidaId={partidaId}
            aoSalvar={() => sugestao.refetch()}
            ativo={verSugestao}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PerfilAdversario({
  partidaId,
  aoSalvar,
  ativo,
}: {
  partidaId: string;
  aoSalvar: () => void;
  ativo: boolean;
}) {
  const { data: catalogo } = useQuery({ queryKey: ["escalacao-catalogo"], queryFn: fetchCatalogo });
  const { data } = useQuery({
    queryKey: ["contra-estrategia", partidaId],
    queryFn: () => fetchContraEstrategia(partidaId),
    enabled: ativo,
  });
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ ataque: "", meio: "", defesa: "", estilo: "equilibrado", obs: "" });

  useEffect(() => {
    const p = data?.perfil;
    if (p)
      setF({
        ataque: p.ataque ? String(p.ataque) : "",
        meio: p.meio ? String(p.meio) : "",
        defesa: p.defesa ? String(p.defesa) : "",
        estilo: p.estilo ?? "equilibrado",
        obs: p.observacoes ?? "",
      });
  }, [data?.perfil]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarAdversario({
        nome: data?.adversario ?? "",
        ataque: Number(f.ataque) || null,
        meio: Number(f.meio) || null,
        defesa: Number(f.defesa) || null,
        estilo: f.estilo,
        observacoes: f.obs || null,
      } as Adversario),
    onSuccess: () => {
      toast.success("Perfil do adversário salvo.");
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!ativo || !data) return null;
  return (
    <div className="space-y-3">
      <Button variant="link" className="h-auto p-0" onClick={() => setAberto((v) => !v)}>
        {aberto ? "Esconder" : "Cadastrar/editar"} perfil de {data.adversario}
      </Button>
      {aberto && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Notas de 1 (fraco) a 10 (muito forte).</p>
          <div className="grid gap-3 sm:grid-cols-4">
            {(["ataque", "meio", "defesa"] as const).map((k) => (
              <div key={k} className="space-y-1">
                <Label className="capitalize">{k}</Label>
                <NumberInput
                  value={f[k]}
                  onChange={(v) => setF((s) => ({ ...s, [k]: v }))}
                  min={1}
                  max={10}
                  maxDigits={2}
                  placeholder="—"
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label>Estilo</Label>
              <Select value={f.estilo} onValueChange={(v) => setF((s) => ({ ...s, estilo: v }))}>
                <SelectTrigger aria-label="Estilo do adversário">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalogo?.estilos.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            value={f.obs}
            onChange={(e) => setF((s) => ({ ...s, obs: e.target.value }))}
            placeholder="Observações sobre o adversário (opcional)"
            maxLength={1000}
          />
          <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            <Save className="mr-1 h-4 w-4" /> Salvar perfil
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atributos dos jogadores
// ---------------------------------------------------------------------------
export function CartaoAtributos({ idsDoElenco }: { idsDoElenco: string[] }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["atributos"],
    queryFn: fetchAtributos,
    enabled: aberto,
  });
  const lista = (data ?? []).filter((a) => idsDoElenco.includes(a.jogador_id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Atributos dos jogadores <Badge variant="outline">só administrador</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Notas de 1 a 100. Quem não tem nota vale 50. Ninguém além de você vê isto, e nada sai no
          PDF.
        </p>
        <Button variant="link" className="h-auto w-fit p-0" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Esconder" : "Mostrar e editar"} atributos
        </Button>
      </CardHeader>
      {aberto && (
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Jogador</th>
                  {ATRIBUTOS.map((a) => (
                    <th key={a.id} className="px-1 font-medium">
                      {a.nome}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => (
                  <LinhaAtributos
                    key={a.jogador_id}
                    a={a}
                    aoSalvar={() => qc.invalidateQueries({ queryKey: ["atributos"] })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function LinhaAtributos({ a, aoSalvar }: { a: AtributosJogador; aoSalvar: () => void }) {
  const inicial = () =>
    Object.fromEntries(ATRIBUTOS.map((x) => [x.id, a[x.id] ? String(a[x.id]) : ""])) as Record<
      AtributoId,
      string
    >;
  const [valores, setValores] = useState(inicial);
  const salvar = useMutation({
    mutationFn: () =>
      salvarAtributos(
        a.jogador_id,
        Object.fromEntries(ATRIBUTOS.map((x) => [x.id, Number(valores[x.id]) || null])),
      ),
    onSuccess: () => {
      toast.success(`Atributos de ${a.nome} salvos.`);
      aoSalvar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <tr className="border-t">
      <td className="py-1 pr-2">{a.nome}</td>
      {ATRIBUTOS.map((x) => (
        <td key={x.id} className="px-1">
          <NumberInput
            value={valores[x.id]}
            onChange={(v) => setValores((s) => ({ ...s, [x.id]: v }))}
            min={1}
            max={100}
            maxDigits={3}
            placeholder="50"
            className="w-24"
          />
        </td>
      ))}
      <td className="pl-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending}
        >
          Salvar
        </Button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Análise e nota interna da escalação
// ---------------------------------------------------------------------------
export function CartaoAnalise({ analise }: { analise: Analise }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Força do time nesta escalação <Badge variant="outline">só administrador</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Nota geral: <strong className="text-lg">{analise.nota_geral}</strong> / 100
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px]">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="py-1 font-medium">Momento</th>
                <th className="font-medium">Time</th>
                <th className="font-medium">Defesa</th>
                <th className="font-medium">Meio</th>
                <th className="font-medium">Ataque</th>
              </tr>
            </thead>
            <tbody>
              {analise.janelas.map((j) => (
                <tr key={j.inicio} className="border-t">
                  <td className="py-1">
                    {j.inicio}' – {j.fim}'
                  </td>
                  <td className="font-medium">{j.nota}</td>
                  <td>{j.setores.defesa}</td>
                  <td>{j.setores.meio}</td>
                  <td>{j.setores.ataque}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {analise.pontos_de_atencao.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {analise.pontos_de_atencao.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function CartaoNota({ partidaId }: { partidaId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["escalacao-nota", partidaId],
    queryFn: () => fetchNota(partidaId),
  });
  const [texto, setTexto] = useState("");
  useEffect(() => {
    if (data) setTexto(data.texto);
  }, [data]);
  const salvar = useMutation({
    mutationFn: () => salvarNota(partidaId, texto),
    onSuccess: () => toast.success("Nota salva (fica só para você)."),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Nota interna do time <Badge variant="outline">só administrador</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Anotações suas sobre esta escalação. Não aparece para os jogadores nem no PDF.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: cuidado com o lado esquerdo deles; o Kaique está voltando de lesão…"
            maxLength={4000}
            rows={4}
            aria-label="Nota interna do time"
          />
        )}
        <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          <Save className="mr-1 h-4 w-4" /> Salvar nota
        </Button>
      </CardContent>
    </Card>
  );
}
