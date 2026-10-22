import { space, Text } from '@tablemates/ui';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Screen } from '@/components/screen';

/** Shared frame for the login and sign-up screens. */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ gap: space[2], marginTop: space[10], marginBottom: space[4] }}>
          <Text variant="overline" tone="primary">
            TableMates
          </Text>
          <Text variant="display">{title}</Text>
          <Text tone="muted">{subtitle}</Text>
        </View>
        {children}
      </Screen>
    </KeyboardAvoidingView>
  );
}
