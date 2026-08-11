import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, IdCard, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField, Segmented } from '@/components/ui/Field';
import { Notice } from '@/components/ui/States';
import { Logo } from '@/components/layout/AppShell';
import { useAuth } from '@/store/AuthContext';
import { requestOtp } from '@/services/auth/authClient';

type Mode = 'otp' | 'password';

/**
 * Operator sign-in.
 *
 * Two modes because two very different people use it: a driver about to pull
 * out, holding a phone, who should never have to type a password; and a depot
 * manager at a desk who signs in once and stays there all day.
 */
export function OperatorLoginScreen() {
  const navigate = useNavigate();
  const { user, signInWithOtp, signInWithPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('otp');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={user.role === 'driver' ? '/driver' : '/admin'} replace />;

  const landing = (role: string) => (role === 'driver' ? '/driver' : '/admin');

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await requestOtp(identifier.trim());
      setSent(true);
      setDevCode(res.devCode ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a code');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'otp') await signInWithOtp(identifier.trim(), code.trim());
      else await signInWithPassword(identifier.trim(), password);

      // Read back from storage rather than the context, which has not re-rendered yet.
      const raw = localStorage.getItem('himgati.session');
      const role = raw ? (JSON.parse(raw).user.role as string) : 'driver';
      navigate(landing(role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader back={false} title="Staff sign in" subtitle="HRTC operations" />

      <ScreenBody className="pt-6">
        <Stack>
          <div className="flex flex-col items-center pb-2 text-center">
            <Logo size={44} />
            <h1 className="mt-3 font-display text-[20px] font-extrabold text-ink">HimGati Operations</h1>
            <p className="mt-1 max-w-[280px] text-[12.5px] leading-relaxed text-ink-3">
              For drivers, depot staff and the transport authority. Passengers do not need an
              account.
            </p>
          </div>

          <Segmented<Mode>
            value={mode}
            onChange={(m) => {
              setMode(m);
              setSent(false);
              setError(null);
            }}
            options={[
              { value: 'otp', label: 'Driver (OTP)' },
              { value: 'password', label: 'Depot / Admin' },
            ]}
          />

          <Card>
            <Stack gap={3}>
              <div>
                <label className="text-[12px] font-semibold text-ink-2">
                  {mode === 'otp' ? 'Employee ID or phone number' : 'Employee ID'}
                </label>
                <TextField
                  className="mt-1.5"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={mode === 'otp' ? 'HRTC-D-4021' : 'HRTC-ADMIN'}
                  icon={<IdCard size={17} strokeWidth={2.2} />}
                  autoCapitalize="characters"
                  disabled={sent}
                />
              </div>

              {mode === 'otp' && sent && (
                <div>
                  <label className="text-[12px] font-semibold text-ink-2">Six-digit code</label>
                  <TextField
                    className="mt-1.5"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    icon={<KeyRound size={17} strokeWidth={2.2} />}
                    inputClassName="tracking-[0.4em] font-mono text-[17px]"
                  />
                  {devCode && (
                    <Notice tone="info" className="mt-2">
                      Development build — no SMS gateway is wired up, so the code is{' '}
                      <span className="font-mono font-bold">{devCode}</span>.
                    </Notice>
                  )}
                </div>
              )}

              {mode === 'password' && (
                <div>
                  <label className="text-[12px] font-semibold text-ink-2">Password</label>
                  <TextField
                    className="mt-1.5"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    icon={<KeyRound size={17} strokeWidth={2.2} />}
                  />
                </div>
              )}

              {error && (
                <Notice tone="bad" icon={<AlertTriangle size={14} strokeWidth={2.4} />}>
                  {error}
                </Notice>
              )}

              {mode === 'otp' && !sent ? (
                <Button block size="lg" disabled={identifier.trim().length < 3 || busy} onClick={send}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} strokeWidth={2.3} />}
                  Send code
                </Button>
              ) : (
                <Button
                  block
                  size="lg"
                  disabled={busy || (mode === 'otp' ? code.length !== 6 : password.length < 1)}
                  onClick={submit}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} strokeWidth={2.3} />}
                  Sign in
                </Button>
              )}

              {mode === 'otp' && sent && (
                <button
                  onClick={() => {
                    setSent(false);
                    setCode('');
                  }}
                  className="text-[12.5px] font-semibold text-brand-600"
                >
                  Use a different ID
                </button>
              )}
            </Stack>
          </Card>

          <Notice tone="neutral">
            Demo accounts — driver <span className="font-mono">HRTC-D-4021</span> (OTP), admin{' '}
            <span className="font-mono">HRTC-ADMIN</span> /{' '}
            <span className="font-mono">himgati-admin-2026</span>.
          </Notice>
        </Stack>
      </ScreenBody>
    </Screen>
  );
}
