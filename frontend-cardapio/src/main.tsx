import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Registra o Service Worker cedo, sem pedir NENHUMA permissão — isso é
// puramente técnico (nunca mostra prompt pro usuário). Precisa
// acontecer aqui, incondicional, e não só dentro de
// usePushNotifications (que só roda em telas específicas de
// notificação): o critério do Chrome/Android pra oferecer "Instalar
// app" exige um Service Worker já ATIVO controlando a página logo na
// primeira visita — esperar o cliente entrar na tela de notificações
// pra registrar seria tarde demais, ele nunca veria o prompt de
// instalação. Pedir permissão de notificação em si continua só a
// partir de gesto explícito do usuário, sem mudança nisso.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sem SW, o app ainda funciona normal como site — só não fica
      // instalável. Nunca quebra o carregamento por causa disso.
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
