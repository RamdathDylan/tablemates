import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { fontFamily, ThemeProvider, ToastProvider, useTheme } from '@tablemates/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Client errors (403, 404) won't fix themselves on retry.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <RootNavigator fontsLoaded={fontsLoaded} />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { state } = useAuth();
  const { colors, scheme } = useTheme();
  const ready = fontsLoaded && state.status !== 'loading';
  const signedIn = state.status === 'signedIn';
  const onboarding = signedIn && state.onboarding;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Navigation chrome (headers, tab bar) picks up the design system's colors.
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      },
    };
  }, [colors, scheme]);

  if (!ready) return null;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { fontFamily: fontFamily.bodySemibold },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}>
        {/* Each auth state leaves exactly one group available, so guard redirects are unambiguous. */}
        <Stack.Protected guard={signedIn && !onboarding}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="restaurant/[id]" options={{ title: '' }} />
          <Stack.Screen name="user/[username]" options={{ title: '' }} />
          <Stack.Protected guard={__DEV__}>
            <Stack.Screen name="(dev)/styleguide" options={{ title: 'Style guide' }} />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={onboarding}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </NavigationThemeProvider>
  );
}
