import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Matcher } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type DatePickerProps = {
  id?: string;
  /** Data em ISO (yyyy-MM-dd), como a API espera. String vazia = sem data. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  startMonth?: Date;
  endMonth?: Date;
  disabled?: Matcher | Matcher[];
  className?: string;
};

/** Converte o valor ISO em Date, ignorando datas inválidas vindas do banco. */
function parseValue(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

/**
 * Campo de data padrão do app: mostra dd/MM/yyyy, abre um calendário em
 * português e devolve o valor em ISO. Usado no cadastro de jogadores e de
 * partidas para que os dois tenham o mesmo visual e comportamento.
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Selecione a data",
  startMonth = new Date(1950, 0),
  endMonth = new Date(new Date().getFullYear() + 5, 11),
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseValue(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0" />
          {selected ? format(selected, "dd/MM/yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          captionLayout="dropdown"
          defaultMonth={selected}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={disabled}
          selected={selected}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
          formatters={{
            formatMonthDropdown: (date) => format(date, "MMMM", { locale: ptBR }),
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
