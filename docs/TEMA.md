# Tema claro/escuro do painel admin

- **Padrão: claro** (cores originais). O botão (lua/sol) fica no cabeçalho, ao lado das notificações.
- A escolha fica em `localStorage` (`cardapio-admin-theme`) e vale para todas as abas.
- `index.html` aplica a classe `dark` no `<html>` antes do primeiro paint (sem flash).
- Código: `src/lib/theme.ts` (estado), `src/hooks/useTheme.ts` (hook + paleta dos gráficos),
  `src/components/ThemeToggle.tsx` (botão), bloco `.dark` em `src/index.css` (cores).

## Paleta escura
| Uso | Cor |
|---|---|
| Fundo principal | `#131314` |
| Superfícies / cards | `#1E1E20` (nível 2: `#282A2C`) |
| Texto principal | `#E3E2E6` |
| Texto secundário / ícones | `#8E918F` e `#C4C7C5` |

## Como funciona (e como manter)
- Cinzas 400–900 e as famílias coloridas são remapeados por variáveis do Tailwind em `.dark`:
  qualquer `text-gray-900`, `bg-red-50`, `border-green-200`… já acompanha o tema.
- `bg-white` e os cinzas claros (50–300) têm regras explícitas, porque `text-gray-300` e
  `bg-white/10` também são usados sobre os cards SEMPRE escuros do Painel.
- Cor nova fora desse mapa: use a variante `dark:` (ex.: `bg-white dark:bg-[#1E1E20]`).
- Gráficos (recharts/SVG) não leem classes: usam `useChartPalette()`.
- Na impressão (cupom) o tema escuro é ignorado de propósito (`@media not print`).
