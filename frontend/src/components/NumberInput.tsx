import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type NumberInputProps = {
  id?: string;
  /** Valor como string para permitir campo vazio (ex: camisa sem número). */
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Limite de dígitos digitados (ex: 3 na camisa). */
  maxDigits?: number;
  placeholder?: string;
  /** Classes do wrapper (largura costuma vir aqui). */
  className?: string;
  /** Classes do input em si (altura costuma vir aqui). */
  inputClassName?: string;
};

/**
 * Campo numérico com setas próprias.
 *
 * As setas nativas do `input[type=number]` não são estilizáveis de forma
 * consistente entre navegadores — no escuro elas ficavam brancas. Aqui o
 * input é texto com filtro de dígitos e as setas são botões nossos, que
 * seguem os tokens do tema.
 */
export function NumberInput({
  id,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  maxDigits,
  placeholder,
  className,
  inputClassName,
}: NumberInputProps) {
  const limitar = (n: number) => Math.min(max, Math.max(min, n));
  const atual = value === "" ? null : Number(value);

  const passo = (direcao: 1 | -1) => onChange(String(limitar((atual ?? min) + direcao * step)));

  const digitar = (bruto: string) => {
    let digitos = bruto.replace(/\D/g, "");
    if (maxDigits) digitos = digitos.slice(0, maxDigits);
    onChange(digitos === "" ? "" : String(limitar(Number(digitos))));
  };

  const seta =
    "flex flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={(e) => digitar(e.target.value)}
        className={cn("pr-6", inputClassName)}
      />
      {/* tabIndex -1: a navegação por teclado usa o próprio input */}
      <div className="absolute inset-y-px right-px flex w-5 flex-col overflow-hidden rounded-r-md border-l border-input">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Aumentar"
          onClick={() => passo(1)}
          disabled={atual !== null && atual >= max}
          className={seta}
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Diminuir"
          onClick={() => passo(-1)}
          disabled={atual !== null && atual <= min}
          className={cn(seta, "border-t border-input")}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
