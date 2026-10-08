import { useEffect, useRef, useState, useCallback } from 'react';

// Busca dados a cada `intervalMs` automaticamente. Usado no painel pra
// pedidos e chamados de garçom aparecerem "quase em tempo real" sem
// precisar de WebSocket agora — simples e suficiente pro volume de um
// restaurante pequeno/médio.
export function usePolling<T>(fetchFn: () => Promise<T>, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // BUG CORRIGIDO: antes o erro era engolido silenciosamente (try/finally
  // sem catch) — se a requisição falhasse, a tela mostrava exatamente o
  // mesmo estado de "nenhum dado ainda", sem diferença nenhuma pro usuário
  // entre "vazio de verdade" e "quebrou e não carregou".
  const [error, setError] = useState<unknown>(null);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const refetch = useCallback(async () => {
    try {
      const result = await fetchFnRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, intervalMs);
    return () => clearInterval(interval);
  }, [refetch, intervalMs]);

  return { data, isLoading, error, refetch };
}
