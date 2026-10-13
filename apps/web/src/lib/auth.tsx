import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './api';
import { useQueryClient } from '@tanstack/react-query';
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  recovery: boolean;
  error: string;
}>({
  user: null,
  loading: true,
  recovery: false,
  error: '',
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [recovery, setRecovery] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth
      .getSession()
      .then((r) => {
        if (!active) return;
        setUser(r.data.session?.user ?? null);
        if (r.error) setError('Liên kết hoặc phiên đã hết hạn. Vui lòng đăng nhập lại.');
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError('Không thể kiểm tra phiên. Vui lòng thử lại.');
          setLoading(false);
        }
      });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (session) setError('');
      if (event === 'SIGNED_OUT') setRecovery(false);
      if (event === 'SIGNED_OUT') client.clear();
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  return (
    <AuthContext.Provider value={{ user, loading, recovery, error }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
