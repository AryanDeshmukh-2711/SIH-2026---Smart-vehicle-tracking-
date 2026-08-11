import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  api,
  loginWithPassword,
  logout as doLogout,
  session,
  verifyOtp,
  type Role,
  type SessionUser,
} from '@/services/auth/authClient';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  signInWithOtp: (identifier: string, code: string) => Promise<void>;
  signInWithPassword: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => session.read()?.user ?? null);
  const [loading, setLoading] = useState(true);

  // A stored session may have been revoked server-side while the tab was shut,
  // so it is confirmed against /me rather than trusted on sight.
  useEffect(() => {
    if (!session.read()) {
      setLoading(false);
      return;
    }

    let alive = true;
    api
      .get<SessionUser>('/api/v1/auth/me')
      .then((me) => alive && setUser(me))
      .catch(() => {
        if (!alive) return;
        session.clear();
        setUser(null);
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, []);

  const signInWithOtp = useCallback(async (identifier: string, code: string) => {
    setUser(await verifyOtp(identifier, code));
  }, []);

  const signInWithPassword = useCallback(async (identifier: string, password: string) => {
    setUser(await loginWithPassword(identifier, password));
  }, []);

  const signOut = useCallback(async () => {
    await doLogout();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signInWithOtp, signInWithPassword, signOut }),
    [user, loading, signInWithOtp, signInWithPassword, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/**
 * Route guard.
 *
 * Client-side gating is a convenience, not a control — every one of these routes
 * is enforced again on the server, which is the only place it counts. This just
 * avoids showing someone a dashboard that would fail on every request.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-canvas">
        <span className="text-[13px] text-ink-3">Checking your session…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/operator/login" state={{ from: location.pathname }} replace />;

  if (!roles.includes(user.role)) {
    return <Navigate to={user.role === 'driver' ? '/driver' : '/'} replace />;
  }

  return <>{children}</>;
}
