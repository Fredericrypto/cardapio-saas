import type { ComponentPropsWithRef, CSSProperties, ReactNode } from 'react';
import { useOptionalTenant } from '../contexts/TenantContext';
import { useTheme } from '../hooks/useTheme';
import { ctaBorderColors } from '../lib/ctaBorder';

// Botão de ação principal com a borda animada: dois pontos com cauda girando em
// volta do botão, nas cores do restaurante (primária + secundária). Só a borda:
// sem sombra e sem brilho.
//
// Como funciona (CSS em index.css, classes `.cta-border*`): o botão é a moldura
// (2px de padding + overflow hidden); dentro dele um quadrado com
// `conic-gradient` (dois cometas) gira com `transform: rotate` — só transform, então roda no
// compositor (GPU) sem repintar —, e por cima fica o preenchimento sólido. O
// que sobra visível do gradiente é a borda.
//
// - `animation="always"` (padrão): gira sempre. Use nos poucos CTAs de cada tela.
// - `animation="hover"`: borda e giro só com mouse/foco. Para botões repetidos
//   em grade (o "+" dos cards), onde dezenas girando juntos seriam ruído e custo.
// - disabled / `animated={false}`: sem giro e sem borda.
// - prefers-reduced-motion: borda estática (sem giro).
export interface AnimatedGradientButtonProps
  extends Omit<ComponentPropsWithRef<'button'>, 'style' | 'children'> {
  children: ReactNode;
  /** `button` (padrão) ou `span` (role="button"), para quando já há um <button> pai. */
  as?: 'button' | 'span';
  /** Classes da moldura: largura, raio (`rounded-*`), margem, posição. Padrão `w-full rounded-xl`. */
  className?: string;
  /** Classes da camada de dentro: layout, padding, tipografia. */
  contentClassName?: string;
  /** Troca as cores do preenchimento (ex.: estado "adicionado" em verde). */
  fillClassName?: string;
  animation?: 'always' | 'hover';
  /** false = desliga giro e brilho (ex.: estado de sucesso). */
  animated?: boolean;
  style?: CSSProperties;
}

// Mesma convenção dos outros CTAs: cor da marca no claro, sólido claro no escuro.
const DEFAULT_FILL = 'bg-[var(--brand)] text-[#FFFFFF] dark:bg-[#E3E2E6] dark:text-[#131314]';

export function AnimatedGradientButton({
  children,
  as = 'button',
  className = 'w-full rounded-xl',
  contentClassName = '',
  fillClassName = DEFAULT_FILL,
  animation = 'always',
  animated = true,
  disabled,
  style,
  ...rest
}: AnimatedGradientButtonProps) {
  const tenant = useOptionalTenant();
  const { isDark } = useTheme();
  const colors = ctaBorderColors(tenant?.primaryColor, tenant?.secondaryColor, isDark);

  const vars = {
    '--brand': colors.brand,
    '--cta-a': colors.a,
    '--cta-b': colors.b,
    ...style,
  } as CSSProperties;

  const off = disabled || !animated;
  const cls = ['cta-border', animation === 'hover' && 'cta-border--hover', off && 'cta-border--off', className]
    .filter(Boolean)
    .join(' ');
  const fillCls = ['cta-border__fill', fillClassName, contentClassName].filter(Boolean).join(' ');

  const inner = (
    <>
      <span className="cta-border__ring" aria-hidden="true" />
      <span className={fillCls}>{children}</span>
    </>
  );

  if (as === 'span') {
    const { type: _type, form: _form, ...spanRest } = rest;
    void _type;
    void _form;
    return (
      <span
        role="button"
        aria-disabled={disabled || undefined}
        className={cls}
        style={vars}
        {...(spanRest as ComponentPropsWithRef<'span'>)}
      >
        {inner}
      </span>
    );
  }

  return (
    <button type="button" disabled={disabled} className={cls} style={vars} {...rest}>
      {inner}
    </button>
  );
}
