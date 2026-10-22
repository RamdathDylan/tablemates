import { Button, fontFamily, Input, space, Text, useToast } from '@tablemates/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';

const RESEND_COOLDOWN_S = 60;

export default function VerifyEmailScreen() {
  const me = useMe();
  const { state, verifyEmail, signOut } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [verifying, setVerifying] = useState(false);
  // A code was just sent at sign-up; someone returning via login can resend right away.
  const justSignedUp = state.status === 'signedIn' && state.onboarding;
  const [cooldown, setCooldown] = useState(justSignedUp ? RESEND_COOLDOWN_S : 0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function submit(value = code) {
    if (!/^\d{6}$/.test(value)) return setError('Enter the 6-digit code from your email.');
    setError(undefined);
    setVerifying(true);
    try {
      await verifyEmail(value);
      toast('Email verified', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach TableMates. Try again.");
      setVerifying(false);
    }
  }

  async function resend() {
    try {
      await api.resendVerification();
      toast(`New code sent to ${me.email}`, 'success');
      setCooldown(RESEND_COOLDOWN_S);
      setCode('');
      setError(undefined);
    } catch (err) {
      // The server enforces the cooldown too; show its remaining time on the button.
      const wait = err instanceof ApiError ? Number(/Wait (\d+) seconds/.exec(err.message)?.[1]) : NaN;
      if (wait > 0) setCooldown(wait);
      else toast(err instanceof ApiError ? err.message : "Couldn't send a new code.", 'danger');
    }
  }

  return (
    <Screen documentTitle="Verify your email">
      <View style={{ gap: space[2], marginTop: space[10], marginBottom: space[2] }}>
        <Text variant="overline" tone="primary">
          Step 1 of 2
        </Text>
        <Text variant="display">Check your email</Text>
        <Text tone="muted">
          {justSignedUp ? 'We sent a 6-digit code to ' : 'Enter the 6-digit code we sent to '}
          <Text variant="bodyStrong">{me.email}</Text>. Codes expire after 15 minutes.
        </Text>
      </View>
      <Input
        label="Verification code"
        value={code}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
          // Submit as soon as the last digit lands, including from autofill.
          if (digits.length === 6 && !verifying) submit(digits);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        error={error}
        style={{ fontSize: 28, lineHeight: 36, letterSpacing: 8, fontFamily: fontFamily.bodySemibold }}
      />
      <Button title="Verify email" onPress={() => submit()} loading={verifying} fullWidth size="lg" />
      <Button
        title={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        variant="secondary"
        onPress={resend}
        disabled={cooldown > 0}
        fullWidth
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space[1] }}>
        <Text tone="muted">Wrong email?</Text>
        <Button title="Sign out" variant="ghost" size="sm" onPress={signOut} />
      </View>
    </Screen>
  );
}
