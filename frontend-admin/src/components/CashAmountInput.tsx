import { useRef } from 'react';

// Campo de dinheiro "de verdade", estilo caixa registradora / maquininha:
// os dígitos entram da DIREITA pra esquerda, sempre nos centavos —
// digitar "5" vira R$ 0,05; digitar "0" em seguida vira R$ 0,50; mais um
// "0" vira R$ 5,00. Backspace remove o último dígito (não a formatação).
// Isso evita o bug clássico de campo de dinheiro "normal" (type=number),
// onde digitar "50" já vira R$ 50,00 direto — fácil de errar o valor por
// uma casa decimal, o que é sério quando é dinheiro de verdade sendo
// conferido no caixa.
//
// O valor mora INTEIRO EM CENTAVOS (nunca float), pra nunca ter erro de
// arredondamento de ponto flutuante em cima de dinheiro.

const MAX_CENTS = 99_999_999; // R$ 999.999,99 — teto generoso, evita overflow visual

function formatCentsToBRL(cents: number): string {
  const value = cents / 100;
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface CashAmountInputProps {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  className?: string;
  autoFocus?: boolean;
}

export function CashAmountInput({ valueCents, onChangeCents, className, autoFocus }: CashAmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const next = valueCents * 10 + Number(e.key);
      onChangeCents(Math.min(next, MAX_CENTS));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onChangeCents(Math.floor(valueCents / 10));
    } else if (
      // Deixa passar navegação/atalhos (Tab, setas, copiar) — só bloqueia
      // digitação de texto livre, que bagunçaria a máscara.
      !['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) &&
      !(e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digitsOnly = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!digitsOnly) return;
    onChangeCents(Math.min(parseInt(digitsOnly, 10), MAX_CENTS));
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      value={formatCentsToBRL(valueCents)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onChange={() => {}} // controlado só via onKeyDown/onPaste — ignora digitação nativa
      className={className}
    />
  );
}

// Variante do campo acima pra valores de dinheiro OPCIONAIS (ex: "teto
// por pedido" — vazio tem um significado real: "sem teto", não "R$
// 0,00"). Mesma digitação de caixa registradora (centavos primeiro), mas
// `null` é um estado próprio, mostrado como `placeholder` em vez de "R$
// 0,00". Apagar tudo (backspace até zerar) volta pro estado vazio, não
// pra "R$ 0,00" — porque R$0,00 nunca é um teto/mínimo que faz sentido
// configurar de propósito.
interface OptionalCashAmountInputProps {
  valueCents: number | null;
  onChangeCents: (cents: number | null) => void;
  placeholder: string;
  className?: string;
}

export function OptionalCashAmountInput({
  valueCents,
  onChangeCents,
  placeholder,
  className,
}: OptionalCashAmountInputProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const next = (valueCents ?? 0) * 10 + Number(e.key);
      onChangeCents(Math.min(next, MAX_CENTS));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (valueCents == null) return;
      const next = Math.floor(valueCents / 10);
      onChangeCents(next === 0 ? null : next);
    } else if (
      !['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) &&
      !(e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digitsOnly = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!digitsOnly) return;
    onChangeCents(Math.min(parseInt(digitsOnly, 10), MAX_CENTS));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={valueCents == null ? '' : formatCentsToBRL(valueCents)}
      placeholder={placeholder}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onChange={() => {}}
      className={className}
    />
  );
}
