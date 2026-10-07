import { createContext, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../api/client.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => get('/auth/me'), retry: false, staleTime: Infinity });
  const onIn = (u) => { qc.clear(); qc.setQueryData(['me'], u); };
  const login = useMutation({ mutationFn: (b) => post('/auth/login', b), onSuccess: onIn });
  const register = useMutation({ mutationFn: (b) => post('/auth/register', b), onSuccess: onIn });
  const logout = useMutation({ mutationFn: () => post('/auth/logout'), onSuccess: () => { qc.clear(); qc.setQueryData(['me'], null); } });
  const value = { user: me.data ?? null, loading: me.isLoading, login, register, logout };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
