import { useEffect, useState } from 'react';

// Relógio que vira EXATAMENTE na virada de cada minuto (o horário de
// funcionamento tem resolução de minuto, então nada muda entre uma virada e a
// próxima). Reavalia também quando a aba volta a ficar visível, porque
// temporizadores são atrasados em segundo plano.
// Cópia idêntica em frontend-admin e frontend-cardapio.
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const current = new Date();
      const msToNextMinute = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds());
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msToNextMinute + 50);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return now;
}
