import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Program } from '@ftu/shared';
import { api } from './api';
export function useProgram() {
  return useQuery({
    queryKey: ['program'],
    queryFn: () => api<Program>('/program'),
    refetchInterval: 30000,
  });
}
export function useServerTime(iso?: string) {
  const anchor = useMemo(
    () => ({ server: iso ? Date.parse(iso) : null, mono: performance.now() }),
    [iso],
  );
  const [mono, setMono] = useState(performance.now());
  useEffect(() => {
    const id = setInterval(() => setMono(performance.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return anchor.server === null ? null : anchor.server + Math.max(0, mono - anchor.mono);
}
