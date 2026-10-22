import { signupInput } from '@tablemates/shared';
import { Button, Input, space, Text } from '@tablemates/ui';
import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

import { AuthFrame } from '@/components/auth-frame';

type Field = 'displayName' | 'username' | 'email' | 'password';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [form, setForm] = useState<Record<Field, string>>({ displayName: '', username: '', email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field | 'form', string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const set = (field: Field) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  async function submit() {
    // Same schema the API uses, so messages match.
    const parsed = signupInput.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await signUp(parsed.data);
    } catch (err) {
      if (err instanceof ApiError) {
        const field = /username/i.test(err.message) ? 'username' : /email/i.test(err.message) ? 'email' : 'form';
        setErrors({ ...err.fieldErrors, [field]: err.message });
      } else {
        setErrors({ form: "Couldn't reach TableMates. Try again." });
      }
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame title="Join TableMates" subtitle="Track every restaurant. Share the good ones with friends.">
      <Input label="Your name" value={form.displayName} onChangeText={set('displayName')} autoComplete="name" error={errors.displayName} />
      <Input
        label="Username"
        value={form.username}
        onChangeText={set('username')}
        autoCapitalize="none"
        autoCorrect={false}
        helperText="Friends find you by this."
        error={errors.username}
      />
      <Input
        label="Email"
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={errors.email}
      />
      <Input
        label="Password"
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        helperText="At least 8 characters."
        error={errors.password}
        onSubmitEditing={submit}
      />
      {errors.form && (
        <Text tone="danger" role="alert">
          {errors.form}
        </Text>
      )}
      <Button title="Create account" onPress={submit} loading={submitting} fullWidth size="lg" />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[1] }}>
        <Text tone="muted">Already have an account?</Text>
        <Link href="/login" replace>
          <Text variant="bodyStrong" tone="primary">
            Log in
          </Text>
        </Link>
      </View>
    </AuthFrame>
  );
}
