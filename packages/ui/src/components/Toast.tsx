import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { elevation, maxContentWidth, motion, radius, space } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ToastTone = 'neutral' | 'success' | 'danger';
interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

const icons: Record<ToastTone, IconName> = {
  neutral: 'information-circle',
  success: 'checkmark-circle',
  danger: 'alert-circle',
};

/** Hosts toasts at the bottom of the screen. Wrap the app once, below ThemeProvider. */
export function ToastProvider({ children, bottomInset = 0 }: { children: ReactNode; bottomInset?: number }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const nextId = useRef(0);

  const show = useCallback((message: string, tone: ToastTone = 'neutral') => {
    setToast({ id: nextId.current++, message, tone });
    // iOS VoiceOver has no live regions, so announce explicitly.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { bottom: bottomInset + space[6] }]}>
        {toast && <ToastView key={toast.id} toast={toast} onDone={() => setToast(null)} />}
      </View>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const seq = Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: motion.duration.base, useNativeDriver: true }),
      Animated.delay(3200),
      Animated.timing(anim, { toValue: 0, duration: motion.duration.base, useNativeDriver: true }),
    ]);
    seq.start(({ finished }) => finished && onDone());
    return () => seq.stop();
  }, [anim, onDone]);

  return (
    <Animated.View
      role={toast.tone === 'danger' ? 'alert' : 'status'}
      aria-live={toast.tone === 'danger' ? 'assertive' : 'polite'}
      style={[
        styles.toast,
        {
          backgroundColor: colors.text,
          boxShadow: elevation(2, colors.shadow),
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}>
      {/* Inverse color on the inverted surface; the icon shape carries the tone. */}
      <Icon name={icons[toast.tone]} size={20} color="textInverse" />
      <Text variant="label" tone="inverse" style={{ flexShrink: 1 }}>
        {toast.message}
      </Text>
    </Animated.View>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space[4], right: space[4], alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    maxWidth: maxContentWidth,
  },
});
