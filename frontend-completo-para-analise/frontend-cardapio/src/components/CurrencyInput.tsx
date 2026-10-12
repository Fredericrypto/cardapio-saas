// Input de dinheiro estilo "maquininha": os dígitos digitados são sempre
// interpretados como centavos entrando pela direita — digitar "350" vira
// "R$ 3,50", digitar mais um "3502" vira "R$ 35,02". Não tem ambiguidade
// entre "isso é real ou centavo" porque só existe UMA leitura possível
// (os 2 últimos dígitos são sempre centavos). O valor canônico fica em
// centavos (inteiro), nunca em float, evitando erro de arredondamento.
interface CurrencyInputProps {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  placeholder?: string;
  className?: string;
}

function formatCentsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function CurrencyInput({
  valueCents,
  onChangeCents,
  placeholder = 'R$ 0,00',
  className,
}: CurrencyInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitsOnly = e.target.value.replace(/\D/g, '');
    // Corta zeros à esquerda demais (evita number gigante colado sem querer)
    // mas deixa parseInt cuidar do resto — string vazia vira 0.
    const cents = digitsOnly ? parseInt(digitsOnly, 10) : 0;
    onChangeCents(cents);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={valueCents > 0 ? formatCentsToBRL(valueCents) : ''}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
}
