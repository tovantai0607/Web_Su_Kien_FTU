import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, api } from './api';
import type { AccountAccess } from '@ftu/shared';
import { useQueryClient } from '@tanstack/react-query';
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  recovery: boolean;
  error: string;
  access: AccountAccess | null;
  accessLoading: boolean;
  accessError: string;
  refreshAccess: () => void;
}>({
  user: null,
  loading: true,
  recovery: false,
  error: '',
  access: null,
  accessLoading: false,
  accessError: '',
  refreshAccess: () => {},
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [recovery, setRecovery] = useState(false),
    [error, setError] = useState('');
  const [access, setAccess] = useState<AccountAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(false),
    [accessError, setAccessError] = useState('');
  const [accessVersion, setAccessVersion] = useState(0);
  const refreshAccess = () => setAccessVersion((v) => v + 1);
  const userId = user?.id;
  const accessOwner = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (accessOwner.current !== userId) {
      setAccess(null);
      setAccessLoading(true);
    }
    setAccessError('');
    if (!userId) {
      accessOwner.current = undefined;
      setAccessLoading(false);
      return;
    }
    let active = true;
    void api<AccountAccess>('/me/access')
      .then((result) => {
        if (active) {
          accessOwner.current = userId;
          setAccess(result);
        }
      })
      .catch(() => {
        if (active) {
          setAccess(null);
          setAccessError('Không thể kiểm tra quyền. Hãy thử lại.');
        }
      })
      .finally(() => {
        if (active) setAccessLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, accessVersion]);
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
      setAccessVersion((v) => v + 1);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  return (
    <AuthContext.Provider
      value={{ user, loading, recovery, error, access, accessLoading, accessError, refreshAccess }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
