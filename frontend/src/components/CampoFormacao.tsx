import { layoutDaFormacao, type Funcao } from "@/lib/escalacao";
import { cn } from "@/lib/utils";

type Props = {
  formacao: string;
  /** Campinho pequeno: só bolinhas, sem letras. */
  mini?: boolean;
  /** Funções com regra de composição (ficam com contorno dourado). */
  comRegra?: Set<string>;
  /** Função selecionada (a que está sendo editada). */
  selecionada?: string | null;
  /** Clique numa bolinha (quando passado, as bolinhas viram botões). */
  onClickFuncao?: (funcao: Funcao) => void;
  className?: string;
};

/** Campinho só com as posições da formação (uma bolinha por lugar), no estilo de jogo de futebol. */
export function CampoFormacao({
  formacao,
  mini,
  comRegra,
  selecionada,
  onClickFuncao,
  className,
}: Props) {
  const posicoes = layoutDaFormacao(formacao);
  return (
    <svg
      viewBox="0 0 400 560"
      role="img"
      aria-label={`Desenho da formação ${formacao}`}
      className={cn("block", className)}
    >
      <rect x="0" y="0" width="400" height="560" rx="14" fill="#2f7d3b" />
      {[1, 3, 5, 7, 9].map((i) => (
        <rect key={i} x="0" y={i * 56} width="400" height="56" fill="#000" opacity="0.05" />
      ))}
      <g fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth={mini ? 5 : 2.5}>
        <rect x="14" y="14" width="372" height="532" />
        <line x1="14" y1="280" x2="386" y2="280" />
        <circle cx="200" cy="280" r="48" />
        <rect x="100" y="446" width="200" height="100" />
        <rect x="100" y="14" width="200" height="100" />
      </g>
      {Object.entries(posicoes).map(([lugar, { x, y }]) => {
        const funcao = lugar.slice(0, 3);
        const ativa = selecionada === funcao;
        const regra = comRegra?.has(funcao);
        const clicavel = !!onClickFuncao && lugar !== "GOL";
        return (
          <g
            key={lugar}
            transform={`translate(${x} ${y})`}
            onClick={clicavel ? () => onClickFuncao!(funcao as Funcao) : undefined}
            onKeyDown={
              clicavel
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onClickFuncao!(funcao as Funcao);
                    }
                  }
                : undefined
            }
            tabIndex={clicavel ? 0 : undefined}
            role={clicavel ? "button" : undefined}
            aria-label={clicavel ? `Regras de ${funcao}` : undefined}
            style={{ cursor: clicavel ? "pointer" : undefined }}
          >
            <circle
              r={mini ? 26 : 24}
              fill={lugar === "GOL" ? "#f0b411" : "#6410c9"}
              stroke={ativa ? "#f0b411" : regra ? "#f0b411" : "#fff"}
              strokeWidth={mini ? 7 : ativa ? 5 : regra ? 4 : 2.5}
            />
            {!mini && (
              <text
                y="5"
                textAnchor="middle"
                fontSize="14"
                fontWeight="700"
                fill={lugar === "GOL" ? "#1f1235" : "#fff"}
                fontFamily="Barlow, system-ui, sans-serif"
              >
                {funcao}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
