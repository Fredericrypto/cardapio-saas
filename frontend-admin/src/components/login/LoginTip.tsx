import type { ReactNode } from 'react';

// Tooltip só de CSS (aparece no hover e no foco do teclado). O controle que ela envolve
// continua responsável pelo próprio aria-label.
interface LoginTipProps {
  label: string;
  children: ReactNode;
  align?: 'center' | 'end';
}

export function LoginTip({ label, children, align = 'center' }: LoginTipProps) {
  return (
    <span className={align === 'end' ? 'lg-tip lg-tip--end' : 'lg-tip'} data-tip={label}>
      {children}
    </span>
  );
}
