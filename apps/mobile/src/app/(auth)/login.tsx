import { Button, Input, space, Text } from '@tablemates/ui';
import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

import { AuthFrame } from '@/components/auth-frame';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(undefined);
    try {
      await signIn({ email, password });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach TableMates. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame title="Welcome back" subtitle="See where your friends have been eating.">
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
        error={error}
      />
      <Button title="Log in" onPress={submit} loading={submitting} disabled={!email || !password} fullWidth size="lg" />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[1] }}>
        <Text tone="muted">New here?</Text>
        <Link href="/signup" replace>
          <Text variant="bodyStrong" tone="primary">
            Create an account
          </Text>
        </Link>
      </View>
    </AuthFrame>
  );
}
