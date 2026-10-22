import type { LoginInput, Me, SignupInput } from '@tablemates/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, refreshSession, setSessionExpiredHandler } from './api';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  /** `onboarding` is true right after sign-up, until the profile step is finished or skipped. */
  | { status: 'signedIn'; user: Me; onboarding: boolean };

interface AuthContextValue {
  state: AuthState;
  signIn: (input: LoginInput) => Promise<void>;
  signUp: (input: SignupInput) => Promise<void>;
  signOut: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  /** Replace the cached user after a profile edit. */
  setUser: (user: Me) => void;
  finishOnboarding: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const signedOut = useCallback(() => {
    queryClient.clear();
    setState({ status: 'signedOut', user: null });
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(signedOut);
    refreshSession().then((session) =>
      setState(session ? { status: 'signedIn', user: session.user, onboarding: false } : { status: 'signedOut', user: null }),
    );
  }, [signedOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn: async (input) => {
        const { user } = await api.login(input);
        setState({ status: 'signedIn', user, onboarding: false });
      },
      signUp: async (input) => {
        const { user } = await api.signup(input);
        setState({ status: 'signedIn', user, onboarding: true });
      },
      signOut: async () => {
        await api.logout();
        signedOut();
      },
      verifyEmail: async (code) => {
        const user = await api.verifyEmail(code);
        setState((s) => (s.status === 'signedIn' ? { ...s, user } : s));
      },
      setUser: (user) => setState((s) => ({ status: 'signedIn', user, onboarding: s.status === 'signedIn' && s.onboarding })),
      finishOnboarding: () => setState((s) => (s.status === 'signedIn' ? { ...s, onboarding: false } : s)),
    }),
    [state, signedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in user. Only call from screens behind the signed-in guard. */
export function useMe(): Me {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('useMe called while signed out');
  return state.user;
}
