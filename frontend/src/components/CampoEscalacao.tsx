import { layoutDaFormacao, type JogadorResumo, type Lugar } from "@/lib/escalacao";

const ROTULO_CURTO: Record<string, string> = {
  GOL: "GOL",
  ZAG: "ZAG",
  LAT: "LAT",
  VOL: "VOL",
  MEI: "MEI",
  ATA: "ATA",
};

/** Corta nomes longos para caber embaixo da bolinha. */
function nomeCurto(nome: string): string {
  return nome.length > 11 ? `${nome.slice(0, 10)}…` : nome;
}

type Props = {
  lugares: Record<Lugar, string>;
  formacao?: string;
  jogadores: Record<string, JogadorResumo>;
  /** Jogadores a destacar (ex.: quem acabou de entrar). */
  destaque?: Set<string>;
  className?: string;
};

/** Campinho em SVG (qualquer formação), com cada jogador no seu lugar. */
export function CampoEscalacao({
  lugares,
  formacao = "4-4-2",
  jogadores,
  destaque,
  className,
}: Props) {
  const posicoes = layoutDaFormacao(formacao);
  return (
    <svg
      viewBox="0 0 400 560"
      role="img"
      aria-label={`Campinho com a escalação em ${formacao}`}
      className={className}
    >
      <rect x="0" y="0" width="400" height="560" rx="14" fill="#2f7d3b" />
      {/* faixas do gramado */}
      {[0, 2, 4, 6, 8].map((i) => (
        <rect key={i} x="0" y={i * 56 + 0} width="400" height="56" fill="#000" opacity="0.05" />
      ))}
      <g fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="2.5">
        <rect x="14" y="14" width="372" height="532" />
        <line x1="14" y1="280" x2="386" y2="280" />
        <circle cx="200" cy="280" r="48" />
        {/* áreas de baixo (nossa) e de cima */}
        <rect x="100" y="446" width="200" height="100" />
        <rect x="150" y="500" width="100" height="46" />
        <rect x="100" y="14" width="200" height="100" />
        <rect x="150" y="14" width="100" height="46" />
      </g>
      <circle cx="200" cy="280" r="3" fill="#fff" opacity="0.75" />

      {Object.keys(posicoes).map((lugar) => {
        const id = lugares[lugar];
        const jogador = id ? jogadores[id] : undefined;
        const { x, y } = posicoes[lugar];
        const novo = id ? destaque?.has(id) : false;
        return (
          <g key={lugar} transform={`translate(${x} ${y})`}>
            <circle
              r="22"
              fill="#6410c9"
              stroke={novo ? "#f0b411" : "#fff"}
              strokeWidth={novo ? 4 : 2.5}
            />
            <text
              y="6"
              textAnchor="middle"
              fontSize="17"
              fontWeight="700"
              fill="#fff"
              fontFamily="Barlow, system-ui, sans-serif"
            >
              {jogador?.numero_camisa ?? ROTULO_CURTO[lugar.slice(0, 3)]}
            </text>
            <text
              y="42"
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              fill="#fff"
              stroke="#0b2e12"
              strokeWidth="3.5"
              paintOrder="stroke"
              fontFamily="Barlow, system-ui, sans-serif"
            >
              {jogador ? nomeCurto(jogador.nome) : "—"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
