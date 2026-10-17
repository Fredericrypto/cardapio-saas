import type { ReactNode } from 'react';
import { LoginBackdrop } from './LoginBackdrop';
import './login.css';

// Moldura de toda a tela de login do cliente: mesmo fundo do login do admin
// (degradê quente + fumacê + ícones de comida + escurecimento das bordas), sempre escuro.
export function LoginShell({ children }: { children: ReactNode }) {
  return (
    <div className="lg-root lg-root--fixedbg">
      <div className="lg-ambient" aria-hidden="true" />
      <LoginBackdrop />
      <div className="lg-vignette" aria-hidden="true" />
      {children}
    </div>
  );
}
