import { useCallback, useEffect, useState } from 'react';
import {
  getToken,
  getUser,
  setToken,
  setUser,
  clearAuth,
  type AuthUserInfo,
} from '../lib/api';

interface AuthState {
  user: AuthUserInfo | null;
  loading: boolean;
}

interface LoginResponse {
  token: string;
  user: AuthUserInfo;
  error?: string;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: getUser(), loading: false });

  // 启动时若有 token 但无用户信息，拉一次 /api/auth/me
  useEffect(() => {
    if (getToken() && !state.user) {
      setState((s) => ({ ...s, loading: true }));
      fetch('/api/auth/me')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          setUser(d.user);
          setState({ user: d.user, loading: false });
        })
        .catch(() => setState({ user: null, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = (await res.json()) as LoginResponse;
    if (!res.ok) return data.error || '登录失败';
    setToken(data.token);
    setUser(data.user);
    setState({ user: data.user, loading: false });
    return null;
  }, []);

  const register = useCallback(
    async (username: string, password: string, email?: string): Promise<string | null> => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email }),
      });
      const data = (await res.json()) as LoginResponse;
      if (!res.ok) return data.error || '注册失败';
      setToken(data.token);
      setUser(data.user);
      setState({ user: data.user, loading: false });
      return null;
    },
    []
  );

  const logout = useCallback(() => {
    clearAuth();
    setState({ user: null, loading: false });
    window.location.href = '/login';
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    isLoggedIn: !!state.user || !!getToken(),
    login,
    register,
    logout,
  };
}
