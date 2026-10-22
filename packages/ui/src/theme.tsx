import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ColorRoles } from './tokens';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: ColorRoles;
}

const ThemeContext = createContext<Theme | null>(null);

/** Provides the active color roles. `scheme` overrides the system setting. */
export function ThemeProvider({ scheme, children }: { scheme?: ColorScheme; children: ReactNode }) {
  const system = useColorScheme();
  const active: ColorScheme = scheme ?? (system === 'dark' ? 'dark' : 'light');
  const value = useMemo<Theme>(
    () => ({ scheme: active, colors: active === 'dark' ? darkColors : lightColors }),
    [active],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}
